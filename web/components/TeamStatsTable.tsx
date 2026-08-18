"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TeamLogo } from "@/components/TeamLogo";
import { GRADE_COLOR_VARS } from "@/components/GradeBadge";
import { TeamStatsBarChart } from "@/components/TeamStatsBarChart";
import type { TeamStatsRow } from "@/lib/getTeamStatsData";
import { STATS_COLUMNS, type ColumnKey } from "@/lib/statsColumns";

export function TeamStatsTable({ rows, season }: { rows: TeamStatsRow[]; season: number }) {
  const [sortKey, setSortKey] = useState<ColumnKey>("overall");
  const [reversed, setReversed] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);

  const activeColumn = STATS_COLUMNS.find((c) => c.key === sortKey)!;

  const sortedRows = useMemo(() => {
    const withValues = rows.map((row) => ({ row, value: activeColumn.value(row) }));
    withValues.sort((a, b) => {
      if (a.value === null && b.value === null) return 0;
      if (a.value === null) return 1; // nulls always last
      if (b.value === null) return -1;
      const bestFirst = activeColumn.higherIsBetter ? b.value - a.value : a.value - b.value;
      return reversed ? -bestFirst : bestFirst;
    });
    return withValues.map((w) => w.row);
  }, [rows, activeColumn, reversed]);

  function handleHeaderClick(key: ColumnKey) {
    if (key === sortKey) {
      setReversed((r) => !r);
    } else {
      setSortKey(key);
      setReversed(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setChartOpen(true)}
        className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-ink hover:opacity-90"
      >
        Chart It
      </button>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 z-20 border-r border-line bg-surface px-4 py-3">Team</th>
              {STATS_COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleHeaderClick(col.key)}
                    className="inline-flex items-center gap-1 font-bold uppercase tracking-wide hover:text-ink"
                  >
                    {col.label}
                    {sortKey === col.key && <span aria-hidden>{reversed ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedRows.map((row) => (
              <tr key={row.team_abbr} className="group hover:bg-background">
                <td className="sticky left-0 z-10 border-r border-line bg-surface px-4 py-2 group-hover:bg-background">
                  <Link href={`/team/${row.slug}/${season}`} className="flex items-center gap-2 hover:text-accent">
                    <TeamLogo team={row} size={24} />
                    <span className="font-semibold">{row.team_nickname}</span>
                  </Link>
                </td>
                {STATS_COLUMNS.map((col) => {
                  const grade = col.grade?.(row) ?? null;
                  const colorVar = grade ? GRADE_COLOR_VARS[grade[0]] : undefined;
                  return (
                    <td key={col.key} className="px-3 py-2 text-right font-mono tabular-nums">
                      {grade && (
                        <span
                          className="mr-1.5 font-bold"
                          style={colorVar ? { color: `var(${colorVar})` } : undefined}
                        >
                          {grade}
                        </span>
                      )}
                      {col.format(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chartOpen && (
        <TeamStatsBarChart
          rows={sortedRows}
          column={activeColumn}
          season={season}
          onClose={() => setChartOpen(false)}
        />
      )}
    </div>
  );
}
