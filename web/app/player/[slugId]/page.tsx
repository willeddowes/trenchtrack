import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlayerPageData } from "@/lib/getPlayerPageData";
import { createAnonServerClient } from "@/lib/supabase/server";
import { buildPlayerSlug, parsePlayerIdFromSlug } from "@/lib/playerSlug";
import { ordinal } from "@/lib/formatRank";
import { HonorBadge } from "@/components/HonorBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { InjuryHistoryCard } from "@/components/InjuryHistoryCard";
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

/** $ millions -> "$26.0M", same one-decimal convention as the team page's
 * free agency contract lines (formatContract). */
function formatMoney(millions: number): string {
  return `$${millions.toFixed(1)}M`;
}

/** Same 5-step "turf to rust" ramp used for grade letters elsewhere on the
 * site (GradeBadge.GRADE_COLOR_VARS), reused here so an elite percentile
 * reads as unmistakably green and a poor one as red at a glance. */
function percentileColorVar(percentile: number): string {
  if (percentile >= 90) return "--grade-a";
  if (percentile >= 75) return "--grade-b";
  if (percentile >= 50) return "--grade-c";
  if (percentile >= 25) return "--grade-d";
  return "--grade-f";
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

  const {
    player,
    age,
    displayName,
    career,
    combine,
    allTimeHonors,
    archetype,
    primaryPosition,
    currentTeamLogoUrl,
    injuryHistory,
    currentContract,
  } = data;
  const combineRows = combine
    ? COMBINE_ROWS.filter((r) => combine[r.field] !== null && combine[r.field] !== undefined).sort((a, b) => {
        const pa = combine[a.percentileField] as number | null;
        const pb = combine[b.percentileField] as number | null;
        if (pa === null || pa === undefined) return pb === null || pb === undefined ? 0 : 1;
        if (pb === null || pb === undefined) return -1;
        return pb - pa; // best percentile first
      })
    : [];
  const position = primaryPosition;

  // Bio splits into two compact boxes (Physical / College & Draft) that
  // sit alongside Current Contract on desktop -- Contract stays widest
  // (its "hero" number needs the room), the other two are dense chip-style
  // boxes. Each box only renders if it actually has data, and the grid's
  // column split adapts to however many of the three are present, so a
  // player missing one category still gets a sane layout instead of a
  // gap where an empty box would've been.
  const hasPhysical = Boolean(age !== null || player?.height || player?.weight);
  const hasCollegeDraft = Boolean(player && (player.college || player.draft_year || player.rookie_season));
  const hasContract = Boolean(currentContract);
  const presentBoxCount = [hasPhysical, hasCollegeDraft, hasContract].filter(Boolean).length;
  const bioGridColsClass =
    hasPhysical && hasCollegeDraft && hasContract
      ? "lg:grid-cols-[0.8fr_0.8fr_1.2fr]"
      : presentBoxCount === 2
        ? "lg:grid-cols-2"
        : "";

  // Alternates a subtle shade per season group in the career table below --
  // every row of a multi-row season (e.g. a mid-season position switch)
  // shares one color, rather than zebra-striping every individual row.
  let lastSeason: number | null = null;
  let shadeToggle = false;
  const seasonShade = career.map((row) => {
    if (row.season !== lastSeason) {
      lastSeason = row.season;
      shadeToggle = !shadeToggle;
    }
    return shadeToggle;
  });

  // Career honor totals for the header, e.g. "4x Pro Bowl" -- ordered by
  // prestige (Pro Bowl, then 1st-Team, then 2nd-Team All-Pro), not by count.
  // Reads from allTimeHonors (every honor this player_id has, full career),
  // not career[].honors, which only covers seasons ol_depth_chart has data
  // for (2021+) and would undercount anyone honored earlier than that.
  const HONOR_ORDER = ["pro_bowl", "all_pro_1st", "all_pro_2nd"];
  const honorCounts = HONOR_ORDER.map((honor) => ({
    honor,
    count: allTimeHonors.filter((h) => h === honor).length,
  })).filter((h) => h.count > 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[80rem] space-y-4 p-4 sm:p-8">
      {/* Stacked and centered below sm -- the 164px headshot next to a name
          column leaves too little room for the name/archetype/honors
          content on a narrow screen, so it wraps awkwardly. Side by side
          again from sm up, where there's room. */}
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        {player?.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot_url}
            alt={displayName}
            width={164}
            height={164}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="h-[164px] w-[164px] shrink-0 rounded-full bg-gray-200" aria-label={displayName} />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-xl font-extrabold tracking-tight">{displayName}</h1>
            {position && <span className="text-sm font-bold text-ink-muted">{position}</span>}
            {currentTeamLogoUrl && (
              <TeamLogo team={{ logo_url: currentTeamLogoUrl, team_name: career[0].team_name }} size={40} />
            )}
          </div>
          {archetype && (
            <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs sm:justify-start">
              <span className="font-semibold text-ink">{archetype.archetype}</span>
              {archetype.reasons.map((reason) => (
                <span key={reason} className="flex items-center gap-1.5 text-ink-muted">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-ink-muted" />
                  {reason}
                </span>
              ))}
            </div>
          )}
          {honorCounts.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-center gap-1 sm:justify-start">
              {honorCounts.map(({ honor, count }) => (
                <HonorBadge key={honor} honor={honor} count={count} />
              ))}
            </div>
          )}
        </div>
      </header>

      {presentBoxCount > 0 && (
        <div className={`grid grid-cols-1 gap-4 ${bioGridColsClass}`}>
          {hasPhysical && (
            <section className="rounded-xl border border-line bg-surface p-3">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted">Physical</h2>
              <dl className="mt-1.5 space-y-1 text-xs">
                {age !== null && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-muted">Age</dt>
                    <dd className="font-semibold">{age}</dd>
                  </div>
                )}
                {player!.height && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-muted">Height</dt>
                    <dd className="font-semibold">{formatHeight(player!.height)}</dd>
                  </div>
                )}
                {player!.weight && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-muted">Weight</dt>
                    <dd className="font-semibold">{player!.weight} lbs</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {hasCollegeDraft && (
            <section className="rounded-xl border border-line bg-surface p-3">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted">College &amp; Draft</h2>
              <div className="mt-1.5 text-xs">
                {player!.college && <p className="font-semibold">{player!.college}</p>}
                <p className="text-ink-muted">
                  {player!.draft_year && player!.draft_round && player!.draft_pick
                    ? `${player!.draft_year} · Rd ${player!.draft_round}, ${ordinal(player!.draft_pick)} overall`
                    : (player!.draft_year ?? player!.rookie_season) && `${player!.draft_year ?? player!.rookie_season} · Undrafted`}
                </p>
              </div>
            </section>
          )}

          {hasContract && (
            <section className="rounded-xl border border-line bg-surface p-3">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted">Current Contract</h2>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-xl font-extrabold" style={{ color: "var(--accent)" }}>
                  {formatMoney(currentContract!.apy)}
                </span>
                <span className="text-xs font-bold text-ink-muted">/yr</span>
                {currentContract!.positionRank && position && (
                  <span
                    className="ml-auto shrink-0 rounded-2xl px-3 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: "color-mix(in srgb, var(--accent) 16%, var(--surface))", color: "var(--accent)" }}
                  >
                    {ordinal(currentContract!.positionRank)}-highest {position}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {currentContract!.yearsSigned && `${currentContract!.yearsSigned}-yr`}
                {currentContract!.totalValue && `, ${formatMoney(currentContract!.totalValue)} total`}
                {` · signed ${currentContract!.yearSigned}`}
                {currentContract!.isRookieContract && <span className="font-semibold text-ink"> (Rookie)</span>}
              </p>
            </section>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Combine / Pro Day</h2>
          {combineRows.length > 0 ? (
            <dl className="mt-1 divide-y divide-line text-sm">
              {combineRows.map(({ label, field, percentileField, format }) => {
                const value = combine![field] as number;
                const percentile = combine![percentileField] as number | null;
                const colorVar = percentile !== null && percentile !== undefined ? percentileColorVar(percentile) : null;
                return (
                  <div key={field} className="py-2">
                    <dt className="text-xs text-ink-muted">{label}</dt>
                    <dd className="font-semibold" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
                      {format(value)}
                      {colorVar && (
                        <span className="ml-1 font-normal text-ink-muted">({ordinal(percentile!)} pctl)</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">(None)</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Career &middot; by snaps played</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
                <th className="pb-2 pr-2 font-bold">Season</th>
                <th className="pb-2 pr-2 font-bold">Team</th>
                <th className="pb-2 pr-2 font-bold">Pos</th>
                <th className="pb-2 pr-2 font-bold">Snaps</th>
                <th className="pb-2 text-right font-bold">APY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {career.map((row, idx) => (
                <tr
                  key={idx}
                  style={seasonShade[idx] ? { backgroundColor: "color-mix(in srgb, var(--background) 25%, white)" } : undefined}
                >
                  <td className="py-1.5 pr-2 align-top font-semibold">{row.season}</td>
                  <td className="py-1.5 pr-2 align-top">
                    <TeamLogo team={{ logo_url: row.team_logo_url, team_name: row.team_name }} size={20} />
                  </td>
                  <td className="py-1.5 pr-2 align-top">{row.position}</td>
                  <td className="py-1.5 pr-2 align-top">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.snaps}
                      {row.honors.map((h) => (
                        <HonorBadge key={h} honor={h} />
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5 align-top text-right text-ink-muted">
                    {row.contract_apy !== null ? formatMoney(row.contract_apy) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {injuryHistory.length > 0 && (
        <InjuryHistoryCard injuryHistory={injuryHistory} />
      )}
    </main>
  );
}
