import Image from "next/image";
import Link from "next/link";
import { getHomepageTeamsData, type HomepageTeam } from "@/lib/getHomepageData";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import { GRADE_COLOR_VARS } from "@/components/GradeBadge";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 86400;

const CONFERENCES = [
  {
    key: "NFC",
    logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png",
    accent: "var(--nfc-accent)",
    divisions: ["NFC East", "NFC North", "NFC South", "NFC West"],
  },
  {
    key: "AFC",
    logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/afc.png",
    accent: "var(--afc-accent)",
    divisions: ["AFC East", "AFC North", "AFC South", "AFC West"],
  },
];

function groupByDivision(teams: HomepageTeam[]): Map<string, HomepageTeam[]> {
  const groups = new Map<string, HomepageTeam[]>();
  for (const conf of CONFERENCES) {
    for (const division of conf.divisions) groups.set(division, []);
  }
  for (const team of teams) {
    groups.get(team.division)?.push(team);
  }
  return groups;
}

export default async function HomePage() {
  const teams = await getHomepageTeamsData(CURRENT_SEASON);
  const byDivision = groupByDivision(teams);

  return (
    <main className="mx-auto max-w-[96rem] space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Offensive line grades</h1>
        <p className="text-ink-muted">{CURRENT_SEASON} season &middot; updated weekly</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {CONFERENCES.map((conf) => (
          <div
            key={conf.key}
            className="rounded-2xl border-2 p-5 sm:p-6"
            style={{ borderColor: conf.accent }}
          >
            <div className="mb-4 flex items-center gap-3">
              <Image src={conf.logoUrl} alt={`${conf.key} logo`} width={36} height={36} />
              <h2 className="text-xl font-extrabold tracking-tight" style={{ color: conf.accent }}>
                {conf.key}
              </h2>
            </div>
            <div className="space-y-3">
              {conf.divisions.map((division) => (
                <section key={division}>
                  <h3 className="mb-1 text-xs font-bold">{division}</h3>
                  <div className="grid grid-cols-4 gap-1.5">
                    {byDivision.get(division)?.map((team) => {
                      const colorVar = team.overall_grade ? GRADE_COLOR_VARS[team.overall_grade[0]] : undefined;
                      return (
                        <Link
                          key={team.slug}
                          href={`/team/${team.slug}/${CURRENT_SEASON}`}
                          className="flex flex-col items-center gap-0.5 rounded-lg border border-line bg-surface p-1 hover:border-accent"
                        >
                          <TeamLogo team={team} size={18} />
                          <span className="w-full truncate text-center text-[0.65rem] font-bold leading-tight">
                            {team.team_nickname}
                          </span>
                          <span
                            className="text-xs font-extrabold leading-tight"
                            style={{ color: colorVar ? `var(${colorVar})` : "var(--ink-muted)" }}
                          >
                            {team.overall_grade ?? "—"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
