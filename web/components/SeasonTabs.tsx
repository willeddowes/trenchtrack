import Link from "next/link";
import { GRADE_COLOR_VARS } from "@/components/GradeBadge";

// `grades`/`gradeLayout` are optional -- the /stats page uses this same
// component with no team context, so it just renders bare year tabs there.
export function SeasonTabs({
  basePath,
  activeSeason,
  seasons,
  grades,
  gradeLayout,
}: {
  basePath: string;
  activeSeason: number;
  seasons: number[];
  grades?: Record<number, string | null>;
  gradeLayout?: "right" | "below";
}) {
  const sorted = [...seasons].sort((a, b) => b - a); // most recent first

  return (
    <nav className="flex gap-2">
      {sorted.map((season) => {
        const isActive = season === activeSeason;
        const grade = grades?.[season] ?? null;
        const colorVar = grade ? GRADE_COLOR_VARS[grade[0]] : undefined;
        const gradeColor = isActive ? "var(--accent-ink)" : colorVar ? `var(${colorVar})` : "var(--ink-muted)";
        const activeClasses = "bg-accent text-accent-ink";
        const inactiveClasses = "border border-line text-ink-muted hover:border-accent";

        if (gradeLayout === "below") {
          return (
            <Link
              key={season}
              href={`${basePath}/${season}`}
              className={`flex flex-col items-center rounded-xl px-2.5 py-1 leading-tight ${isActive ? activeClasses : inactiveClasses}`}
            >
              <span className="text-xs font-bold">{season}</span>
              <span className="text-[0.6rem] font-extrabold" style={{ color: gradeColor }}>
                {grade ?? "—"}
              </span>
            </Link>
          );
        }

        if (gradeLayout === "right") {
          return (
            <Link
              key={season}
              href={`${basePath}/${season}`}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${isActive ? activeClasses : inactiveClasses}`}
            >
              {season}
              <span className="text-[0.65rem] font-extrabold" style={{ color: gradeColor }}>
                {grade ?? "—"}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={season}
            href={`${basePath}/${season}`}
            className={
              isActive
                ? "rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-ink"
                : "rounded-full border border-line px-3 py-1 text-sm font-semibold text-ink-muted hover:border-accent"
            }
          >
            {season}
          </Link>
        );
      })}
    </nav>
  );
}
