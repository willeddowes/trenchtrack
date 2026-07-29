import { createAnonServerClient } from "@/lib/supabase/server";

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
    pass_block_grade: string | null;
    run_block_score: number | null;
    run_block_grade: string | null;
    overall_score: number | null;
    overall_grade: string | null;
  } | null;
  starters: { position: string; player_name: string }[];
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

  const [{ data: statsRows }, { data: starters }, { data: injuries }, leagueStats, leagueEspnRates] =
    await Promise.all([
      supabase
        .from("team_ol_stats")
        .select(
          "week, games_played, sacks_allowed, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att, pass_block_score, pass_block_grade, run_block_score, run_block_grade, overall_score, overall_grade"
        )
        .eq("team_abbr", team.team_abbr)
        .eq("season", season)
        .order("week", { ascending: false })
        .limit(1),
      supabase
        .from("ol_starters")
        .select("position, player_name")
        .eq("team_abbr", team.team_abbr),
      supabase
        .from("injuries")
        .select("player_name, position, status, injury_description")
        .eq("team_abbr", team.team_abbr)
        .eq("season", season),
      getLeagueStatRanks(supabase, season, team.team_abbr),
      getLeagueEspnRanks(supabase, season, team.team_abbr),
    ]);

  const positionOrder = ["LT", "LG", "C", "RG", "RT"];
  const rawStats = statsRows?.[0] ?? null;

  return {
    team,
    stats: rawStats
      ? {
          ...rawStats,
          sacks_allowed_rank: leagueStats?.sacks_allowed_rank ?? null,
          pressure_rate_allowed_rank: leagueStats?.pressure_rate_allowed_rank ?? null,
          stuff_rate_rank: leagueStats?.stuff_rate_rank ?? null,
          yards_before_contact_per_att_rank: leagueStats?.yards_before_contact_per_att_rank ?? null,
        }
      : null,
    starters: (starters ?? []).sort(
      (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position)
    ),
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
};

/** Ranks a team's automated Pass Pro / Run Game ingredient stats against
 * every other team's latest week that season. Sacks/pressure/stuff are
 * "lower is better"; yards before contact is "higher is better". */
async function getLeagueStatRanks(
  supabase: ReturnType<typeof createAnonServerClient>,
  season: number,
  teamAbbr: string
): Promise<{
  sacks_allowed_rank: number | null;
  pressure_rate_allowed_rank: number | null;
  stuff_rate_rank: number | null;
  yards_before_contact_per_att_rank: number | null;
} | null> {
  const { data: rows } = await supabase
    .from("team_ol_stats")
    .select("team_abbr, week, sacks_allowed, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att")
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
  };
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
