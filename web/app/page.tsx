import Link from "next/link";
import { getHomepageTeamsData, type HomepageTeam } from "@/lib/getHomepageData";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import { GradeBadge } from "@/components/GradeBadge";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 86400;

const DIVISION_ORDER = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

function groupByDivision(teams: HomepageTeam[]): Map<string, HomepageTeam[]> {
  const groups = new Map<string, HomepageTeam[]>();
  for (const division of DIVISION_ORDER) groups.set(division, []);
  for (const team of teams) {
    groups.get(team.division)?.push(team);
  }
  return groups;
}

export default async function HomePage() {
  const teams = await getHomepageTeamsData(CURRENT_SEASON);
  const byDivision = groupByDivision(teams);

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-8">
      <div>
        <h1 className="text-3xl font-bold">TrenchTrack</h1>
        <p className="text-gray-600">NFL offensive line grades, {CURRENT_SEASON} season</p>
      </div>

      {DIVISION_ORDER.map((division) => (
        <section key={division}>
          <h2 className="mb-3 text-lg font-semibold">{division}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {byDivision.get(division)?.map((team) => (
              <Link
                key={team.slug}
                href={`/team/${team.slug}/${CURRENT_SEASON}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
              >
                <TeamLogo team={team} size={56} />
                <span className="text-sm font-medium">{team.team_nickname}</span>
                <GradeBadge label="Overall" grade={team.overall_grade} score={team.overall_score} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
