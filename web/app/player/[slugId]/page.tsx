import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlayerPageData } from "@/lib/getPlayerPageData";
import { createAnonServerClient } from "@/lib/supabase/server";
import { buildPlayerSlug, parsePlayerIdFromSlug } from "@/lib/playerSlug";
import { ordinal } from "@/lib/formatRank";
import { HonorBadge } from "@/components/HonorBadge";
import type { PlayerCombine } from "@/lib/getPlayerPageData";

// Prebuilds a page for every player who's ever logged an O-line snap with a
// matched player_id (2021-2025) -- same "static now, revalidate daily"
// pattern as the team pages, just over a much bigger param list.
export async function generateStaticParams() {
  const supabase = createAnonServerClient();

  // ol_depth_chart already has 2000+ rows -- well past PostgREST's default
  // 1000-row page cap -- so this has to page through everything rather
  // than trusting a single unpaginated select() to return it all.
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
  const params: { slugId: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.player_id)) continue;
    seen.add(row.player_id);
    params.push({ slugId: buildPlayerSlug(row.player_name, row.player_id) });
  }
  return params;
}

export const dynamicParams = false;

export const revalidate = 86400; // regenerate at most once a day

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugId: string }>;
}): Promise<Metadata> {
  const { slugId } = await params;
  const playerId = parsePlayerIdFromSlug(slugId);
  if (!playerId) return { title: "TrenchTrack" };
  const data = await getPlayerPageData(playerId);
  return { title: data ? `${data.displayName} - TrenchTrack` : "TrenchTrack" };
}

/** Total inches (nflreadpy's raw unit) -> "6'4"". */
function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// One row per drill: which combine/percentile fields to read, and how to
// format the raw value. Order matches how these are typically listed on a
// scouting report (measurables first, then drills).
const COMBINE_ROWS: {
  label: string;
  field: keyof PlayerCombine;
  percentileField: keyof PlayerCombine;
  format: (v: number) => string;
}[] = [
  { label: "Arm Length", field: "arm_length", percentileField: "arm_length_percentile", format: (v) => `${v}"` },
  { label: "Hand Size", field: "hand_size", percentileField: "hand_size_percentile", format: (v) => `${v}"` },
  { label: "Wingspan", field: "wingspan", percentileField: "wingspan_percentile", format: (v) => `${v}"` },
  { label: "40-Yard Dash", field: "forty", percentileField: "forty_percentile", format: (v) => `${v}s` },
  { label: "Bench Press", field: "bench", percentileField: "bench_percentile", format: (v) => `${v} reps` },
  { label: "Vertical Jump", field: "vertical", percentileField: "vertical_percentile", format: (v) => `${v}"` },
  { label: "Broad Jump", field: "broad_jump", percentileField: "broad_jump_percentile", format: (v) => `${v}"` },
  { label: "3-Cone Drill", field: "cone", percentileField: "cone_percentile", format: (v) => `${v}s` },
  { label: "Shuttle", field: "shuttle", percentileField: "shuttle_percentile", format: (v) => `${v}s` },
];

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slugId: string }>;
}) {
  const { slugId } = await params;
  const playerId = parsePlayerIdFromSlug(slugId);
  if (!playerId) notFound();

  const data = await getPlayerPageData(playerId);
  if (!data) notFound();

  const { player, displayName, career, combine } = data;
  const combineRows = combine
    ? COMBINE_ROWS.filter((r) => combine[r.field] !== null && combine[r.field] !== undefined)
    : [];
  const position = player?.position ?? career[0]?.position ?? null;
  const pastTeams = [...new Map(career.map((c) => [c.team_abbr, c])).values()];
  const allHonors = career.flatMap((c) => c.honors);

  return (
    <main className="mx-auto max-w-[80rem] space-y-4 p-8">
      <header className="flex items-center gap-4">
        {player?.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot_url}
            alt={displayName}
            width={72}
            height={72}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="h-[72px] w-[72px] shrink-0 rounded-full bg-gray-200" aria-label={displayName} />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-extrabold tracking-tight">{displayName}</h1>
            {position && <span className="text-sm font-bold text-ink-muted">{position}</span>}
          </div>
          {pastTeams.length > 0 && (
            <p className="text-xs text-ink-muted">
              {pastTeams.map((t) => t.team_name).join(" · ")}
            </p>
          )}
          {allHonors.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {[...new Set(allHonors)].map((h) => (
                <HonorBadge key={h} honor={h} />
              ))}
            </div>
          )}
        </div>
      </header>

      {player && (player.height || player.weight || player.college || player.draft_year) && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Bio</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {player.height && (
              <div>
                <dt className="text-xs text-ink-muted">Height</dt>
                <dd className="font-semibold">{formatHeight(player.height)}</dd>
              </div>
            )}
            {player.weight && (
              <div>
                <dt className="text-xs text-ink-muted">Weight</dt>
                <dd className="font-semibold">{player.weight} lbs</dd>
              </div>
            )}
            {player.college && (
              <div>
                <dt className="text-xs text-ink-muted">College</dt>
                <dd className="font-semibold">{player.college}</dd>
              </div>
            )}
            {player.draft_year && (
              <div>
                <dt className="text-xs text-ink-muted">Draft</dt>
                <dd className="font-semibold">
                  {player.draft_round && player.draft_pick
                    ? `${player.draft_year} · Rd ${player.draft_round}, ${ordinal(player.draft_pick)} overall`
                    : `${player.draft_year} · Undrafted`}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {combineRows.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Combine / Pro Day</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {combineRows.map(({ label, field, percentileField, format }) => {
              const value = combine![field] as number;
              const percentile = combine![percentileField] as number | null;
              return (
                <div key={field}>
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="font-semibold">
                    {format(value)}
                    {percentile !== null && percentile !== undefined && (
                      <span className="ml-1 font-normal text-ink-muted">({ordinal(percentile)} pctl)</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Career &middot; by snaps played</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
              <th className="pb-2 pr-2 font-bold">Season</th>
              <th className="pb-2 pr-2 font-bold">Team</th>
              <th className="pb-2 pr-2 font-bold">Pos</th>
              <th className="pb-2 pr-2 font-bold">Rank</th>
              <th className="pb-2 font-bold">Snaps</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {career.map((row, idx) => (
              <tr key={idx}>
                <td className="py-1.5 pr-2 align-top font-semibold">{row.season}</td>
                <td className="py-1.5 pr-2 align-top">{row.team_name}</td>
                <td className="py-1.5 pr-2 align-top">{row.position}</td>
                <td className="py-1.5 pr-2 align-top">
                  {row.depth_rank === 1 ? "Starter" : `Backup #${row.depth_rank - 1}`}
                </td>
                <td className="py-1.5 align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    {row.snaps}
                    {row.honors.map((h) => (
                      <HonorBadge key={h} honor={h} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
