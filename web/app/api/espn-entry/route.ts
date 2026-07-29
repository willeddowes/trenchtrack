import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// This route has no authentication -- it's reachable by anyone who finds
// the URL. It's protected only by not being linked anywhere on the public
// site, and by the fact that writes require the service_role key held here
// on the server (never sent to the browser). Fine for an MVP one can-write
// site; add a real auth check before sharing this URL, or before letting
// anyone besides you use it.

type TeamEntryBody = {
  kind: "team";
  team_abbr: string;
  season: number;
  pass_block_win_rate: number | null;
  run_block_win_rate: number | null;
  notes: string | null;
};

type PlayerEntryBody = {
  kind: "player";
  player_id: string;
  team_abbr: string | null;
  season: number;
  position: string | null;
  pass_block_win_rate: number | null;
  run_block_win_rate: number | null;
  notes: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as TeamEntryBody | PlayerEntryBody;
  const supabase = createServiceRoleClient();

  if (body.kind === "team") {
    if (!body.team_abbr || !body.season) {
      return NextResponse.json({ error: "team_abbr and season are required" }, { status: 400 });
    }
    const { error } = await supabase.from("espn_team_block_win_rates").upsert(
      {
        team_abbr: body.team_abbr,
        season: body.season,
        pass_block_win_rate: body.pass_block_win_rate,
        run_block_win_rate: body.run_block_win_rate,
        notes: body.notes,
      },
      { onConflict: "team_abbr,season" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "player") {
    if (!body.player_id || !body.season) {
      return NextResponse.json({ error: "player_id and season are required" }, { status: 400 });
    }

    // Look up the player's current name/team server-side rather than
    // trusting whatever the browser sent, so the denormalized columns
    // can't drift out of sync with the real players table.
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("full_name, position, team_abbr")
      .eq("player_id", body.player_id)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: "Unknown player_id" }, { status: 400 });
    }

    const { error } = await supabase.from("espn_player_block_win_rates").upsert(
      {
        player_id: body.player_id,
        player_name: player.full_name,
        team_abbr: body.team_abbr ?? player.team_abbr,
        season: body.season,
        position: body.position ?? player.position,
        pass_block_win_rate: body.pass_block_win_rate,
        run_block_win_rate: body.run_block_win_rate,
        notes: body.notes,
      },
      { onConflict: "player_id,season" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
}
