import { createAnonServerClient } from "@/lib/supabase/server";

export type HomepageTeam = {
  team_abbr: string;
  team_name: string;
  team_nickname: string;
  slug: string;
  conference: string;
  division: string;
  logo_url: string | null;
  overall_score: number | null;
  overall_grade: string | null;
};

/** Two queries total, not 32 -- one for all teams, one for the whole
 * season's team_ol_stats, reduced in JS to each team's latest week. */
export async function getHomepageTeamsData(season: number): Promise<HomepageTeam[]> {
  const supabase = createAnonServerClient();

  const [{ data: teams }, { data: statsRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("team_abbr, team_name, team_nickname, slug, conference, division, logo_url")
      .order("team_name"),
    supabase
      .from("team_ol_stats")
      .select("team_abbr, week, overall_score, overall_grade")
      .eq("season", season),
  ]);

  const latestByTeam = new Map<string, { week: number; overall_score: number | null; overall_grade: string | null }>();
  for (const row of statsRows ?? []) {
    const existing = latestByTeam.get(row.team_abbr);
    if (!existing || row.week > existing.week) {
      latestByTeam.set(row.team_abbr, row);
    }
  }

  return (teams ?? []).map((team) => {
    const latest = latestByTeam.get(team.team_abbr);
    return {
      ...team,
      overall_score: latest?.overall_score ?? null,
      overall_grade: latest?.overall_grade ?? null,
    };
  });
}
