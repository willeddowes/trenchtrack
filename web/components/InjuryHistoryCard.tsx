"use client";

import { useState } from "react";
import type { PlayerInjuryEntry } from "@/lib/getPlayerPageData";

const INITIAL_ROWS = 5;

/** Compact by design: smaller text/tighter rows than the page's other cards
 * (Bio, Combine, Career), since a long-tenured player's injury list can run
 * much longer than those and shouldn't dominate the page. Collapsed to the
 * most recent 5 rows by default, with a "Show all" toggle (same chevron
 * convention as TeamGradeTrendChart's View/Hide Chart button) when there's
 * more -- injuryHistory is already sorted most-recent-season-first. */
export function InjuryHistoryCard({
  injuryHistory,
}: {
  injuryHistory: PlayerInjuryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = injuryHistory.length > INITIAL_ROWS;
  const visible = expanded ? injuryHistory : injuryHistory.slice(0, INITIAL_ROWS);

  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted">Injury History:</h2>
      <ul className="mt-1.5 divide-y divide-line text-xs">
        {visible.map((entry) => (
          <li key={`${entry.season}-${entry.injuryDescription}`} className="flex items-baseline justify-between gap-4 py-1">
            <span>
              <span className="font-semibold">{entry.season}</span>
              {entry.injuryDescription && <span className="text-ink-muted"> &middot; {entry.injuryDescription}</span>}
            </span>
            <span className="shrink-0 text-ink-muted">
              {entry.weeksOut} {entry.weeksOut === 1 ? "week" : "weeks"}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
        >
          {expanded ? "Show less" : `Show all (${injuryHistory.length})`}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}
          >
            <path d="M1.5 3 L5 6.5 L8.5 3" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </section>
  );
}
