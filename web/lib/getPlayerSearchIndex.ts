import { createAnonServerClient } from "@/lib/supabase/server";
import { buildPlayerSlug } from "@/lib/playerSlug";

export type PlayerSearchEntry = { name: string; slug: string };

/** Full player name+slug index for the header search bar. Unlike the 32
 * hardcoded teams in teamsStatic.ts, there are 600+ players across five
 * seasons (some retired) -- too many to hand-maintain, and the roster
 * changes far more often than the team list -- so this is fetched fresh
 * (cached via the layout's revalidate) rather than a static file. */
export async function getPlayerSearchIndex(): Promise<PlayerSearchEntry[]> {
  const supabase = createAnonServerClient();

  // ol_depth_chart has 2000+ rows -- past PostgREST's default 1000-row
  // page cap -- so this has to page through with .range() rather than
  // trusting one unpaginated select() to return everything.
  const PAGE_SIZE = 1000;
  const rows: { player_id: string; player_name: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("ol_depth_chart")
      .select("player_id, player_name")
      .not("player_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const seen = new Set<string>();
  const entries: PlayerSearchEntry[] = [];
  for (const row of rows) {
    if (seen.has(row.player_id)) continue;
    seen.add(row.player_id);
    entries.push({ name: row.player_name, slug: buildPlayerSlug(row.player_name, row.player_id) });
  }
  return entries;
}
