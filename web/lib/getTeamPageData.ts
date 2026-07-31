import { createAnonServerClient } from "@/lib/supabase/server";
import { SUPPORTED_SEASONS } from "@/lib/teamsStatic";

export type TeamWeeklyStat = {
  week: number;
  pass_block_score: number | null;
  pass_block_grade: string | null;
  run_block_score: number | null;
  run_block_grade: string | null;
  overall_score: number | null;
  overall_grade: string | null;
};

export type TeamLeagueAverage = {
  week: number;
  avg_overall_score: number | null;
  avg_pass_block_score: number | null;
  avg_run_block_score: number | null;
};

export type TeamSeasonHistoryEntry = {
  season: number;
  overall_score: number | null;
  overall_grade: string | null;
};

export type TeamFreeAgencyMove = {
  direction: "gained" | "lost";
  player_id: string;
  player_name: string;
  other_team_abbr: string | null;
  best_season: number;
  best_season_snaps: number;
};

export type TeamPageData = {
  team: {
    team_abbr: string;
    team_name: string;
    team_nickname: string;
    slug: string;
    conference: string;
    division: string;
    logo_url: string | null;
    primary_color: string | null;
  };
  stats: {
    week: number;
    games_played: number;
    sacks_allowed: number;
    sacks_allowed_rank: number | null;
    pressure_rate_allowed: number | null;
    pressure_rate_allowed_rank: number | null;
    stuff_rate: number | null;
    stuff_rate_rank: number | null;
    yards_before_contact_per_att: number | null;
    yards_before_contact_per_att_rank: number | null;
    pass_block_score: number | null;
    pass_block_score_rank: number | null;
    pass_block_grade: string | null;
    run_block_score: number | null;
    run_block_score_rank: number | null;
    run_block_grade: string | null;
    overall_score: number | null;
    overall_score_rank: number | null;
    overall_grade: string | null;
  } | null;
  weeklyStats: TeamWeeklyStat[];
  leagueAverages: TeamLeagueAverage[];
  seasonHistory: TeamSeasonHistoryEntry[];
  depthChart: {
    position: string;
    depth_rank: number;
    player_id: string | null;
    player_name: string;
    snaps: number | null;
    honors: string[];
  }[];
  freeAgencyGained: TeamFreeAgencyMove[];
  freeAgencyLost: TeamFreeAgencyMove[];
  injuries: { player_name: string; position: string | null; status: string | null; injury_description: string | null }[];
  espnTeamRates: {
    pass_block_win_rate: number | null;
    pass_block_win_rate_rank: number | null;
    run_block_win_rate: number | null;
    run_block_win_rate_rank: number | null;
  } | null;
};

/** Assembles everything one team page needs, in a handful of parallel
 * queries. Returns null if the slug doesn't match a real team. */
export async function getTeamPageData(slug: string, season: number): Promise<TeamPageData | null> {
  const supabase = createAnonServerClient();

  const { data: team } = await supabase
    .from("teams")
    .select("team_abbr, team_name, team_nickname, slug, conference, division, logo_url, primary_color")
    .eq("slug", slug)
    .maybeSingle();

  if (!team) return null;

  const [
    { data: statsRows },
    { data: weeklyStatsRows },
    { data: depthChart },
    { data: freeAgencyMoves },
    { data: injuries },
    { data: honors },
    leagueStats,
    leagueEspnRates,
    leagueAverages,
    seasonHistory,
  ] = await Promise.all([
      supabase
        .from("team_ol_stats")
        .select(
          "week, games_played, sacks_allowed, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att, pass_block_score, pass_block_grade, run_block_score, run_block_grade, overall_score, overall_grade"
        )
        .eq("team_abbr", team.team_abbr)
        .eq("season", season)
        .order("week", { ascending: false })
        .limit(1),
      // Full-season history for the grade trend chart -- unlike the query
      // above (latest week only), this keeps every week so the chart can
      // plot the whole season.
      supabase
        .from("team_ol_stats")
        .select("week, pass_block_score, pass_block_grade, run_block_score, run_block_grade, overall_score, overall_grade")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season)
        .order("week", { ascending: true }),
      supabase
        .from("ol_depth_chart")
        .select("position, depth_rank, player_id, player_name, snaps")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season),
      supabase
        .from("ol_free_agency_moves")
        .select("direction, player_id, player_name, other_team_abbr, best_season, best_season_snaps")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season),
      supabase
        .from("injuries")
        .select("player_name, position, status, injury_description")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season),
      supabase
        .from("player_honors")
        .select("player_name, honor")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season),
      getLeagueStatRanks(supabase, season, team.team_abbr),
      getLeagueEspnRanks(supabase, season, team.team_abbr),
      getLeagueWeeklyAverages(supabase, season),
      getSeasonHistory(supabase, team.team_abbr),
    ]);

  const positionOrder = ["LT", "LG", "C", "RG", "RT"];
  const rawStats = statsRows?.[0] ?? null;

  const honorsByPlayer = new Map<string, string[]>();
  for (const h of honors ?? []) {
    const existing = honorsByPlayer.get(h.player_name) ?? [];
    existing.push(h.honor);
    honorsByPlayer.set(h.player_name, existing);
  }

  return {
    team,
    stats: rawStats
      ? {
          ...rawStats,
          sacks_allowed_rank: leagueStats?.sacks_allowed_rank ?? null,
          pressure_rate_allowed_rank: leagueStats?.pressure_rate_allowed_rank ?? null,
          stuff_rate_rank: leagueStats?.stuff_rate_rank ?? null,
          yards_before_contact_per_att_rank: leagueStats?.yards_before_contact_per_att_rank ?? null,
          pass_block_score_rank: leagueStats?.pass_block_score_rank ?? null,
          run_block_score_rank: leagueStats?.run_block_score_rank ?? null,
          overall_score_rank: leagueStats?.overall_score_rank ?? null,
        }
      : null,
    weeklyStats: weeklyStatsRows ?? [],
    leagueAverages,
    seasonHistory,
    depthChart: (depthChart ?? [])
      .map((row) => ({ ...row, honors: honorsByPlayer.get(row.player_name) ?? [] }))
      .sort(
        (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position) || a.depth_rank - b.depth_rank
      ),
    freeAgencyGained: (freeAgencyMoves ?? [])
      .filter((m) => m.direction === "gained")
      .sort((a, b) => b.best_season_snaps - a.best_season_snaps),
    freeAgencyLost: (freeAgencyMoves ?? [])
      .filter((m) => m.direction === "lost")
      .sort((a, b) => b.best_season_snaps - a.best_season_snaps),
    injuries: injuries ?? [],
    espnTeamRates: leagueEspnRates,
  };
}

/** Rank helper shared by both league-comparison functions below: given a
 * value and a way to read that same field off every other team, returns
 * how many teams did strictly better + 1. Ties share a rank (e.g. two
 * teams tied for the league's fewest sacks are both "1st"). `null` in
 * means the team itself doesn't have that stat, so there's nothing to
 * rank -- returns null rather than a misleading number. */
function rankAgainst<T>(
  value: number | null,
  all: T[],
  getField: (row: T) => number | null,
  higherIsBetter: boolean
): number | null {
  if (value === null) return null;
  const betterCount = all.filter((row) => {
    const v = getField(row);
    if (v === null) return false;
    return higherIsBetter ? v > value : v < value;
  }).length;
  return betterCount + 1;
}

type LeagueStatsRow = {
  team_abbr: string;
  week: number;
  sacks_allowed: number;
  pressure_rate_allowed: number | null;
  stuff_rate: number | null;
  yards_before_contact_per_att: number | null;
  pass_block_score: number | null;
  run_block_score: number | null;
  overall_score: number | null;
};

/** Ranks a team's automated Pass Pro / Run Game ingredient stats, plus its
 * three blended grade scores, against every other team's latest week that
 * season. Sacks/pressure/stuff are "lower is better"; yards before contact
 * and the three grade scores are "higher is better". */
async function getLeagueStatRanks(
  supabase: ReturnType<typeof createAnonServerClient>,
  season: number,
  teamAbbr: string
): Promise<{
  sacks_allowed_rank: number | null;
  pressure_rate_allowed_rank: number | null;
  stuff_rate_rank: number | null;
  yards_before_contact_per_att_rank: number | null;
  pass_block_score_rank: number | null;
  run_block_score_rank: number | null;
  overall_score_rank: number | null;
} | null> {
  const { data: rows } = await supabase
    .from("team_ol_stats")
    .select(
      "team_abbr, week, sacks_allowed, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att, pass_block_score, run_block_score, overall_score"
    )
    .eq("season", season);
  if (!rows || rows.length === 0) return null;

  const latestByTeam = new Map<string, LeagueStatsRow>();
  for (const row of rows) {
    const existing = latestByTeam.get(row.team_abbr);
    if (!existing || row.week > existing.week) latestByTeam.set(row.team_abbr, row);
  }

  const target = latestByTeam.get(teamAbbr);
  if (!target) return null;

  const all = [...latestByTeam.values()];
  return {
    sacks_allowed_rank: rankAgainst(target.sacks_allowed, all, (r) => r.sacks_allowed, false),
    pressure_rate_allowed_rank: rankAgainst(target.pressure_rate_allowed, all, (r) => r.pressure_rate_allowed, false),
    stuff_rate_rank: rankAgainst(target.stuff_rate, all, (r) => r.stuff_rate, false),
    yards_before_contact_per_att_rank: rankAgainst(
      target.yards_before_contact_per_att,
      all,
      (r) => r.yards_before_contact_per_att,
      true
    ),
    pass_block_score_rank: rankAgainst(target.pass_block_score, all, (r) => r.pass_block_score, true),
    run_block_score_rank: rankAgainst(target.run_block_score, all, (r) => r.run_block_score, true),
    overall_score_rank: rankAgainst(target.overall_score, all, (r) => r.overall_score, true),
  };
}

/** League-wide average of each blended grade score, per week -- feeds the
 * trend chart's "league average" reference line. Nulls (a team with no
 * grade yet that week) are excluded from that week's average rather than
 * counted as 0. */
async function getLeagueWeeklyAverages(
  supabase: ReturnType<typeof createAnonServerClient>,
  season: number
): Promise<TeamLeagueAverage[]> {
  const { data: rows } = await supabase
    .from("team_ol_stats")
    .select("week, overall_score, pass_block_score, run_block_score")
    .eq("season", season);

  const totals = new Map<
    number,
    { overallSum: number; overallCount: number; passSum: number; passCount: number; runSum: number; runCount: number }
  >();
  for (const row of rows ?? []) {
    const entry = totals.get(row.week) ?? { overallSum: 0, overallCount: 0, passSum: 0, passCount: 0, runSum: 0, runCount: 0 };
    if (row.overall_score !== null) {
      entry.overallSum += row.overall_score;
      entry.overallCount += 1;
    }
    if (row.pass_block_score !== null) {
      entry.passSum += row.pass_block_score;
      entry.passCount += 1;
    }
    if (row.run_block_score !== null) {
      entry.runSum += row.run_block_score;
      entry.runCount += 1;
    }
    totals.set(row.week, entry);
  }

  return [...totals.entries()]
    .map(([week, t]) => ({
      week,
      avg_overall_score: t.overallCount > 0 ? t.overallSum / t.overallCount : null,
      avg_pass_block_score: t.passCount > 0 ? t.passSum / t.passCount : null,
      avg_run_block_score: t.runCount > 0 ? t.runSum / t.runCount : null,
    }))
    .sort((a, b) => a.week - b.week);
}

/** One team's Overall grade at the latest week of every supported season --
 * feeds the season-over-season history strip. Seasons with no data yet
 * (e.g. before this team's pipeline history starts) come back as nulls
 * rather than being omitted, so the strip always shows one chip per
 * SUPPORTED_SEASON. */
async function getSeasonHistory(
  supabase: ReturnType<typeof createAnonServerClient>,
  teamAbbr: string
): Promise<TeamSeasonHistoryEntry[]> {
  const { data: rows } = await supabase
    .from("team_ol_stats")
    .select("season, week, overall_score, overall_grade")
    .eq("team_abbr", teamAbbr);

  const latestBySeason = new Map<number, { season: number; week: number; overall_score: number | null; overall_grade: string | null }>();
  for (const row of rows ?? []) {
    const existing = latestBySeason.get(row.season);
    if (!existing || row.week > existing.week) latestBySeason.set(row.season, row);
  }

  return SUPPORTED_SEASONS.map((season) => {
    const row = latestBySeason.get(season);
    return { season, overall_score: row?.overall_score ?? null, overall_grade: row?.overall_grade ?? null };
  });
}

type LeagueEspnRow = { team_abbr: string; pass_block_win_rate: number | null; run_block_win_rate: number | null };

/** Same idea as getLeagueStatRanks, but for the manually-entered ESPN
 * win rates -- both "higher is better", and only ranked against whichever
 * teams have ESPN data entered so far (teams without it just don't count
 * toward the comparison). */
async function getLeagueEspnRanks(
  supabase: ReturnType<typeof createAnonServerClient>,
  season: number,
  teamAbbr: string
): Promise<TeamPageData["espnTeamRates"]> {
  const { data: rows } = await supabase
    .from("espn_team_block_win_rates")
    .select("team_abbr, pass_block_win_rate, run_block_win_rate")
    .eq("season", season);
  const all: LeagueEspnRow[] = rows ?? [];

  const target = all.find((r) => r.team_abbr === teamAbbr);
  if (!target) return null;

  return {
    pass_block_win_rate: target.pass_block_win_rate,
    pass_block_win_rate_rank: rankAgainst(target.pass_block_win_rate, all, (r) => r.pass_block_win_rate, true),
    run_block_win_rate: target.run_block_win_rate,
    run_block_win_rate_rank: rankAgainst(target.run_block_win_rate, all, (r) => r.run_block_win_rate, true),
  };
}
