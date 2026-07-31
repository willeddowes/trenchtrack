import { ordinal } from "@/lib/formatRank";

// Colors are picked from the first letter of the grade (A/B/C/D/F) -- the
// +/- doesn't change the color, just the letter shown. Uses the "turf to
// rust" grade ramp defined as CSS variables in globals.css. Exported so
// other grade-colored visuals (e.g. the stats bar chart) stay in sync.
export const GRADE_COLOR_VARS: Record<string, string> = {
  A: "--grade-a",
  B: "--grade-b",
  C: "--grade-c",
  D: "--grade-d",
  F: "--grade-f",
};

const SIZE_CLASSES = {
  md: { pad: "px-4 py-3", label: "text-[0.7rem]", letter: "text-2xl", score: "text-xs" },
  sm: { pad: "px-2.5 py-1.5", label: "text-[0.6rem]", letter: "text-lg", score: "text-[0.65rem]" },
};

export function GradeBadge({
  label,
  grade,
  score,
  rank = null,
  size = "md",
  className = "",
}: {
  label: string;
  grade: string | null;
  score: number | null;
  rank?: number | null;
  size?: "md" | "sm";
  className?: string;
}) {
  const colorVar = grade ? GRADE_COLOR_VARS[grade[0]] : undefined;
  const style = colorVar
    ? {
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 16%, var(--surface))`,
        color: `var(${colorVar})`,
      }
    : { backgroundColor: "var(--surface)", color: "var(--ink-muted)" };
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      className={`group relative flex flex-col items-center gap-0.5 rounded-2xl border border-line ${sizeClasses.pad} ${className}`}
      style={style}
    >
      <span className={`${sizeClasses.label} font-bold uppercase tracking-wide opacity-70`}>{label}</span>
      <span className={`${sizeClasses.letter} font-extrabold tracking-tight`}>{grade ?? "—"}</span>
      {rank !== null && (
        <span className={`${sizeClasses.score} font-semibold opacity-70`}>{ordinal(rank)} in NFL</span>
      )}
      {/* The exact score is hidden by default (so the badge stays letter-grade
          sized) and only appears as a tooltip on hover -- absolutely
          positioned so it never affects the badge's own layout height. */}
      {score !== null && (
        <span
          className={`pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono ${sizeClasses.score} font-bold tabular-nums opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100`}
          style={{ backgroundColor: "var(--ink)", color: "var(--surface)" }}
        >
          {score.toFixed(0)}/100
        </span>
      )}
    </div>
  );
}
