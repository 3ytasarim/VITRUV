import { Barlow, Barlow_Condensed, Bodoni_Moda, Chakra_Petch, Jost } from 'next/font/google';

/**
 * VITRUV fonts (SIL OFL 1.1). Subset: latin only — it covers German (incl. ä ö ü ß) and the
 * preloaded files stay small; latin-ext was measured as ~60 KB of unused preloads (Sprint 3 C).
 * Rare glyphs outside latin fall back to the metric-adjusted system fallback.
 * next/font downloads them at build time and self-hosts them —
 * no runtime request to Google — and generates metric-adjusted fallbacks to avoid layout shift.
 *
 * Weights/styles must match `fontFaces` in packages/design-tokens/src/tokens.ts
 * (enforced by the design-token sync test). The CSS variable names are referenced by the
 * generated `tokens.generated.css`.
 */
export const chakraPetch = Chakra_Petch({
  weight: ['700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-chakra-petch',
  display: 'swap',
  // reference CSS: font-family: '<Family>', sans-serif — no generated fallback face
  fallback: ['sans-serif'],
  adjustFontFallback: false,
});

export const barlowCondensed = Barlow_Condensed({
  weight: ['600'],
  style: ['normal'],
  subsets: ['latin'],
  variable: '--font-barlow-condensed',
  display: 'swap',
  // reference CSS: font-family: '<Family>', sans-serif — no generated fallback face
  fallback: ['sans-serif'],
  adjustFontFallback: false,
});

export const barlow = Barlow({
  weight: ['400', '500', '600'],
  style: ['normal'],
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
  // reference CSS: font-family: '<Family>', sans-serif — no generated fallback face
  fallback: ['sans-serif'],
  adjustFontFallback: false,
});

export const fontVariables = [chakraPetch.variable, barlowCondensed.variable, barlow.variable].join(
  ' ',
);

/**
 * Public-surface fonts ('Greek Harmony', SIL OFL 1.1) — must match `publicFontFaces` in tokens.ts.
 * Only the public site and the login apply these variables (see publicFontVariables), so admin
 * pages do not preload them.
 */
export const jost = Jost({
  weight: ['300', '400', '500', '600'],
  style: ['normal'],
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

export const bodoniModa = Bodoni_Moda({
  weight: ['500'],
  style: ['italic'],
  subsets: ['latin'],
  variable: '--font-bodoni-moda',
  display: 'swap',
});

export const publicFontVariables = [jost.variable, bodoniModa.variable].join(' ');
