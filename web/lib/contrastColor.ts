// Must match --accent in globals.css -- used as the fallback chrome color
// wherever a team has no primary_color set. Contrast math needs the literal
// hex, not the CSS var, so this stays a second source of truth (same
// tradeoff as the grading formula's Python/TS duplication -- keep in sync
// if --accent ever changes).
export const ACCENT_FALLBACK_HEX = "#2f5233";

// WCAG contrast ratio (relative luminance formula) -- shared by anything
// that colors a chrome element with a team's primary_color and needs to
// know whether white or dark text/backgrounds stay legible on top of it
// (teams with a light color like gold/yellow need the darker option).
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

// White text on `bgHex` if that clears WCAG AA (4.5:1), otherwise dark ink.
export function readableTextColor(bgHex: string): string {
  return contrastRatio(bgHex, "#ffffff") >= 4.5 ? "#ffffff" : "#1a1a1a";
}
