import type { ColorValue } from './tokens';

export type Rgb = readonly [number, number, number];

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isValidHex(hex: string): boolean {
  return HEX6.test(hex);
}

export function hexToRgb(hex: string): Rgb {
  if (!isValidHex(hex)) throw new Error(`Invalid hex colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** Composites a (possibly translucent) colour over an opaque background colour. */
export function blendOver(color: ColorValue, background: Rgb): Rgb {
  const [r, g, b] = hexToRgb(color.hex);
  const a = color.alpha ?? 1;
  const mix = (ch: number, bg: number) => Math.round(ch * a + bg * (1 - a));
  return [mix(r, background[0]), mix(g, background[1]), mix(b, background[2])];
}

function channelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/**
 * WCAG 2.1 contrast ratio of `fg` rendered over `bg`. Translucent backgrounds are first composited
 * over `base` (the page background), translucent foregrounds over the resulting background.
 */
export function contrastRatio(fg: ColorValue, bg: ColorValue, base: ColorValue): number {
  const baseRgb = hexToRgb(base.hex);
  const bgRgb = blendOver(bg, baseRgb);
  const fgRgb = blendOver(fg, bgRgb);
  const l1 = relativeLuminance(fgRgb);
  const l2 = relativeLuminance(bgRgb);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** `#rrggbb` or `rgb(r g b / a)` for CSS. */
export function toCss({ hex, alpha }: ColorValue): string {
  if (alpha === undefined || alpha === 1) return hex.toLowerCase();
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${Number(alpha.toFixed(3))})`;
}

/** `Color(0xAARRGGBB)` for Dart. */
export function toDart({ hex, alpha }: ColorValue): string {
  const a = Math.round((alpha ?? 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `Color(0x${(a + hex.slice(1)).toUpperCase()})`;
}
