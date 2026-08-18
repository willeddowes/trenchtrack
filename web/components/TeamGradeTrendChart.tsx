"use client";

import { useMemo, useState, type PointerEvent } from "react";
import type { TeamLeagueAverage, TeamWeeklyStat } from "@/lib/getTeamPageData";
import { ACCENT_FALLBACK_HEX, contrastRatio } from "@/lib/contrastColor";

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 30, right: 16, bottom: 28, left: 34 };

type MetricKey = "overall" | "pass" | "run";

const METRICS: {
  key: MetricKey;
  label: string;
  scoreKey: "overall_score" | "pass_block_score" | "run_block_score";
  gradeKey: "overall_grade" | "pass_block_grade" | "run_block_grade";
  avgKey: "avg_overall_score" | "avg_pass_block_score" | "avg_run_block_score";
  color: string;
}[] = [
  { key: "overall", label: "Overall", scoreKey: "overall_score", gradeKey: "overall_grade", avgKey: "avg_overall_score", color: "var(--series-overall)" },
  { key: "pass", label: "Pass Block", scoreKey: "pass_block_score", gradeKey: "pass_block_grade", avgKey: "avg_pass_block_score", color: "var(--series-pass)" },
  { key: "run", label: "Run Block", scoreKey: "run_block_score", gradeKey: "run_block_grade", avgKey: "avg_run_block_score", color: "var(--series-run)" },
];

/** Grade trend chart for one team's season -- a tab per metric (Overall /
 * Pass Block / Run Block) switches which line is drawn, using team_ol_stats'
 * full weekly history (see getTeamPageData.ts). Chart chrome (title, axes,
 * gridlines) is tinted with the team's own color per CLAUDE.md; the metric
 * lines themselves stay a fixed categorical color per metric so they read
 * the same on every team's page. */
export function TeamGradeTrendChart({
  weeklyStats,
  leagueAverages,
  season,
  teamColor,
}: {
  weeklyStats: TeamWeeklyStat[];
  leagueAverages: TeamLeagueAverage[];
  season: number;
  teamColor: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("overall");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  function toggleOpen() {
    setIsOpen((open) => {
      if (open) setHoverIndex(null); // clear a stale crosshair from before it was collapsed
      return !open;
    });
  }

  const metric = METRICS.find((m) => m.key === activeMetric)!;

  const points = useMemo(
    () =>
      weeklyStats
        .map((w) => ({ week: w.week, score: w[metric.scoreKey], grade: w[metric.gradeKey] }))
        .filter((p): p is { week: number; score: number; grade: string | null } => p.score !== null),
    [weeklyStats, metric]
  );

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const xFor = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const yFor = (score: number) => PAD.top + (1 - score / 100) * plotH;

  const chromeColor = teamColor ?? ACCENT_FALLBACK_HEX;
  const titleReadable = contrastRatio(chromeColor, "#ffffff") >= 4.5;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.score)}`).join(" ");
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  // League-average reference line -- matched to the team's own played weeks
  // (so it shares the same x-scale/index as the team line, byes included),
  // not drawn as its own categorical series since it's a baseline, not an
  // identity the reader needs to tell apart from other teams.
  const avgByWeek = new Map(leagueAverages.map((a) => [a.week, a[metric.avgKey]]));
  const avgLinePoints = points
    .map((p, i) => ({ i, avg: avgByWeek.get(p.week) ?? null }))
    .filter((p): p is { i: number; avg: number } => p.avg !== null);
  const avgLinePath = avgLinePoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${xFor(p.i)} ${yFor(p.avg)}`).join(" ");
  const hoveredAvg = hovered ? avgByWeek.get(hovered.week) ?? null : null;

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = rect.width / WIDTH;
    const localX = (e.clientX - rect.left) / scaleX;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - localX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <h2
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: titleReadable ? chromeColor : "var(--ink-muted)" }}
        >
          Weekly Grade Trend over {season}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted transition-colors hover:text-ink">
          {isOpen ? "Hide Chart" : "View Chart"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}
          >
            <path d="M1.5 3 L5 6.5 L8.5 3" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-ink-muted">
              <svg width="16" height="8" viewBox="0 0 16 8">
                <line x1="0" y1="4" x2="16" y2="4" stroke="var(--ink-muted)" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              League Avg
            </span>
            <div className="flex gap-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setActiveMetric(m.key);
                  setHoverIndex(null);
                }}
                className="rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide transition-colors"
                style={
                  m.key === activeMetric
                    ? {
                        borderColor: m.color,
                        color: m.color,
                        backgroundColor: `color-mix(in srgb, ${m.color} 14%, var(--surface))`,
                      }
                    : { borderColor: "var(--line)", color: "var(--ink-muted)" }
                }
              >
                {m.label}
              </button>
            ))}
            </div>
          </div>

          {points.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">No grades recorded yet this season.</p>
          ) : (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full touch-none"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoverIndex(null)}
            >
              {[0, 50, 100].map((tick) => (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                    stroke={chromeColor}
                    strokeOpacity={0.15}
                    strokeWidth={1}
                  />
                  <text x={PAD.left - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" style={{ fill: "var(--ink-muted)" }} fontSize={9}>
                    {tick}
                  </text>
                </g>
              ))}

              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={HEIGHT - PAD.bottom}
                y2={HEIGHT - PAD.bottom}
                stroke={chromeColor}
                strokeOpacity={0.4}
                strokeWidth={1}
              />

              {points.map((p, i) => (
                <text
                  key={p.week}
                  x={xFor(i)}
                  y={HEIGHT - PAD.bottom + 14}
                  textAnchor="middle"
                  style={{ fill: "var(--ink-muted)" }}
                  fontSize={9}
                >
                  {p.week}
                </text>
              ))}

              {avgLinePoints.length > 1 && (
                <path
                  d={avgLinePath}
                  fill="none"
                  stroke="var(--ink-muted)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {points.length > 1 && (
                <path d={linePath} fill="none" stroke={metric.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              )}

              {hovered && (
                <line
                  x1={xFor(hoverIndex!)}
                  x2={xFor(hoverIndex!)}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  stroke="var(--ink-muted)"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
              )}

              {points.map((p, i) => (
                <g key={p.week}>
                  <circle
                    cx={xFor(i)}
                    cy={yFor(p.score)}
                    r={4}
                    fill={metric.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                    tabIndex={0}
                    aria-label={`Week ${p.week}: ${metric.label} ${p.score.toFixed(0)} out of 100${p.grade ? `, grade ${p.grade}` : ""}`}
                    onFocus={() => setHoverIndex(i)}
                    onBlur={() => setHoverIndex((h) => (h === i ? null : h))}
                    style={{ cursor: "pointer" }}
                  />
                  {p.grade && (
                    <text x={xFor(i)} y={yFor(p.score) - 10} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: "var(--ink)" }}>
                      {p.grade}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}

          {hovered && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-2">
                <span className="font-bold text-ink">Week {hovered.week}</span>
                <span className="text-ink-muted">
                  {metric.label}: <span className="font-bold text-ink">{hovered.score.toFixed(0)}/100</span>
                  {hovered.grade && <> ({hovered.grade})</>}
                </span>
              </span>
              {hoveredAvg !== null && (
                <span className="text-ink-muted">
                  League Avg: <span className="font-bold text-ink">{hoveredAvg.toFixed(0)}/100</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
