import Link from "next/link";

// Bare year-tab row -- used only by /stats (no per-team grades to show).
// Team pages use SeasonDropdown.tsx instead, which shows the active
// season's grade in a single collapsed tab.
export function SeasonTabs({
  basePath,
  activeSeason,
  seasons,
}: {
  basePath: string;
  activeSeason: number;
  seasons: number[];
}) {
  const sorted = [...seasons].sort((a, b) => b - a); // most recent first

  return (
    <nav className="flex flex-wrap gap-2">
      {sorted.map((season) => {
        const isActive = season === activeSeason;

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
