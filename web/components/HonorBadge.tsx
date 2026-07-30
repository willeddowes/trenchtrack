const HONOR_LABELS: Record<string, string> = {
  pro_bowl: "Pro Bowl",
  all_pro_1st: "1st All-Pro",
  all_pro_2nd: "2nd All-Pro",
};

// Small star mark (plain SVG, not an emoji) so All-Pro/Pro Bowl reads as
// an award rather than reusing a grade-letter shape.
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6z" />
    </svg>
  );
}

// All-Pro uses the gold "C" grade tone (--grade-c) at low tint -- reads as
// "award," distinct from the green/red good/bad tokens used everywhere
// else on the page -- rather than introducing a new color for this alone.
// Pro Bowl stays neutral gray since it's the more common of the two honors.
export function HonorBadge({ honor }: { honor: string }) {
  const label = HONOR_LABELS[honor];
  if (!label) return null;

  const isAllPro = honor === "all_pro_1st" || honor === "all_pro_2nd";
  const style = isAllPro
    ? {
        backgroundColor: `color-mix(in srgb, var(--grade-c) ${honor === "all_pro_1st" ? 18 : 10}%, var(--surface))`,
        color: "var(--grade-c)",
      }
    : {
        backgroundColor: "color-mix(in srgb, var(--ink-muted) 12%, var(--surface))",
        color: "var(--ink-muted)",
      };

  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold" style={style}>
      <StarIcon />
      {label}
    </span>
  );
}
