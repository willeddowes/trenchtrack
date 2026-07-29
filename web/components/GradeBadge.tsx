// Colors are picked from the first letter of the grade (A/B/C/D/F) -- the
// +/- doesn't change the color, just the letter shown. Uses the "turf to
// rust" grade ramp defined as CSS variables in globals.css.
const GRADE_COLOR_VARS: Record<string, string> = {
  A: "--grade-a",
  B: "--grade-b",
  C: "--grade-c",
  D: "--grade-d",
  F: "--grade-f",
};

export function GradeBadge({
  label,
  grade,
  score,
}: {
  label: string;
  grade: string | null;
  score: number | null;
}) {
  const colorVar = grade ? GRADE_COLOR_VARS[grade[0]] : undefined;
  const style = colorVar
    ? {
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 16%, var(--surface))`,
        color: `var(${colorVar})`,
      }
    : { backgroundColor: "var(--surface)", color: "var(--ink-muted)" };

  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-2xl border border-line px-4 py-3"
      style={style}
    >
      <span className="text-[0.7rem] font-bold uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-2xl font-extrabold tracking-tight">{grade ?? "—"}</span>
      {score !== null && (
        <span className="font-mono text-xs tabular-nums opacity-70">{score.toFixed(0)}/100</span>
      )}
    </div>
  );
}
