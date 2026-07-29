import { notFound } from "next/navigation";
import { getTeamPageData } from "@/lib/getTeamPageData";
import { CURRENT_SEASON, SUPPORTED_SEASONS, TEAM_SLUGS } from "@/lib/teamsStatic";
import { ordinal } from "@/lib/formatRank";
import { GradeBadge } from "@/components/GradeBadge";
import { TeamLogo } from "@/components/TeamLogo";

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

  const { team, stats, starters, injuries, espnTeamRates } = data;
  const isCurrentSeason = season === CURRENT_SEASON;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="flex items-center gap-4">
        <TeamLogo team={team} size={72} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{team.team_name}</h1>
          <p className="text-sm text-ink-muted">
            {team.conference} &middot; {team.division} &middot; {season} season
          </p>
        </div>
      </header>

      <section className="flex gap-4">
        <GradeBadge label="Overall" grade={stats?.overall_grade ?? null} score={stats?.overall_score ?? null} />
        <GradeBadge
          label="Pass Block"
          grade={stats?.pass_block_grade ?? null}
          score={stats?.pass_block_score ?? null}
        />
        <GradeBadge
          label="Run Block"
          grade={stats?.run_block_grade ?? null}
          score={stats?.run_block_score ?? null}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">ESPN Block Win Rate</h2>
        {espnTeamRates ? (
          <>
            <p className="mt-2">Pass Block Win Rate: {espnTeamRates.pass_block_win_rate ?? "—"}%</p>
            <p>Run Block Win Rate: {espnTeamRates.run_block_win_rate ?? "—"}%</p>
            <p className="mt-1 text-xs text-ink-muted">Source: ESPN</p>
          </>
        ) : (
          <p className="mt-2 text-ink-muted">Not yet entered for this season.</p>
        )}
      </section>

      {stats && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Season Stats (through week {stats.week})
          </h2>
          <dl className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <dt>Sacks allowed</dt>
              <dd className="font-mono tabular-nums">
                {stats.sacks_allowed}
                {stats.sacks_allowed_rank !== null && (
                  <span className="ml-1 text-ink-muted">({ordinal(stats.sacks_allowed_rank)})</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt>Pressure rate allowed</dt>
              <dd className="font-mono tabular-nums">
                {stats.pressure_rate_allowed !== null
                  ? `${(stats.pressure_rate_allowed * 100).toFixed(1)}%`
                  : "—"}
                {stats.pressure_rate_allowed_rank !== null && (
                  <span className="ml-1 text-ink-muted">({ordinal(stats.pressure_rate_allowed_rank)})</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {isCurrentSeason && (
        <>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Current Offensive Line</h2>
            {starters.length > 0 ? (
              <ul className="mt-3 divide-y divide-line">
                {starters.map((s) => (
                  <li key={s.position} className="flex items-center gap-3 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-xs font-bold text-ink-muted">
                      {s.position}
                    </span>
                    <span className="font-semibold">{s.player_name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-ink-muted">No starting lineup available yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">OL Injury Report</h2>
            {injuries.length > 0 ? (
              <ul className="mt-3 divide-y divide-line">
                {injuries.map((i, idx) => (
                  <li key={idx} className="py-2">
                    <span className="font-semibold">{i.player_name}</span> ({i.position}) &mdash; {i.status}
                    {i.injury_description ? `: ${i.injury_description}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-ink-muted">No OL injuries reported.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
