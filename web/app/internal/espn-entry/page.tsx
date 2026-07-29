import { createAnonServerClient } from "@/lib/supabase/server";
import { RecomputeGradesButton, TeamEntryForm } from "./EspnEntryForm";

// Deliberately NOT linked from anywhere on the public site (no nav link
// points here) -- that's the only thing keeping this page private for now.
// See the project plan's "shortcuts" list: add real auth before sharing
// this URL with anyone else.
//
// Player-level entry is scrapped for now -- ESPN only publishes team-level
// Pass/Run Block Win Rate publicly, so there was nothing to actually enter
// player-by-player. The espn_player_block_win_rates table and the API
// route's "player" kind are left in place in case a source turns up later.
export const dynamic = "force-dynamic"; // always show the latest teams, never cache this page

export default async function EspnEntryPage() {
  const supabase = createAnonServerClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("team_abbr, team_name")
    .order("team_name");

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">ESPN Block Win Rate entry</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pass/Run Block Win Rate isn&apos;t available through the automated data
          pipeline, so it&apos;s entered here by hand from ESPN. Saves immediately on
          submit.
        </p>
      </div>

      <TeamEntryForm teams={teams ?? []} />
      <RecomputeGradesButton />
    </main>
  );
}
