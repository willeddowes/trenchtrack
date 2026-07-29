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

  const graded = teams.filter((t) => t.overall_score !== null);
  const best = graded.length ? graded.reduce((a, b) => (b.overall_score! > a.overall_score! ? b : a)) : null;
  const worst = graded.length ? graded.reduce((a, b) => (b.overall_score! < a.overall_score! ? b : a)) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Offensive line grades</h1>
        <p className="text-ink-muted">{CURRENT_SEASON} season &middot; updated weekly</p>
      </div>

      {(best || worst) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {best && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">🏆 Best O-line</p>
              <p className="mt-1 text-2xl font-extrabold">{best.team_nickname}</p>
              <p className="font-mono text-sm text-ink-muted">
                {best.overall_grade} &middot; {best.overall_score!.toFixed(0)}/100
              </p>
            </div>
          )}
          {worst && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">📉 Needs work</p>
              <p className="mt-1 text-2xl font-extrabold">{worst.team_nickname}</p>
              <p className="font-mono text-sm text-ink-muted">
                {worst.overall_grade} &middot; {worst.overall_score!.toFixed(0)}/100
              </p>
            </div>
          )}
        </div>
      )}

      {DIVISION_ORDER.map((division) => (
        <section key={division}>
          <h2 className="mb-3 text-lg font-bold">{division}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {byDivision.get(division)?.map((team) => (
              <Link
                key={team.slug}
                href={`/team/${team.slug}/${CURRENT_SEASON}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-accent"
              >
                <TeamLogo team={team} size={56} />
                <span className="text-sm font-bold">{team.team_nickname}</span>
                <GradeBadge label="Overall" grade={team.overall_grade} score={team.overall_score} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
