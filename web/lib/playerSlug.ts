// gsis_id always has this fixed shape: "00-0034857".
const GSIS_ID_RE = /(\d{2}-\d{7})$/;

/** Builds a human-readable-but-unique URL segment, e.g.
 * "josh-allen-00-0034857". The trailing gsis_id guarantees uniqueness
 * (two players can share a name) without needing a separate slug column. */
export function buildPlayerSlug(name: string, playerId: string): string {
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${namePart}-${playerId}`;
}

/** Recovers the gsis_id from a player page's URL segment. Returns null if
 * the segment doesn't end in a gsis_id-shaped suffix. */
export function parsePlayerIdFromSlug(slug: string): string | null {
  const match = GSIS_ID_RE.exec(slug);
  return match ? match[1] : null;
}
