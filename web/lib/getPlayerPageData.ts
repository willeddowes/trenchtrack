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
  /** Sum of injuryHistory[].weeksOut -- career total, shown as the card's headline stat. */
  totalWeeksOut: number;
};

const POSITION_GROUP: Record<string, "OT" | "OG" | "C"> = {
  LT: "OT",
  RT: "OT",
  LG: "OG",
  RG: "OG",
  C: "C",
};

/** Assembles everything one player page needs. Unlike getTeamPageData, this
 * isn't scoped to a single season -- ol_depth_chart rows for this player_id
 * span every season/team they logged snaps for, which is the point (a
 * career view, not a current-roster snapshot). Returns null if player_id
 * doesn't match any depth-chart row at all (an invalid/stale URL). */
export async function getPlayerPageData(playerId: string): Promise<PlayerPageData | null> {
  const supabase = createAnonServerClient();

  const [{ data: player }, { data: careerRows }, { data: honors }, { data: combine }, { data: archetype }, { data: injuryRows }] = await Promise.all([
    // Nullable on purpose: retired/departed players have career rows below
    // but no row here, since `players` only ever holds the current roster.
    supabase
      .from("players")
      .select(
        "player_id, full_name, position, team_abbr, headshot_url, height, weight, college, draft_year, draft_round, draft_pick, draft_team, rookie_season"
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
  const totalWeeksOut = injuryHistory.reduce((sum, entry) => sum + entry.weeksOut, 0);

  return {
    player,
    displayName,
    combine: combine ?? null,
    allTimeHonors: (honors ?? []).map((h) => h.honor),
    archetype: archetype ?? null,
    primaryPosition,
    injuryHistory,
    totalWeeksOut,
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
      };
    }),
  };
}
