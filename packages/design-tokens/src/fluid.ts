import { fluidRange } from './tokens';

const round = (n: number, digits = 4) => Number(n.toFixed(digits));
const rem = (px: number) => `${round(px / 16)}rem`;

/**
 * Fluid size between `min` px (at 360 px viewport) and `max` px (at 1440 px viewport).
 * Uses a rem + vw preferred value so text still scales with browser zoom (WCAG 1.4.4).
 */
export function fluidCss(min: number, max: number, range = fluidRange): string {
  if (min === max) return rem(min);
  if (max < min) throw new Error(`Fluid range inverted: ${min} > ${max}`);
  const slope = (max - min) / (range.maxViewport - range.minViewport);
  const intercept = min - slope * range.minViewport;
  return `clamp(${rem(min)}, ${rem(intercept)} + ${round(slope * 100)}vw, ${rem(max)})`;
}

/** The same interpolation as `fluidCss`, evaluated for a concrete viewport width (px). */
export function fluidAt(min: number, max: number, viewport: number, range = fluidRange): number {
  if (min === max) return min;
  const t = (viewport - range.minViewport) / (range.maxViewport - range.minViewport);
  return Math.min(max, Math.max(min, min + (max - min) * t));
}
