import { createAnonServerClient } from "@/lib/supabase/server";

export type PlayerCareerRow = {
  season: number;
  team_abbr: string;
  team_name: string;
  team_slug: string;
  team_logo_url: string | null;
  position: string;
  depth_rank: number;
  snaps: number;
  honors: string[];
  /** APY ($ millions) of whichever contract was covering this season, from
   * player_contracts -- null if no contract on file covers it (a season
   * before nflreadpy/OTC's coverage starts, or a gap in the source data). */
  contract_apy: number | null;
};

export type CurrentContract = {
  yearsSigned: number | null;
  totalValue: number | null;
  apy: number;
  yearSigned: number;
  /** Rank by APY among every other CURRENT contract at the same position
   * GROUP league-wide (OT/OG/C, not the raw LT/RT/LG/RG/C split) -- 1 =
   * highest-paid at that group. Null if no other current contracts exist
   * to rank against (shouldn't happen in practice). */
  positionRank: number | null;
  /** True when this contract was signed the same year the player entered
   * the league (draft_year, or rookie_season for an undrafted player) --
   * i.e. still on their original rookie-scale deal, not an extension. */
  isRookieContract: boolean;
  /** True when apy above is a first-round pick's exercised 5th-year option
   * salary rather than the base 4-year rookie deal's average -- takes
   * priority over isRookieContract for display (still rookie-scale money,
   * but a different label: "5th year opt." not "Rookie"). */
  isFifthYearOption: boolean;
};

export type PlayerInjuryEntry = {
  season: number;
  injuryDescription: string | null;
  weeksOut: number;
};

export type PlayerCombine = {
  arm_length: number | null;
  hand_size: number | null;
  wingspan: number | null;
  forty: number | null;
  bench: number | null;
  vertical: number | null;
  broad_jump: number | null;
  cone: number | null;
  shuttle: number | null;
  arm_length_percentile: number | null;
  hand_size_percentile: number | null;
  wingspan_percentile: number | null;
  forty_percentile: number | null;
  bench_percentile: number | null;
  vertical_percentile: number | null;
  broad_jump_percentile: number | null;
  cone_percentile: number | null;
  shuttle_percentile: number | null;
};

export type PlayerPageData = {
  player: {
    player_id: string;
    full_name: string;
    position: string | null;
    team_abbr: string | null;
    headshot_url: string | null;
    height: number | null;
    weight: number | null;
    college: string | null;
    draft_year: number | null;
    draft_round: number | null;
    draft_pick: number | null;
    draft_team: string | null;
    rookie_season: number | null;
  } | null;
  /** Computed from players.birth_date at request time (not stored) so it's
   * always current -- null for a retired/departed player (no `players`
   * row at all) or the rare current player nflreadpy has no birth date
   * for. */
  age: number | null;
  displayName: string;
  career: PlayerCareerRow[];
  combine: PlayerCombine | null;
  /** Every honor this player_id has ever earned, independent of whether a
   * matching ol_depth_chart row exists for that season -- career.honors
   * below only surfaces a honor if there's a season row to attach it to,
   * which silently drops any honor from before ol_depth_chart's 2021
   * coverage starts (e.g. a 2015 Pro Bowl for someone who debuted then).
   * Career-total counts in the UI should read from this field, not by
   * flattening career[].honors. */
  allTimeHonors: string[];
  archetype: { archetype: string; reasons: string[] } | null;
  /** Specific position (OT/OG/C) for the header badge -- `players.position`
   * only ever stores the generic "OL" for offensive linemen (nflreadpy
   * roster data doesn't break it down further), so this is derived instead
   * from ol_depth_chart's per-season LT/RT/LG/RG/C rows: whichever of
   * OT/OG/C group has the most total career snaps. */
  primaryPosition: "OT" | "OG" | "C" | null;
  /** Most recent team's logo, for the header -- career[0] rather than a
   * separate query, since careerRows is already ordered by season
   * descending and this needs to work the same for active players (whose
   * latest row is their current team) and retired ones (whose latest row
   * is their final team). */
  currentTeamLogoUrl: string | null;
  /** Grouped by (season, injury_description) -- player_injury_reports only
   * stores weeks a player was ruled OUT (see that table's comment in
   * schema.sql), so each entry here is a real missed-game count, not just
   * a report appearance. Sorted most recent season first. */
  injuryHistory: PlayerInjuryEntry[];
  currentContract: CurrentContract | null;
};

const POSITION_GROUP: Record<string, "OT" | "OG" | "C"> = {
  LT: "OT",
  RT: "OT",
  LG: "OG",
  RG: "OG",
  C: "C",
};

const POSITION_GROUP_MEMBERS: Record<"OT" | "OG" | "C", string[]> = {
  OT: ["LT", "RT"],
  OG: ["LG", "RG"],
  C: ["C"],
};

/** Assembles everything one player page needs. Unlike getTeamPageData, this
 * isn't scoped to a single season -- ol_depth_chart rows for this player_id
 * span every season/team they logged snaps for, which is the point (a
 * career view, not a current-roster snapshot). Returns null if player_id
 * doesn't match any depth-chart row at all (an invalid/stale URL). */
export async function getPlayerPageData(playerId: string): Promise<PlayerPageData | null> {
  const supabase = createAnonServerClient();

  const [{ data: player }, { data: careerRows }, { data: honors }, { data: combine }, { data: archetype }, { data: injuryRows }, { data: contractRows }] = await Promise.all([
    // Nullable on purpose: retired/departed players have career rows below
    // but no row here, since `players` only ever holds the current roster.
    supabase
      .from("players")
      .select(
        "player_id, full_name, position, team_abbr, headshot_url, height, weight, college, draft_year, draft_round, draft_pick, draft_team, rookie_season, birth_date"
      )
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .from("ol_depth_chart")
      .select("season, position, depth_rank, snaps, player_name, teams(team_abbr, team_name, slug, logo_url)")
      .eq("player_id", playerId)
      .order("season", { ascending: false }),
    supabase.from("player_honors").select("season, team_abbr, honor").eq("player_id", playerId),
    // Nullable: combine/pro-day data only exists for players matched by the
    // pipeline's pull_combine.py or the one-off mockdraftable scrape.
    supabase
      .from("player_combine")
      .select(
        "arm_length, hand_size, wingspan, forty, bench, vertical, broad_jump, cone, shuttle, arm_length_percentile, hand_size_percentile, wingspan_percentile, forty_percentile, bench_percentile, vertical_percentile, broad_jump_percentile, cone_percentile, shuttle_percentile"
      )
      .eq("player_id", playerId)
      .maybeSingle(),
    // Nullable: only players the classifier could categorize have a row
    // (see compute_player_archetypes.py) -- some players have no archetype.
    supabase.from("player_archetypes").select("archetype, reasons").eq("player_id", playerId).maybeSingle(),
    // Empty for most players most seasons (healthy) -- see player_injury_reports'
    // comment in schema.sql for why this is Out-only, not every report appearance.
    supabase
      .from("player_injury_reports")
      .select("season, week, injury_description")
      .eq("player_id", playerId)
      .order("season", { ascending: false })
      .order("week", { ascending: true }),
    // Nullable: only players nflreadpy/OTC has contract data for. Every
    // contract this player has ever signed, not just the current one --
    // see player_contracts' comment in schema.sql.
    supabase
      .from("player_contracts")
      .select("position, year_signed, years, total_value, apy, is_current, fifth_year_option_season, fifth_year_option_apy")
      .eq("player_id", playerId)
      .order("year_signed", { ascending: true }),
  ]);

  if (!careerRows || careerRows.length === 0) return null;

  const honorsByKey = new Map<string, string[]>();
  for (const h of honors ?? []) {
    const key = `${h.season}:${h.team_abbr}`;
    const existing = honorsByKey.get(key) ?? [];
    existing.push(h.honor);
    honorsByKey.set(key, existing);
  }

  // Player's display name: prefer the current-roster `players` row, falling
  // back to whatever name ol_depth_chart recorded (retired players).
  const displayName = player?.full_name ?? careerRows[0].player_name;

  const age = (() => {
    if (!player?.birth_date) return null;
    const birth = new Date(player.birth_date);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasHadBirthdayThisYear) years -= 1;
    return years;
  })();

  const snapsByGroup = new Map<"OT" | "OG" | "C", number>();
  for (const row of careerRows) {
    const group = POSITION_GROUP[row.position];
    if (!group) continue;
    snapsByGroup.set(group, (snapsByGroup.get(group) ?? 0) + (row.snaps ?? 0));
  }
  let primaryPosition: "OT" | "OG" | "C" | null = null;
  let bestSnaps = -1;
  for (const [group, snaps] of snapsByGroup) {
    if (snaps > bestSnaps) {
      bestSnaps = snaps;
      primaryPosition = group;
    }
  }

  // Group into one entry per (season, injury_description) -- e.g. a player
  // out weeks 3/4/6/11/13 of the same season with a lingering knee issue
  // reads as one "2016 · Knee · 5 weeks" line, not five separate rows.
  // Grouping by exact week-adjacency instead would fragment a single
  // recurring injury into several near-meaningless 1-2 week entries.
  const injuryGroups = new Map<string, PlayerInjuryEntry>();
  for (const row of injuryRows ?? []) {
    const key = `${row.season}:${row.injury_description ?? ""}`;
    const existing = injuryGroups.get(key);
    if (existing) {
      existing.weeksOut += 1;
    } else {
      injuryGroups.set(key, { season: row.season, injuryDescription: row.injury_description, weeksOut: 1 });
    }
  }
  const injuryHistory = [...injuryGroups.values()].sort((a, b) => b.season - a.season);

  // Current contract + its league-wide positional rank (OT/OG/C group, not
  // the raw LT/RT/LG/RG/C split -- matches primaryPosition's grouping).
  const currentContractRow = (contractRows ?? []).find((r) => r.is_current);
  let currentContract: CurrentContract | null = null;
  if (currentContractRow) {
    // A 5th-year option row's real current pay is the option salary, not
    // the base 4-year rookie deal's average -- see fifth_year_option_season's
    // comment in schema.sql.
    const effectiveApy = currentContractRow.fifth_year_option_apy ?? currentContractRow.apy;
    const group = POSITION_GROUP[currentContractRow.position ?? ""];
    let positionRank: number | null = null;
    if (group) {
      const { data: peers } = await supabase
        .from("player_contracts")
        .select("apy, fifth_year_option_apy")
        .eq("is_current", true)
        .in("position", POSITION_GROUP_MEMBERS[group]);
      const betterCount = (peers ?? []).filter((p) => (p.fifth_year_option_apy ?? p.apy) > effectiveApy).length;
      positionRank = betterCount + 1;
    }
    // Rookie-scale deal = signed the same year they entered the league --
    // draft_year for a drafted player, rookie_season for an undrafted one
    // (their first real contract still counts as a "rookie deal" even
    // without a draft slot attached to it).
    const entryYear = player?.draft_year ?? player?.rookie_season ?? null;
    currentContract = {
      yearsSigned: currentContractRow.years,
      totalValue: currentContractRow.total_value,
      apy: effectiveApy,
      yearSigned: currentContractRow.year_signed,
      positionRank,
      isRookieContract: entryYear !== null && currentContractRow.year_signed === entryYear,
      isFifthYearOption: currentContractRow.fifth_year_option_apy != null,
    };
  }

  // For a career row's season, find whichever contract's [year_signed,
  // year_signed+years) window covers it -- the latest-signed one that
  // qualifies, in case of an overlap. A season matching some contract's
  // fifth_year_option_season gets that specific option-year salary instead
  // of the base window's average, real number over an estimate.
  function apyForSeason(season: number): number | null {
    for (const c of contractRows ?? []) {
      if (c.fifth_year_option_season === season && c.fifth_year_option_apy != null) return c.fifth_year_option_apy;
    }
    let best: { year_signed: number; apy: number } | null = null;
    for (const c of contractRows ?? []) {
      const span = c.years ?? 1;
      if (season >= c.year_signed && season < c.year_signed + span) {
        if (!best || c.year_signed > best.year_signed) best = { year_signed: c.year_signed, apy: c.apy };
      }
    }
    return best?.apy ?? null;
  }

  return {
    player,
    age,
    displayName,
    combine: combine ?? null,
    allTimeHonors: (honors ?? []).map((h) => h.honor),
    archetype: archetype ?? null,
    primaryPosition,
    injuryHistory,
    currentContract,
    currentTeamLogoUrl: (() => {
      const team = Array.isArray(careerRows[0].teams) ? careerRows[0].teams[0] : careerRows[0].teams;
      return team?.logo_url ?? null;
    })(),
    career: careerRows.map((row) => {
      // Supabase's JS client types embedded relations as arrays even for
      // a to-one join -- it's always exactly one team here.
      const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
      return {
        season: row.season,
        team_abbr: team?.team_abbr ?? "",
        team_name: team?.team_name ?? "",
        team_slug: team?.slug ?? "",
        team_logo_url: team?.logo_url ?? null,
        position: row.position,
        depth_rank: row.depth_rank,
        snaps: row.snaps,
        honors: honorsByKey.get(`${row.season}:${team?.team_abbr}`) ?? [],
        contract_apy: apyForSeason(row.season),
      };
    }),
  };
}
