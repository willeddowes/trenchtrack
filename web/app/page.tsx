import { getHomepageTeamsData } from "@/lib/getHomepageData";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import { HomepageViewToggle } from "@/components/HomepageViewToggle";

export const revalidate = 86400;

export default async function HomePage() {
  const teams = await getHomepageTeamsData(CURRENT_SEASON);

  return (
    <main className="mx-auto max-w-[96rem] space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Offensive line grades</h1>
        <p className="text-ink-muted">{CURRENT_SEASON} season &middot; updated weekly</p>
      </div>

      <HomepageViewToggle teams={teams} season={CURRENT_SEASON} />
    </main>
  );
}
