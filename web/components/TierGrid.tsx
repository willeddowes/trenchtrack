import Link from "next/link";
import type { HomepageTeam } from "@/lib/getHomepageData";
import { TeamLogo } from "@/components/TeamLogo";

type TierLetter = "A" | "B" | "C" | "D" | "F";

// Solid bands using the site's real "turf to rust" grade ramp at full
// strength (not the tinted-background treatment GradeBadge uses) -- a
// classic tier-list read filtered through the site's own colors rather than
// a generic rainbow. Size tapers from A to F (padding/font/logo) so the top
// tier reads as the featured row, per the earlier design mockup.
const TIER_CONFIG: Record<
  TierLetter,
  { colorVar: string; text: string; chipBg: string; pad: string; font: string; label: string; logo: number }
> = {
  A: { colorVar: "--grade-a", text: "#ffffff", chipBg: "rgba(255,255,255,0.22)", pad: "15px 14px", font: "0.75rem", label: "1rem", logo: 32 },
  B: { colorVar: "--grade-b", text: "#ffffff", chipBg: "rgba(255,255,255,0.22)", pad: "12px 14px", font: "0.7rem", label: "0.875rem", logo: 28 },
  C: { colorVar: "--grade-c", text: "var(--ink)", chipBg: "rgba(0,0,0,0.08)", pad: "10px 14px", font: "0.7rem", label: "0.8125rem", logo: 25 },
  D: { colorVar: "--grade-d", text: "var(--ink)", chipBg: "rgba(0,0,0,0.08)", pad: "8px 14px", font: "0.65rem", label: "0.75rem", logo: 22 },
  F: { colorVar: "--grade-f", text: "#ffffff", chipBg: "rgba(255,255,255,0.22)", pad: "6px 14px", font: "0.65rem", label: "0.75rem", logo: 20 },
};

const TIER_ORDER: TierLetter[] = ["A", "B", "C", "D", "F"];

function groupByTier(teams: HomepageTeam[]): { tiers: Map<TierLetter, HomepageTeam[]>; ungraded: HomepageTeam[] } {
  const tiers = new Map<TierLetter, HomepageTeam[]>();
  const ungraded: HomepageTeam[] = [];

  for (const team of teams) {
    const letter = team.overall_grade?.[0] as TierLetter | undefined;
    if (!letter || !TIER_ORDER.includes(letter)) {
      ungraded.push(team);
      continue;
    }
    const existing = tiers.get(letter) ?? [];
    existing.push(team);
    tiers.set(letter, existing);
  }

  for (const group of tiers.values()) {
    group.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
  }

  return { tiers, ungraded };
}

/** Every team grouped by letter grade (ignoring +/-) instead of division --
 * a tier-list read of "who's actually good at O-line right now" rather than
 * a geographic grouping. See DivisionGrid for the original layout. */
export function TierGrid({ teams, season }: { teams: HomepageTeam[]; season: number }) {
  const { tiers, ungraded } = groupByTier(teams);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      {TIER_ORDER.map((letter) => {
        const group = tiers.get(letter);
        if (!group || group.length === 0) return null;
        const sc = TIER_CONFIG[letter];

        return (
          <div
            key={letter}
            className="mb-1.5 flex flex-wrap items-center gap-2.5 rounded-lg last:mb-0"
            style={{ padding: sc.pad, backgroundColor: `var(${sc.colorVar})`, color: sc.text }}
          >
            <span className="shrink-0 font-extrabold" style={{ fontSize: sc.label, minWidth: "1.4rem" }}>
              {letter}
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {group.map((team) => (
                <Link
                  key={team.slug}
                  href={`/team/${team.slug}/${season}`}
                  className="flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2.5 hover:opacity-90"
                  style={{ backgroundColor: sc.chipBg }}
                >
                  <div
                    className="flex shrink-0 items-center justify-center rounded-full bg-white p-1"
                    style={{ width: sc.logo, height: sc.logo }}
                  >
                    <TeamLogo team={team} size={sc.logo - 8} />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold" style={{ fontSize: sc.font }}>
                      {team.team_nickname}
                    </span>
                    <span style={{ fontSize: sc.font, opacity: 0.85 }}>{team.overall_grade}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {ungraded.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Not yet graded this week: {ungraded.map((t) => t.team_nickname).join(", ")}
        </p>
      )}
    </div>
  );
}
