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
    pressure_rate_allowed: number | null;
    stuff_rate: number | null;
    yards_before_contact_per_att: number | null;
    pass_block_score: number | null;
    pass_block_grade: string | null;
    run_block_score: number | null;
    run_block_grade: string | null;
    overall_score: number | null;
    overall_grade: string | null;
  } | null;
  starters: { position: string; player_name: string }[];
  injuries: { player_name: string; position: string | null; status: string | null; injury_description: string | null }[];
  espnTeamRates: { pass_block_win_rate: number | null; run_block_win_rate: number | null } | null;
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

  const [{ data: statsRows }, { data: starters }, { data: injuries }, { data: espnTeamRates }] = await Promise.all([
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
    supabase
      .from("espn_team_block_win_rates")
      .select("pass_block_win_rate, run_block_win_rate")
      .eq("team_abbr", team.team_abbr)
      .eq("season", season)
      .maybeSingle(),
  ]);

  const positionOrder = ["LT", "LG", "C", "RG", "RT"];

  return {
    team,
    stats: statsRows?.[0] ?? null,
    starters: (starters ?? []).sort(
      (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position)
    ),
    injuries: injuries ?? [],
    espnTeamRates: espnTeamRates ?? null,
  };
}
