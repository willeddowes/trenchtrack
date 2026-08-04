import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTeamStatsTableData } from "@/lib/getTeamStatsData";
import { SUPPORTED_SEASONS } from "@/lib/teamsStatic";
import { SeasonTabs } from "@/components/SeasonTabs";
import { TeamStatsTable } from "@/components/TeamStatsTable";

export async function generateStaticParams() {
  return SUPPORTED_SEASONS.map((season) => ({ season: String(season) }));
}

export const dynamicParams = false;

export const revalidate = 86400; // regenerate at most once a day

export async function generateMetadata({
  params,
}: {
  params: Promise<{ season: string }>;
}): Promise<Metadata> {
  const { season } = await params;
  return { title: `Team Stats - ${season}` };
}

export default async function StatsPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: seasonParam } = await params;
  const season = Number(seasonParam);

  if (!SUPPORTED_SEASONS.includes(season)) notFound();

  const rows = await getTeamStatsTableData(season);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[96rem] space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Team Stats</h1>
        <p className="text-sm text-ink-muted">Every metric, all 32 teams &middot; sortable</p>
        <div className="mt-3">
          <SeasonTabs basePath="/stats" activeSeason={season} seasons={SUPPORTED_SEASONS} />
        </div>
      </div>

      <TeamStatsTable rows={rows} season={season} />
    </main>
  );
}
