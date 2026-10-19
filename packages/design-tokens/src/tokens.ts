/**
 * VITRUV design tokens — the single source of truth for web (CSS/Tailwind) and Flutter (Dart).
 *
 * Source: master prototype `Website Funktional / Funktional Dunkel` (see docs/DESIGN-SYSTEM.md).
 * Each value notes its prototype origin; intentional deviations are marked `DEVIATION`.
 *
 * Edit this file, then run `pnpm --filter @vitruv/design-tokens generate`.
 * Generated outputs (never edit by hand):
 *   apps/web/src/styles/tokens.generated.css
 *   apps/mobile/lib/core/theme/vitruv_tokens.g.dart
 */

/** A colour: 6-digit hex plus optional alpha (0..1). Alpha colours are rendered over their background. */
export interface ColorValue {
  hex: `#${string}`;
  alpha?: number;
}

const c = (hex: `#${string}`, alpha?: number): ColorValue =>
  alpha === undefined ? { hex } : { hex, alpha };

// ---------------------------------------------------------------------------------------------
// Palette (raw values — referenced only by semantic tokens below, never by components)
// ---------------------------------------------------------------------------------------------
export const palette = {
  ink950: '#050505', // prototype page background
  ink900: '#0a0a0a', // prototype rare nested surface
  ink850: '#0e0e0e', // prototype card / media-slot surface
  paper50: '#f2f2ee', // prototype main text
  paper100: '#f6f6f3', // light variant background
  paper200: '#ecece8', // light variant alt background
  inkCool: '#0e1014', // light variant text
  white: '#ffffff',
  blue400: '#5b9dff', // prototype labels, links, hover (text-safe)
  blue500: '#4d8dff', // prototype fills (primary button, headline highlight)
  blue600: '#1f5fe0', // light variant accent
  blue700: '#184bb8', // light variant hover (darker, keeps white label ≥ 4.5:1)
  glowBlue: '#468cff', // prototype rgba(70,140,255,·) glow
  glowHalo: '#a0cdff', // prototype rgba(160,205,255,·) inner halo
  // System status — not in the prototype; production addition chosen for ≥ 4.5:1 on ink950/ink850.
  green400: '#3ddc97',
  amber400: '#ffc24b',
  red400: '#ff6b6b',
  green700: '#0f7a4d',
  amber700: '#9a5b00',
  red700: '#c62828',
  // Public website — 'Greek Harmony' direction (prototype Website.dc.html, owner decision 2026-10-16)
  creamPaper: '#f2efe9', // page (prototype #f6f4f0 → slightly deeper so cards lift off it)
  creamCard: '#faf8f4', // cards / raised surfaces
  creamSunken: '#e9e4db', // alternating bands, map ground
  inkWarm: '#2b2825', // prototype text / dark pill
  inkWarmHover: '#45403a',
  stoneMuted: '#57524c', // body copy (6.7:1 on paper)
  stone: '#6f6a64', // prototype secondary text (4.7:1 on paper)
  gold: '#a3906f', // prototype accent — LARGE/decorative only (2.9:1)
  goldDeep: '#7a6747', // text-safe gold for eyebrows/links (4.7:1 on paper)
  terracotta: '#cf5a3c', // Journey route (reference screenshot red route)
  // 'Website Funktional' reference design (owner decision 2026-10-19): electric blue accent on black
  blue: '#4d8dff', // fills — buttons, Journey route, accent words
  blueText: '#5b9dff', // text accents — eyebrows, links, FAQ +
  // Admin panel — warm-neutral light (Cross-Project Addendum 2026-10-16): calmer than the cream site
  adminCanvas: '#f4f2ee',
  adminSunken: '#ebe7e0',
  // Glass panels (admin + client area, owner decision 2026-10-19): monochrome on near-black
  glassCanvas: '#070708',
  glassInk: '#f4f4f5',
  glassInkSoft: '#e4e4e7',
  glassMist: '#d4d4d8',
} as const satisfies Record<string, `#${string}`>;

export type ColorRole =
  | 'bg'
  | 'surface'
  | 'surfaceSunken'
  | 'surfaceHover'
  | 'overlay'
  | 'fg'
  | 'fgMuted'
  | 'fgSubtle'
  | 'fgDisabled'
  | 'accent'
  | 'accentHover'
  | 'accentText'
  | 'onAccent'
  | 'border'
  | 'borderSubtle'
  | 'borderStrong'
  | 'focusRing'
  | 'success'
  | 'warning'
  | 'error';

export const REQUIRED_COLOR_ROLES: readonly ColorRole[] = [
  'bg',
  'surface',
  'surfaceSunken',
  'surfaceHover',
  'overlay',
  'fg',
  'fgMuted',
  'fgSubtle',
  'fgDisabled',
  'accent',
  'accentHover',
  'accentText',
  'onAccent',
  'border',
  'borderSubtle',
  'borderStrong',
  'focusRing',
  'success',
  'warning',
  'error',
];

/** Production master theme (dark). */
export const colorsDark: Record<ColorRole, ColorValue> = {
  bg: c(palette.ink950),
  surface: c(palette.ink850),
  surfaceSunken: c(palette.ink900),
  surfaceHover: c(palette.white, 0.03), // prototype rgba(255,255,255,0.03) hover wash
  overlay: c(palette.ink950, 0.72), // glass header / menu scrim
  fg: c(palette.paper50),
  fgMuted: c(palette.paper50, 0.66), // prototype body copy
  fgSubtle: c(palette.paper50, 0.5), // DEVIATION: prototype 0.45 = 4.11:1 (fails AA) → 0.50 = 4.87:1
  fgDisabled: c(palette.paper50, 0.35), // disabled controls only (WCAG 1.4.3 exempt) — never body text
  accent: c(palette.blue500),
  accentHover: c(palette.blue400),
  accentText: c(palette.blue400),
  onAccent: c(palette.ink950), // prototype: dark label on blue
  border: c(palette.white, 0.1), // prototype default hairline
  borderSubtle: c(palette.white, 0.07),
  borderStrong: c(palette.white, 0.22),
  focusRing: c(palette.blue400),
  success: c(palette.green400),
  warning: c(palette.amber400),
  error: c(palette.red400),
};

/** Light variant (`Funktional Hell`) — kept compatible, not a production focus. */
export const colorsLight: Record<ColorRole, ColorValue> = {
  bg: c(palette.paper100),
  surface: c(palette.white),
  surfaceSunken: c(palette.paper200),
  surfaceHover: c('#000000', 0.03),
  overlay: c(palette.paper100, 0.8),
  fg: c(palette.inkCool),
  fgMuted: c(palette.inkCool, 0.7),
  fgSubtle: c(palette.inkCool, 0.62), // DEVIATION: prototype 0.45 = 3.0:1 → 0.62
  fgDisabled: c(palette.inkCool, 0.38),
  accent: c(palette.blue600),
  accentHover: c(palette.blue700), // prototype hover lightens; on light bg that drops white text to 3.2:1
  accentText: c(palette.blue600),
  onAccent: c(palette.white),
  border: c('#000000', 0.1),
  borderSubtle: c('#000000', 0.07),
  borderStrong: c('#000000', 0.22),
  focusRing: c(palette.blue600),
  success: c(palette.green700),
  warning: c(palette.amber700),
  error: c(palette.red700),
};

/**
 * Public website surface ('Greek Harmony'): warm, light, editorial. Applied with
 * data-surface="public" (public site + login); admin and the app keep their own themes.
 */
export const colorsPublic: Record<ColorRole, ColorValue> = {
  bg: c(palette.creamPaper),
  surface: c(palette.creamCard),
  surfaceSunken: c(palette.creamSunken),
  surfaceHover: c(palette.inkWarm, 0.03),
  overlay: c(palette.creamPaper, 0.86),
  fg: c(palette.inkWarm),
  fgMuted: c(palette.stoneMuted),
  fgSubtle: c(palette.stone),
  fgDisabled: c(palette.inkWarm, 0.38),
  accent: c(palette.inkWarm), // primary pill: ink fill, cream label
  accentHover: c(palette.inkWarmHover),
  accentText: c(palette.goldDeep),
  onAccent: c(palette.creamPaper),
  border: c(palette.inkWarm, 0.12),
  borderSubtle: c(palette.inkWarm, 0.07),
  borderStrong: c(palette.inkWarm, 0.24),
  focusRing: c(palette.goldDeep),
  success: c(palette.green700),
  warning: c(palette.amber700),
  error: c(palette.red700),
};

/**
 * Admin surface: functional, warm-neutral light. Same ink/gold family as the public site (one
 * brand from website → login → panel) but white cards on a quieter canvas for dense data.
 * Applied with data-surface="admin" on the admin shell.
 */
export const colorsAdmin: Record<ColorRole, ColorValue> = {
  bg: c(palette.adminCanvas),
  surface: c(palette.white),
  surfaceSunken: c(palette.adminSunken),
  surfaceHover: c(palette.inkWarm, 0.04),
  overlay: c(palette.adminCanvas, 0.86),
  fg: c(palette.inkWarm),
  fgMuted: c(palette.stoneMuted),
  fgSubtle: c(palette.stone),
  fgDisabled: c(palette.inkWarm, 0.38),
  accent: c(palette.inkWarm),
  accentHover: c(palette.inkWarmHover),
  accentText: c(palette.goldDeep),
  onAccent: c(palette.white),
  border: c(palette.inkWarm, 0.12),
  borderSubtle: c(palette.inkWarm, 0.07),
  borderStrong: c(palette.inkWarm, 0.24),
  focusRing: c(palette.goldDeep),
  success: c(palette.green700),
  warning: c(palette.amber700),
  error: c(palette.red700),
};

/**
 * Glass surface (owner decision 2026-10-19, template "glassy CRM dashboard", monochrome): frosted
 * translucent panels on a near-black faceted backdrop. Applied with data-glass on the admin
 * shell and the client area. Surfaces are translucent white — contrast is checked composited
 * over the canvas.
 */
export const colorsGlass: Record<ColorRole, ColorValue> = {
  bg: c(palette.glassCanvas),
  surface: c(palette.white, 0.06),
  surfaceSunken: c(palette.white, 0.03),
  surfaceHover: c(palette.white, 0.08),
  overlay: c(palette.glassCanvas, 0.8),
  fg: c(palette.glassInk),
  fgMuted: c(palette.white, 0.72),
  fgSubtle: c(palette.white, 0.58),
  fgDisabled: c(palette.white, 0.34),
  accent: c(palette.glassInk),
  accentHover: c(palette.glassInkSoft),
  accentText: c(palette.glassMist),
  onAccent: c(palette.glassCanvas),
  border: c(palette.white, 0.14),
  borderSubtle: c(palette.white, 0.08),
  borderStrong: c(palette.white, 0.26),
  focusRing: c(palette.white),
  success: c(palette.green400),
  warning: c(palette.amber400),
  error: c(palette.red400),
};

/** Decorative public colours (no text use below 24 px): gold accents, Journey route. */
/**
 * Ready-made website palettes for the CMS theme editor ("Farben & Design"). Only the roles that
 * differ from the current theme are set; background/text stay whatever the owner chose.
 */
export const themePresets = {
  /** Black/white site with the electric blue of the 'Website Funktional' reference design. */
  blue: {
    button: palette.blue,
    buttonText: palette.ink950,
    accent: palette.blue,
    accentSecondary: palette.blue,
    eyebrow: palette.blueText,
  },
} as const;

export const decorativeColors = {
  brandGold: c(palette.gold),
  route: c(palette.terracotta),
} as const;

// ---------------------------------------------------------------------------------------------
// Contrast requirements — enforced by tests (WCAG 2.1; alpha blended onto the background)
// ---------------------------------------------------------------------------------------------
export interface ContrastRequirement {
  fg: ColorRole;
  bg: ColorRole;
  /** 4.5 = normal text (AA), 3 = large text / UI components (AA). */
  min: number;
  note: string;
}

export const contrastRequirements: readonly ContrastRequirement[] = [
  { fg: 'fg', bg: 'bg', min: 4.5, note: 'primary text on page' },
  { fg: 'fg', bg: 'surface', min: 4.5, note: 'primary text on cards' },
  { fg: 'fgMuted', bg: 'bg', min: 4.5, note: 'body copy on page' },
  { fg: 'fgMuted', bg: 'surface', min: 4.5, note: 'body copy on cards' },
  { fg: 'fgSubtle', bg: 'bg', min: 4.5, note: 'captions/meta on page' },
  { fg: 'fgSubtle', bg: 'surface', min: 4.5, note: 'captions/meta on cards' },
  { fg: 'accentText', bg: 'bg', min: 4.5, note: 'eyebrows, links on page' },
  { fg: 'accentText', bg: 'surface', min: 4.5, note: 'eyebrows, links on cards' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, note: 'primary button label' },
  { fg: 'onAccent', bg: 'accentHover', min: 4.5, note: 'primary button label (hover)' },
  { fg: 'focusRing', bg: 'bg', min: 3, note: 'focus indicator (non-text, 1.4.11)' },
  { fg: 'accent', bg: 'bg', min: 3, note: 'accent fills as UI boundary (1.4.11)' },
  { fg: 'success', bg: 'surface', min: 4.5, note: 'status text' },
  { fg: 'warning', bg: 'surface', min: 4.5, note: 'status text' },
  { fg: 'error', bg: 'surface', min: 4.5, note: 'status / form error text' },
];

// ---------------------------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------------------------
export const fontFamilies = {
  heading: { family: 'Chakra Petch', fallback: ['system-ui', 'sans-serif'] },
  label: { family: 'Barlow Condensed', fallback: ['Arial Narrow', 'system-ui', 'sans-serif'] },
  body: { family: 'Barlow', fallback: ['system-ui', 'sans-serif'] },
} as const;
export type FontFamilyRole = keyof typeof fontFamilies;

/** Exactly the font files/weights that are loaded (web + Flutter). OFL, verified. */
export const fontFaces = [
  { family: 'heading', weight: 700, italic: false },
  { family: 'heading', weight: 700, italic: true },
  { family: 'label', weight: 600, italic: false },
  { family: 'body', weight: 400, italic: false },
  { family: 'body', weight: 500, italic: false },
  { family: 'body', weight: 600, italic: false },
] as const satisfies readonly { family: FontFamilyRole; weight: number; italic: boolean }[];

export interface TypeRole {
  family: FontFamilyRole;
  weight: 400 | 500 | 600 | 700;
  italic?: boolean;
  uppercase?: boolean;
  /** Font size in px at the smallest viewport (360 px). */
  min: number;
  /** Font size in px at the largest fluid viewport (1440 px). Equal to `min` = fixed size. */
  max: number;
  lineHeight: number;
  /** Tracking in em. */
  letterSpacing: number;
}

export type TypeRoleName =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'eyebrow'
  | 'bodyLg'
  | 'body'
  | 'bodySm'
  | 'caption'
  | 'button';

export const typeScale: Record<TypeRoleName, TypeRole> = {
  // prototype hero: clamp(40px, 5.6vw, 80px), italic, -0.01em, lh 1
  display: {
    family: 'heading',
    weight: 700,
    italic: true,
    uppercase: true,
    min: 40,
    max: 80,
    lineHeight: 1,
    letterSpacing: -0.01,
  },
  // prototype largest section title: clamp(30px, 4.2vw, 54px)
  h1: {
    family: 'heading',
    weight: 700,
    uppercase: true,
    min: 32,
    max: 54,
    lineHeight: 1.04,
    letterSpacing: -0.005,
  },
  // prototype standard section title: clamp(28px, 3.6vw, 48px) (9×)
  h2: {
    family: 'heading',
    weight: 700,
    uppercase: true,
    min: 28,
    max: 48,
    lineHeight: 1.05,
    letterSpacing: -0.005,
  },
  // prototype journey/CTA emphasis titles (italic variant applied per use)
  h3: {
    family: 'heading',
    weight: 700,
    uppercase: true,
    min: 22,
    max: 30,
    lineHeight: 1.1,
    letterSpacing: 0,
  },
  // prototype package/card titles: Barlow 19–24px
  title: { family: 'body', weight: 500, min: 19, max: 22, lineHeight: 1.35, letterSpacing: 0 },
  // prototype labels 11–12px, 0.18–0.24em. DEVIATION: fixed 12px (11px dropped for legibility)
  eyebrow: {
    family: 'label',
    weight: 600,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1.3,
    letterSpacing: 0.22,
  },
  // prototype 17–19px lead copy
  bodyLg: { family: 'body', weight: 400, min: 17, max: 19, lineHeight: 1.7, letterSpacing: 0 },
  // prototype 16px, lh 1.7
  body: { family: 'body', weight: 400, min: 16, max: 16, lineHeight: 1.7, letterSpacing: 0 },
  // prototype 13–15px lists/meta
  bodySm: { family: 'body', weight: 400, min: 14, max: 14, lineHeight: 1.6, letterSpacing: 0 },
  // prototype "TEILNEHMER 01" meta 11px. DEVIATION: 12px minimum
  caption: {
    family: 'label',
    weight: 600,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1.3,
    letterSpacing: 0.16,
  },
  // prototype buttons 11–12px, 0.16–0.24em
  button: {
    family: 'label',
    weight: 600,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1,
    letterSpacing: 0.2,
  },
};

/**
 * Public surface typography (web only — the app keeps Barlow/Chakra Petch). Jost (SIL OFL) is the
 * licensed stand-in for the prototype's unlicensed Avenir Next; Bodoni Moda (SIL OFL) is the
 * prototype's italic serif for highlighted words.
 */
export const publicFontFamilies = {
  sans: { family: 'Jost', fallback: ['Futura', 'Century Gothic', 'system-ui', 'sans-serif'] },
  serif: { family: 'Bodoni Moda', fallback: ['Didot', 'Bodoni 72', 'Georgia', 'serif'] },
} as const;
export type PublicFontFamilyRole = keyof typeof publicFontFamilies;

export const publicFontFaces = [
  { family: 'sans', weight: 300, italic: false },
  { family: 'sans', weight: 400, italic: false },
  { family: 'sans', weight: 500, italic: false },
  { family: 'sans', weight: 600, italic: false }, // form labels / table heads (font-semibold)
  { family: 'serif', weight: 500, italic: true },
] as const satisfies readonly { family: PublicFontFamilyRole; weight: number; italic: boolean }[];

export interface PublicTypeRole extends Omit<TypeRole, 'family' | 'weight'> {
  family: PublicFontFamilyRole;
  weight: 300 | 400 | 500;
}

/** prototype Website.dc.html: thin large headlines, tracked small caps labels, airy body. */
export const publicTypeScale: Record<TypeRoleName, PublicTypeRole> = {
  display: {
    family: 'sans',
    weight: 300,
    min: 44,
    max: 96,
    lineHeight: 1.04,
    letterSpacing: -0.015,
  },
  h1: { family: 'sans', weight: 300, min: 36, max: 64, lineHeight: 1.08, letterSpacing: -0.012 },
  h2: { family: 'sans', weight: 300, min: 32, max: 54, lineHeight: 1.1, letterSpacing: -0.01 },
  h3: { family: 'sans', weight: 400, min: 23, max: 32, lineHeight: 1.18, letterSpacing: -0.005 },
  title: { family: 'sans', weight: 400, min: 19, max: 22, lineHeight: 1.35, letterSpacing: 0 },
  eyebrow: {
    family: 'sans',
    weight: 500,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1.4,
    letterSpacing: 0.26,
  },
  bodyLg: { family: 'sans', weight: 400, min: 17, max: 19, lineHeight: 1.75, letterSpacing: 0 },
  body: { family: 'sans', weight: 400, min: 16, max: 17, lineHeight: 1.78, letterSpacing: 0 },
  bodySm: { family: 'sans', weight: 400, min: 14, max: 15, lineHeight: 1.65, letterSpacing: 0 },
  caption: {
    family: 'sans',
    weight: 500,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1.4,
    letterSpacing: 0.18,
  },
  button: {
    family: 'sans',
    weight: 500,
    uppercase: true,
    min: 12,
    max: 12,
    lineHeight: 1,
    letterSpacing: 0.22,
  },
};

/**
 * Admin surface typography: the public sans (Jost) for every role so login → panel reads as one
 * family, at the compact system sizes (typeScale) and with these weights (faces must exist in
 * publicFontFaces). Case follows typeScale (labels stay uppercase).
 */
export const adminTypeWeights: Record<TypeRoleName, number> = {
  display: 400,
  h1: 400,
  h2: 400,
  h3: 500,
  title: 500,
  eyebrow: 500,
  bodyLg: 400,
  body: 400,
  bodySm: 400,
  caption: 500,
  button: 500,
};

/**
 * Admin label tracking (em). The system values were tuned for the narrow Barlow Condensed; Jost is
 * wider, so tracked uppercase labels (badges, captions, buttons) need less spacing on dense screens.
 */
export const adminTypeTracking: Partial<Record<TypeRoleName, number>> = {
  eyebrow: 0.16,
  caption: 0.08,
  button: 0.12,
};

/** Viewport range over which fluid sizes interpolate (px). */
export const fluidRange = { minViewport: 360, maxViewport: 1440 } as const;

// ---------------------------------------------------------------------------------------------
// Spacing — 4 px base scale. Prototype values (10/14/22/28/36/44/110) snap to the nearest step.
// ---------------------------------------------------------------------------------------------
export const spaceBase = 4;
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
} as const;

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
export const layout = {
  /** prototype max-width 1240px */
  contentMax: 1240,
  /** prototype paragraph measures 540–680px, display measure 820px */
  measureNarrow: 540,
  measure: 680,
  measureDisplay: 820,
  /** prototype clamp(20px, 3vw, 44px) → fluid between min/max */
  gutter: { min: 20, max: 44 },
  /** prototype 110px desktop section rhythm; ~72px on phones */
  section: { min: 72, max: 110 },
  /** prototype single breakpoint 820px; others added for 320 → 2560 support */
  breakpoints: { sm: 480, md: 820, lg: 1240, xl: 1440, xxl: 1920 },
  /** minimum interactive target (px) */
  tapTarget: 48,
} as const;

// ---------------------------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------------------------
export const shape = {
  /** Chamfer (cut corner, top-left + bottom-right) — brand signature. prototype 7/12/14/16 px */
  chamfer: { xs: 7, sm: 12, md: 14, lg: 16 },
  /** prototype 2/4 px small elements, 22–32 px large panels */
  radius: { xs: 2, sm: 4, md: 12, lg: 22, xl: 28, pill: 999 },
  border: { hairline: 1, strong: 1.5, focus: 2 },
  focusOffset: 3,
} as const;

// ---------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------
export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: ColorValue;
  inset?: boolean;
}

export const effects = {
  /** prototype `0 0 24px rgba(70,140,255,0.35), 0 0 2px rgba(160,205,255,0.8)` — buttons, selection */
  glow: [
    { x: 0, y: 0, blur: 24, spread: 0, color: c(palette.glowBlue, 0.35) },
    { x: 0, y: 0, blur: 2, spread: 0, color: c(palette.glowHalo, 0.8) },
  ],
  /** prototype `0 0 72px rgba(91,157,255,0.32)` — highlighted package */
  glowStrong: [{ x: 0, y: 0, blur: 72, spread: 0, color: c(palette.blue400, 0.32) }],
  /** prototype `0 0 38px rgba(91,157,255,0.14)` — subtle ambient */
  glowSoft: [{ x: 0, y: 0, blur: 38, spread: 0, color: c(palette.blue400, 0.14) }],
  /** prototype backdrop-filter blur(14px) header/menu */
  backdropBlur: 14,
} as const satisfies Record<string, readonly ShadowLayer[] | number>;

// ---------------------------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------------------------
export const motion = {
  duration: {
    micro: 200, // colour/opacity hover
    short: 400, // prototype 400ms micro-interactions
    base: 600, // prototype 500–600ms standard UI
    long: 900, // prototype 800–1000ms reveals
  },
  easing: {
    /** prototype default cubic-bezier(0.22, 1, 0.36, 1) */
    out: [0.22, 1, 0.36, 1],
    /** prototype secondary cubic-bezier(0.45, 0, 0.2, 1) */
    inOut: [0.45, 0, 0.2, 1],
  },
  /** Under prefers-reduced-motion: durations collapse, ambient/glitch/flicker effects are disabled. */
  reducedMotion: { durationMs: 0, disableAmbient: true },
  /** Photosensitivity guard (WCAG 2.3.1) for flicker effects even when motion is allowed. */
  maxFlashesPerSecond: 3,
} as const satisfies {
  duration: Record<string, number>;
  easing: Record<string, readonly [number, number, number, number]>;
  reducedMotion: unknown;
  maxFlashesPerSecond: number;
};

export const tokens = {
  palette,
  colors: {
    dark: colorsDark,
    light: colorsLight,
    public: colorsPublic,
    admin: colorsAdmin,
    glass: colorsGlass,
  },
  adminTypeWeights,
  adminTypeTracking,
  decorativeColors,
  themePresets,
  publicFontFamilies,
  publicFontFaces,
  publicTypeScale,
  contrastRequirements,
  fontFamilies,
  fontFaces,
  typeScale,
  fluidRange,
  spaceBase,
  space,
  layout,
  shape,
  effects,
  motion,
} as const;
