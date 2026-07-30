import { createAnonServerClient } from "@/lib/supabase/server";

export type TeamStatsRow = {
  team_abbr: string;
  team_name: string;
  team_nickname: string;
  slug: string;
  logo_url: string | null;

  overall_score: number | null;
  overall_grade: string | null;
  pass_block_score: number | null;
  pass_block_grade: string | null;
  run_block_score: number | null;
  run_block_grade: string | null;

  sacks_allowed: number | null;
  pressure_rate_allowed: number | null;
  stuff_rate: number | null;
  yards_before_contact_per_att: number | null;

  espn_pass_block_win_rate: number | null;
  espn_run_block_win_rate: number | null;
};

/** Three queries total, not 32 -- teams, the whole season's team_ol_stats
 * (reduced to each team's latest week), and the whole season's ESPN win
 * rates, joined by team_abbr in JS. Same shape as getHomepageData.ts and
 * getTeamPageData.ts's league-ranking helpers. */
export async function getTeamStatsTableData(season: number): Promise<TeamStatsRow[]> {
  const supabase = createAnonServerClient();

  const [{ data: teams }, { data: statsRows }, { data: espnRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("team_abbr, team_name, team_nickname, slug, logo_url")
      .order("team_name"),
    supabase
      .from("team_ol_stats")
      .select(
        "team_abbr, week, overall_score, overall_grade, pass_block_score, pass_block_grade, run_block_score, run_block_grade, sacks_allowed, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att"
      )
      .eq("season", season),
    supabase
      .from("espn_team_block_win_rates")
      .select("team_abbr, pass_block_win_rate, run_block_win_rate")
      .eq("season", season),
  ]);

  const latestByTeam = new Map<string, NonNullable<typeof statsRows>[number]>();
  for (const row of statsRows ?? []) {
    const existing = latestByTeam.get(row.team_abbr);
    if (!existing || row.week > existing.week) latestByTeam.set(row.team_abbr, row);
  }
  const espnByTeam = new Map((espnRows ?? []).map((r) => [r.team_abbr, r]));

  return (teams ?? []).map((team) => {
    const latest = latestByTeam.get(team.team_abbr);
    const espn = espnByTeam.get(team.team_abbr);
    return {
      ...team,
      overall_score: latest?.overall_score ?? null,
      overall_grade: latest?.overall_grade ?? null,
      pass_block_score: latest?.pass_block_score ?? null,
      pass_block_grade: latest?.pass_block_grade ?? null,
      run_block_score: latest?.run_block_score ?? null,
      run_block_grade: latest?.run_block_grade ?? null,
      sacks_allowed: latest?.sacks_allowed ?? null,
      pressure_rate_allowed: latest?.pressure_rate_allowed ?? null,
      stuff_rate: latest?.stuff_rate ?? null,
      yards_before_contact_per_att: latest?.yards_before_contact_per_att ?? null,
      espn_pass_block_win_rate: espn?.pass_block_win_rate ?? null,
      espn_run_block_win_rate: espn?.run_block_win_rate ?? null,
    };
  });
}
