"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GRADE_COLOR_VARS } from "@/components/GradeBadge";

// Team-page season switcher: a single accent-colored tab for the active
// season (with its grade) that expands into a dropdown of the other years,
// each shown with its own grade in the same letter -> color mapping as
// GradeBadge. Replaces the old always-visible row of year tabs
// (SeasonTabs.tsx, still used as-is on /stats where there's no per-season
// grade to switch on).
export function SeasonDropdown({
  basePath,
  activeSeason,
  seasons,
  grades,
}: {
  basePath: string;
  activeSeason: number;
  seasons: number[];
  grades: Record<number, string | null>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const sorted = [...seasons].sort((a, b) => b - a); // most recent first
  const activeGrade = grades[activeSeason] ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-ink"
      >
        {activeSeason}
        <span className="text-[0.65rem] font-extrabold text-accent-ink">{activeGrade ?? "—"}</span>
        <span className={`text-[0.6rem] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex min-w-[6rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {sorted
            .filter((season) => season !== activeSeason)
            .map((season) => {
              const grade = grades[season] ?? null;
              const colorVar = grade ? GRADE_COLOR_VARS[grade[0]] : undefined;
              return (
                <Link
                  key={season}
                  href={`${basePath}/${season}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent/10"
                >
                  {season}
                  <span
                    className="text-[0.65rem] font-extrabold"
                    style={{ color: colorVar ? `var(${colorVar})` : "var(--ink-muted)" }}
                  >
                    {grade ?? "—"}
                  </span>
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
