import { createAnonServerClient } from "@/lib/supabase/server";
import { PlayerEntryForm, TeamEntryForm } from "./EspnEntryForm";

// Deliberately NOT linked from anywhere on the public site (no nav link
// points here) -- that's the only thing keeping this page private for now.
// See the project plan's "shortcuts" list: add real auth before sharing
// this URL with anyone else.
export const dynamic = "force-dynamic"; // always show the latest teams/players, never cache this page

export default async function EspnEntryPage() {
  const supabase = createAnonServerClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("team_abbr, team_name")
    .order("team_name");

  const { data: players } = await supabase
    .from("players")
    .select("player_id, full_name, team_abbr, position")
    .eq("position", "OL")
    .order("full_name");

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">ESPN Block Win Rate entry</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pass/Run Block Win Rate isn&apos;t available through the automated data
          pipeline, so it&apos;s entered here by hand from ESPN. Both forms save
          immediately on submit.
        </p>
      </div>

      <TeamEntryForm teams={teams ?? []} />
      <PlayerEntryForm players={players ?? []} />
    </main>
  );
}
