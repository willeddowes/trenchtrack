// Colors are picked from the first letter of the grade (A/B/C/D/F) --
// the +/- doesn't change the color, just the letter shown.
const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-300",
  B: "bg-lime-100 text-lime-800 border-lime-300",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300",
  D: "bg-orange-100 text-orange-800 border-orange-300",
  F: "bg-red-100 text-red-800 border-red-300",
};
const UNGRADED_COLOR = "bg-gray-100 text-gray-500 border-gray-300";

export function GradeBadge({
  label,
  grade,
  score,
}: {
  label: string;
  grade: string | null;
  score: number | null;
}) {
  const colorClass = grade ? (GRADE_COLORS[grade[0]] ?? UNGRADED_COLOR) : UNGRADED_COLOR;

  return (
    <div className={`flex flex-col items-center rounded-lg border px-4 py-3 ${colorClass}`}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-2xl font-bold">{grade ?? "—"}</span>
      {score !== null && <span className="text-xs opacity-70">{score.toFixed(0)}/100</span>}
    </div>
  );
}
