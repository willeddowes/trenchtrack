import { getHomepageTeamsData } from "@/lib/getHomepageData";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import { HomepageViewToggle } from "@/components/HomepageViewToggle";

export const revalidate = 86400;

export default async function HomePage() {
  const teams = await getHomepageTeamsData(CURRENT_SEASON);

  return (
    <main className="mx-auto max-w-[96rem] p-8">
      <HomepageViewToggle teams={teams} season={CURRENT_SEASON} />
    </main>
  );
}
