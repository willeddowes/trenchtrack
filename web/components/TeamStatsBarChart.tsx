"use client";

import { useEffect } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import type { TeamStatsRow } from "@/lib/getTeamStatsData";
import type { StatsColumn } from "@/lib/statsColumns";

// A magnitude comparison across many categories (32 teams) is a bar chart
// with a single sequential hue -- per the dataviz skill's form guidance,
// NOT per-team categorical colors (32 distinct hues isn't viable, and
// isn't the job here: identity comes from the team name/logo label, not
// color). Bars stay a single accent color throughout.
export function TeamStatsBarChart({
  rows,
  column,
  season,
  onClose,
}: {
  rows: TeamStatsRow[]; // already sorted the same way the table is
  column: StatsColumn;
  season: number;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const values = rows.map((r) => column.value(r));
  // Scale bars against the real max among these 32 teams, not an assumed
  // ceiling -- several metrics (pressure rate, stuff rate) are fractions
  // always under 1, so a hardcoded floor there would flatten every bar.
  const max = Math.max(...values.filter((v): v is number => v !== null)) || 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">{column.label}</h2>
            <p className="text-xs text-ink-muted">All 32 teams &middot; {season} season</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart"
            className="rounded-full border border-line px-2.5 py-1 text-sm font-bold text-ink-muted hover:border-accent hover:text-ink"
          >
            &times;
          </button>
        </div>

        <div className="space-y-1">
          {rows.map((row, i) => {
            const value = values[i];
            const pct = value !== null ? Math.max(2, (value / max) * 100) : 0;
            return (
              <div
                key={row.team_abbr}
                className="group flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-background"
              >
                <div className="flex w-36 shrink-0 items-center gap-2">
                  <TeamLogo team={row} size={18} />
                  <span className="truncate text-xs font-semibold group-hover:font-bold">
                    {row.team_nickname}
                  </span>
                </div>
                <div className="h-6 flex-1 rounded bg-line/30">
                  {value !== null && (
                    <div
                      className="h-full rounded-r bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink-muted">
                  {column.format(row)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
