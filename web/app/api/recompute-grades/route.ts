import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeGrades, type TeamRawStats } from "@/lib/computeGrades";
import { CURRENT_SEASON } from "@/lib/teamsStatic";

// Lets the ESPN-entry page refresh grades immediately after a manual entry,
// instead of waiting for the next full pipeline run. Only recomputes --
// never re-pulls nflverse data, so it's fast and has nothing to do with
// the Python side of things.
export async function POST() {
  const supabase = createServiceRoleClient();

  const { data: statsRows, error: statsError } = await supabase
    .from("team_ol_stats")
    .select("team_abbr, week, sacks_allowed, dropbacks, pressure_rate_allowed, stuff_rate, yards_before_contact_per_att")
    .eq("season", CURRENT_SEASON);
  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 });

  // Keep only each team's latest week -- same "latest snapshot" logic used
  // on the homepage and team pages.
  const latestByTeam = new Map<string, (typeof statsRows)[number]>();
  for (const row of statsRows ?? []) {
    const existing = latestByTeam.get(row.team_abbr);
    if (!existing || row.week > existing.week) latestByTeam.set(row.team_abbr, row);
  }
  const rawStats: TeamRawStats[] = [...latestByTeam.values()];

  const { data: espnRates, error: espnError } = await supabase
    .from("espn_team_block_win_rates")
    .select("team_abbr, pass_block_win_rate, run_block_win_rate")
    .eq("season", CURRENT_SEASON);
  if (espnError) return NextResponse.json({ error: espnError.message }, { status: 500 });

  const graded = computeGrades(rawStats, espnRates ?? []);

  // Each team's grades get written back onto its own (team_abbr, season,
  // week) row -- an update, not an upsert, since the row already exists.
  for (const team of graded) {
    const week = latestByTeam.get(team.team_abbr)!.week;
    const { error } = await supabase
      .from("team_ol_stats")
      .update({
        pass_block_score: team.pass_block_score,
        pass_block_grade: team.pass_block_grade,
        run_block_score: team.run_block_score,
        run_block_grade: team.run_block_grade,
        overall_score: team.overall_score,
        overall_grade: team.overall_grade,
        grade_formula_version: team.grade_formula_version,
      })
      .eq("team_abbr", team.team_abbr)
      .eq("season", CURRENT_SEASON)
      .eq("week", week);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Refresh every page (homepage + all team pages share the root layout)
  // so the new grades show up on next visit instead of waiting for the
  // daily ISR window.
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, teamsUpdated: graded.length });
}
