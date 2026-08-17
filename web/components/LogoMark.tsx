// The "Brushed Edge" mark: five bars shoulder-to-shoulder (LT-LG-C-RG-RT),
// each with a thin highlight along its top edge like a brushed-steel bevel.
// Sits inside the header's existing accent-colored badge in place of "TT".
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={className} aria-hidden="true">
      <g fill="currentColor">
        <rect x="20" y="60" width="16" height="46" />
        <rect x="44" y="44" width="16" height="62" />
        <rect x="68" y="20" width="16" height="86" />
        <rect x="92" y="50" width="16" height="56" />
        <rect x="116" y="64" width="16" height="42" />
      </g>
      <g stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round">
        <line x1="21" y1="60" x2="35" y2="60" />
        <line x1="45" y1="44" x2="59" y2="44" />
        <line x1="69" y1="20" x2="83" y2="20" />
        <line x1="93" y1="50" x2="107" y2="50" />
        <line x1="117" y1="64" x2="131" y2="64" />
      </g>
    </svg>
  );
}
