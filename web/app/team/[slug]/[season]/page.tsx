import { notFound } from "next/navigation";
import { getTeamPageData } from "@/lib/getTeamPageData";
import { CURRENT_SEASON, SUPPORTED_SEASONS, TEAM_SLUGS } from "@/lib/teamsStatic";
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
          <h1 className="text-2xl font-bold">{team.team_name}</h1>
          <p className="text-sm text-gray-600">
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

      <section>
        <h2 className="text-lg font-semibold">ESPN Block Win Rate</h2>
        {espnTeamRates ? (
          <>
            <p>Pass Block Win Rate: {espnTeamRates.pass_block_win_rate ?? "—"}%</p>
            <p>Run Block Win Rate: {espnTeamRates.run_block_win_rate ?? "—"}%</p>
            <p className="text-xs text-gray-500">Source: ESPN</p>
          </>
        ) : (
          <p className="text-gray-500">Not yet entered for this season.</p>
        )}
      </section>

      {stats && (
        <section>
          <h2 className="text-lg font-semibold">Season Stats (through week {stats.week})</h2>
          <p>Sacks allowed: {stats.sacks_allowed}</p>
          <p>
            Pressure rate allowed:{" "}
            {stats.pressure_rate_allowed !== null
              ? `${(stats.pressure_rate_allowed * 100).toFixed(1)}%`
              : "—"}
          </p>
        </section>
      )}

      {isCurrentSeason && (
        <>
          <section>
            <h2 className="text-lg font-semibold">Current Offensive Line</h2>
            {starters.length > 0 ? (
              <ul>
                {starters.map((s) => (
                  <li key={s.position}>
                    {s.position}: {s.player_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No starting lineup available yet.</p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">OL Injury Report</h2>
            {injuries.length > 0 ? (
              <ul>
                {injuries.map((i, idx) => (
                  <li key={idx}>
                    {i.player_name} ({i.position}) — {i.status}
                    {i.injury_description ? `: ${i.injury_description}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No OL injuries reported.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
