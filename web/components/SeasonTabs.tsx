import Link from "next/link";

export function SeasonTabs({
  slug,
  activeSeason,
  seasons,
}: {
  slug: string;
  activeSeason: number;
  seasons: number[];
}) {
  const sorted = [...seasons].sort((a, b) => b - a); // most recent first

  return (
    <nav className="flex gap-2">
      {sorted.map((season) => {
        const isActive = season === activeSeason;
        return (
          <Link
            key={season}
            href={`/team/${slug}/${season}`}
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
