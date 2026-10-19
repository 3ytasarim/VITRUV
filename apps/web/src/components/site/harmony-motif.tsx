import { cx } from '@/components/ui';

/**
 * Vitruvian line geometry — circle, inscribed square, triangle (the prototype's
 * "Körper · Seele · Geist" symbol in Website.dc.html). Thin lines at low opacity, decorative only;
 * this is a geometric motif, not the VITRUV logo (the logo is never redrawn).
 */
export function HarmonyMotif({
  className,
  draw = true,
  float = false,
}: {
  className?: string;
  /** Draw the lines on first paint (static under reduced motion). */
  draw?: boolean;
  /** Very slow ambient drift (static under reduced motion). */
  float?: boolean;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 100 100"
      className={cx(
        'vt-harmony',
        draw && 'vt-harmony--draw',
        float && 'vt-harmony--float',
        className,
      )}
    >
      <circle cx="50" cy="50" r="48" pathLength={1} />
      <rect x="16.06" y="16.06" width="67.88" height="67.88" pathLength={1} />
      <path d="M50 16.06 L83.94 83.94 L16.06 83.94 Z" pathLength={1} />
    </svg>
  );
}
