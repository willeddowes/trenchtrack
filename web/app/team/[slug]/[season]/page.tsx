import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTeamPageData } from "@/lib/getTeamPageData";
import { CURRENT_SEASON, SUPPORTED_SEASONS, TEAM_SLUGS, TEAMS } from "@/lib/teamsStatic";
import { ordinal } from "@/lib/formatRank";
import { GradeBadge } from "@/components/GradeBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { SeasonTabs } from "@/components/SeasonTabs";

// Prebuilds every team x season combination at build time; Next.js
// regenerates each page in the background at most once a day after that
// (see `revalidate` below), so every visit is instant and never more than
// a day stale.
export async function generateStaticParams() {
  return TEAM_SLUGS.flatMap((slug) =>
    SUPPORTED_SEASONS.map((season) => ({ slug, season: String(season) }))
  );
}

// Since generateStaticParams already lists every valid combination, any
// other slug/season is guaranteed invalid -- this 404s immediately instead
// of running the page function and querying Supabase for nothing.
export const dynamicParams = false;

export const revalidate = 86400; // regenerate at most once a day

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}): Promise<Metadata> {
  const { slug, season } = await params;
  const team = TEAMS.find((t) => t.slug === slug);
  return { title: team ? `${team.name} - ${season}` : "TrenchTrack" };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}) {
  const { slug, season: seasonParam } = await params;
  const season = Number(seasonParam);

  if (!SUPPORTED_SEASONS.includes(season)) notFound();

  const data = await getTeamPageData(slug, season);
  if (!data) notFound();

  const { team, stats, depthChart, injuries, espnTeamRates } = data;
  const isCurrentSeason = season === CURRENT_SEASON;

  const positionOrder = ["LT", "LG", "C", "RG", "RT"];
  const depthChartByPosition = positionOrder.map((position) => ({
    position,
    starter: depthChart.find((d) => d.position === position && d.depth_rank === 1) ?? null,
    backup: depthChart.find((d) => d.position === position && d.depth_rank === 2) ?? null,
  }));

  return (
    <main className="mx-auto max-w-[80rem] space-y-4 p-8">
      <header className="flex items-center gap-4">
        <TeamLogo team={team} size={56} />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-extrabold tracking-tight">{team.team_name}</h1>
            <span className="text-sm font-bold text-ink-muted">- {season}</span>
          </div>
          <p className="text-xs text-ink-muted">{team.division}</p>
        </div>
        <SeasonTabs slug={slug} activeSeason={season} seasons={SUPPORTED_SEASONS} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_1fr]">
        <div className="flex flex-col gap-2">
          <GradeBadge
            label="Overall"
            grade={stats?.overall_grade ?? null}
            score={stats?.overall_score ?? null}
            className="w-full"
          />
          <div className="flex gap-2">
            <GradeBadge
              label="Pass Block"
              grade={stats?.pass_block_grade ?? null}
              score={stats?.pass_block_score ?? null}
              size="sm"
              className="flex-1"
            />
            <GradeBadge
              label="Run Block"
              grade={stats?.run_block_grade ?? null}
              score={stats?.run_block_score ?? null}
              size="sm"
              className="flex-1"
            />
          </div>
        </div>

        {stats && (
          <>
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Pass Pro Metrics &middot; through week {stats.week}
              </h2>
              <dl className="mt-1 divide-y divide-line">
                <MetricRow label="Sacks Allowed" value={String(stats.sacks_allowed)} rank={stats.sacks_allowed_rank} />
                <MetricRow
                  label="Pressure Rate"
                  value={stats.pressure_rate_allowed !== null ? `${(stats.pressure_rate_allowed * 100).toFixed(1)}%` : "—"}
                  rank={stats.pressure_rate_allowed_rank}
                />
                <MetricRow
                  label="ESPN Pass Blk Win Rate"
                  value={espnTeamRates?.pass_block_win_rate !== null && espnTeamRates?.pass_block_win_rate !== undefined
                    ? `${espnTeamRates.pass_block_win_rate}%`
                    : "Not yet entered"}
                  rank={espnTeamRates?.pass_block_win_rate_rank ?? null}
                />
              </dl>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Run Game Metrics &middot; through week {stats.week}
              </h2>
              <dl className="mt-1 divide-y divide-line">
                <MetricRow
                  label="Stuff Rate"
                  value={stats.stuff_rate !== null ? `${(stats.stuff_rate * 100).toFixed(1)}%` : "—"}
                  rank={stats.stuff_rate_rank}
                />
                <MetricRow
                  label="Yards Before Contact/Att"
                  value={stats.yards_before_contact_per_att !== null ? stats.yards_before_contact_per_att.toFixed(2) : "—"}
                  rank={stats.yards_before_contact_per_att_rank}
                />
                <MetricRow
                  label="ESPN Run Blk Win Rate"
                  value={espnTeamRates?.run_block_win_rate !== null && espnTeamRates?.run_block_win_rate !== undefined
                    ? `${espnTeamRates.run_block_win_rate}%`
                    : "Not yet entered"}
                  rank={espnTeamRates?.run_block_win_rate_rank ?? null}
                />
              </dl>
            </section>
          </>
        )}
      </div>

      {depthChart.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Offensive Line Depth Chart &middot; by snaps played
          </h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
                <th className="pb-2 pr-2 font-bold">Pos</th>
                <th className="pb-2 pr-2 font-bold">Starter</th>
                <th className="pb-2 font-bold">Backup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {depthChartByPosition.map(({ position, starter, backup }) => (
                <tr key={position}>
                  <td className="py-1.5 pr-2 align-top">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-xs font-bold text-ink-muted">
                      {position}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    {starter ? (
                      <>
                        <span className="font-semibold">{starter.player_name}</span>
                        <span className="ml-1 text-ink-muted">({starter.snaps} snaps)</span>
                      </>
                    ) : (
                      <span className="text-ink-muted">&mdash;</span>
                    )}
                  </td>
                  <td className="py-1.5 align-top">
                    {backup ? (
                      <>
                        <span className="font-semibold">{backup.player_name}</span>
                        <span className="ml-1 text-ink-muted">({backup.snaps} snaps)</span>
                      </>
                    ) : (
                      <span className="text-ink-muted">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isCurrentSeason && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">OL Injury Report</h2>
          {injuries.length > 0 ? (
            <ul className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
              {injuries.map((i, idx) => (
                <li key={idx}>
                  <span className="font-semibold">{i.player_name}</span> ({i.position}) &mdash; {i.status}
                  {i.injury_description ? `: ${i.injury_description}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--grade-a)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--grade-a)" }} />
              No OL injuries reported
            </span>
          )}
        </section>
      )}
    </main>
  );
}

/** One row inside a metrics section: a label, its value, and its league
 * rank (e.g. "35 (12th)"). ESPN-sourced rows spell that out in the label
 * itself ("ESPN Pass Blk Win Rate"), so there's no separate source tag.
 *
 * The value is colored using the same green/red tokens as the grade
 * badges: top half of the 32-team league (rank 16 or better) is "good"
 * (green), bottom half is "bad" (red). No rank yet (e.g. ESPN data not
 * entered) stays neutral. */
function MetricRow({
  label,
  value,
  rank,
}: {
  label: string;
  value: string;
  rank: number | null;
}) {
  const colorVar = rank === null ? null : rank <= 16 ? "--grade-a" : "--grade-f";

  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt>{label}</dt>
      <dd
        className="shrink-0 font-mono font-bold tabular-nums"
        style={colorVar ? { color: `var(${colorVar})` } : undefined}
      >
        {value}
        {rank !== null && <span className="ml-1 font-normal text-ink-muted">({ordinal(rank)})</span>}
      </dd>
    </div>
  );
}
