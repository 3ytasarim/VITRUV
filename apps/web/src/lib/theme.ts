import type { PublicWebsitePage } from '@vitruv/contracts';
import { colorsGlassLight, glassLightTints, referencePalette, toCss } from '@vitruv/design-tokens';

type ThemeContent = Extract<PublicWebsitePage['sections'][number], { type: 'theme' }>['content'];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** WCAG relative luminance of a #rrggbb colour (0 = black, 1 = white). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Admin-edited website colours (CMS "Farben & Design") → CSS for the public surface.
 * Values are validated by the contract (#rrggbb) and checked again here, so nothing but a hex
 * colour can ever reach the stylesheet. Borders, hover and overlay tones are derived from the
 * chosen text/background colours, so every component stays consistent with one setting.
 */
export function themeCss(theme: ThemeContent | null | undefined): string | null {
  if (!theme) return null;
  const c = Object.fromEntries(
    Object.entries(theme).filter(([, v]) => typeof v === 'string' && HEX.test(v)),
  ) as Partial<Record<keyof ThemeContent, string>>;
  // Dark page background (e.g. black/white): "paper" (light copy on video and dark areas) is the
  // text colour instead of the background, and dark line art (logo, drawings) is inverted.
  const dark = Boolean(c.background && luminance(c.background) < 0.18);
  const vars: [string, string | undefined][] = [
    ['--color-bg', c.background],
    ['--color-surface', c.surface],
    ['--color-surface-sunken', c.surfaceSunken],
    ['--color-fg', c.text],
    ['--color-fg-muted', c.textMuted],
    ['--color-fg-subtle', c.textSubtle],
    ['--color-accent-text', c.eyebrow],
    ['--color-focus-ring', c.eyebrow],
    ['--color-accent', c.button],
    ['--color-accent-hover', c.button && `color-mix(in srgb, ${c.button} 85%, white)`],
    ['--color-on-accent', c.buttonText],
    ['--color-brand-gold', c.accent],
    ['--color-route', c.accentSecondary],
    ['--color-heading', c.heading],
    ['--vt-ink', c.dark],
    ['--vt-paper', dark ? c.text : c.background],
    ['--vt-logo-filter', dark ? 'invert(1) brightness(1.15)' : undefined],
    ['--vt-art-filter', dark ? 'invert(1)' : undefined],
    ['--vt-art-blend', dark ? 'screen' : undefined],
    // Over photos/video light themes swap buttons to paper/ink; dark themes keep their button.
    ['--vt-media-accent', dark ? c.button : undefined],
    [
      '--vt-media-accent-hover',
      dark && c.button ? `color-mix(in srgb, ${c.button} 85%, white)` : undefined,
    ],
    ['--vt-media-on-accent', dark ? c.buttonText : undefined],
    ['color-scheme', dark ? 'dark' : undefined],
    ['--color-border', c.text && `color-mix(in srgb, ${c.text} 12%, transparent)`],
    ['--color-border-subtle', c.text && `color-mix(in srgb, ${c.text} 7%, transparent)`],
    ['--color-border-strong', c.text && `color-mix(in srgb, ${c.text} 24%, transparent)`],
    ['--color-surface-hover', c.text && `color-mix(in srgb, ${c.text} 3%, transparent)`],
    ['--color-overlay', c.background && `color-mix(in srgb, ${c.background} 86%, transparent)`],
  ];
  const body = vars
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return body ? `[data-surface='public']{${body}}` : null;
}

type ReferenceMode = (typeof referencePalette)['dark'] | (typeof referencePalette)['light'];

/** CSS variables of one reference mode: `--r-*` for the site + the shared roles (sub-pages, map). */
function referenceVars(p: ReferenceMode, scheme: 'dark' | 'light'): string {
  const fgA = (a: number) => `rgba(${p.fgRgb}, ${a})`;
  const lineA = (a: number) => `rgba(${p.lineRgb}, ${a})`;
  const vars: [string, string][] = [
    ['--r-bg', p.bg],
    ['--r-fg', p.fg],
    ['--r-accent', p.accent],
    ['--r-accent-text', p.accentText],
    ['--r-on-accent', p.onAccent],
    ['--r-card', p.card],
    ['--r-card-package', p.cardPackage],
    ['--r-hero-bg', p.heroBg],
    ['--r-footer', p.footer],
    ['--r-bg-rgb', p.bgRgb],
    ['--r-fg-rgb', p.fgRgb],
    ['--r-line-rgb', p.lineRgb],
    ['--r-glow-rgb', p.glowRgb],
    ['--r-btn-glow', `rgba(${p.btnGlowRgb}, ${p.btnGlowAlpha})`],
    ['--r-text-glow', `rgba(${p.btnGlowRgb}, ${p.textGlowAlpha})`],
    ['--r-halo-rgb', p.haloRgb],
    ['--r-glitch-rgb', p.glitchRgb],
    ['--r-logo-filter', p.logoFilter],
    ['--r-glass', p.glass],
    ['--r-tag-rgb', p.tagRgb],
    // shared roles: Impressum / Kontakt / Datenschutz and the Journey map engine
    ['--color-bg', p.bg],
    ['--color-surface', p.card],
    ['--color-surface-sunken', p.card],
    ['--color-surface-hover', lineA(0.03)],
    ['--color-overlay', `rgba(${p.bgRgb}, 0.86)`],
    ['--color-fg', p.fg],
    ['--color-heading', p.fg],
    ['--color-fg-muted', fgA(0.66)],
    ['--color-fg-subtle', fgA(0.55)],
    ['--color-accent', p.accent],
    ['--color-accent-hover', p.accentText],
    ['--color-accent-text', p.accentText],
    ['--color-on-accent', p.onAccent],
    ['--color-focus-ring', p.accentText],
    ['--color-border', lineA(0.1)],
    ['--color-border-subtle', lineA(0.07)],
    ['--color-border-strong', lineA(0.22)],
    ['--color-brand-gold', p.accent],
    ['--color-route', p.accent],
    ['--vt-ink', p.fg],
    ['--vt-paper', p.bg],
    ['--vt-logo-filter', p.logoFilter],
    ['--vt-art-filter', p.logoFilter],
    ['color-scheme', scheme],
  ];
  return vars.map(([n, v]) => `${n}:${v}`).join(';');
}

/**
 * Colours of the public site — the reference design 1:1 (owner decision 2026-10-28):
 * `Website Funktional` (dark, default) and `Funktional Hell` (light, header switch sets
 * `data-theme="light"` on the site root). Values come only from `referencePalette`.
 */
export function referenceThemeCss(): string {
  const root = ".vt-site[data-surface='public']";
  return (
    `${root}{${referenceVars(referencePalette.dark, 'dark')}}` +
    `${root}[data-theme='light']{${referenceVars(referencePalette.light, 'light')}}` +
    // page behind the site (overscroll) — the prototype sets it on html/body
    `body:has(${root}){background:${referencePalette.dark.bg}}` +
    `body:has(${root}[data-theme='light']){background:${referencePalette.light.bg}}`
  );
}

/** CSS variable name of a colour role (`fgMuted` → `--color-fg-muted`). */
const roleVar = (role: string) => `--color-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;

/**
 * Light mode of the admin panel (header switch "Hell", owner decision 2026-10-28): the light
 * glass colours from the design tokens, set with `data-admin-theme="light"` on the admin shell.
 * The glass tints (--glass-hi / --glass-lo, white/black by default) turn to ink / soft grey, so
 * every panel, border and glow follows. Dark stays the default glass. No values are typed here.
 */
export function adminLightCss(): string {
  const vars = Object.entries(colorsGlassLight).map(
    ([role, value]) => `${roleVar(role)}:${toCss(value)}`,
  );
  vars.push(
    `--glass-hi:${glassLightTints.hi}`,
    `--glass-lo:${glassLightTints.lo}`,
    // the client area also carries the public CMS theme: heading colour + logo/art inversion
    `--color-heading:${toCss(colorsGlassLight.fg)}`,
    '--vt-logo-filter:none',
    '--vt-art-filter:none',
    'color-scheme:light',
  );
  // admin shell + client area ("Mein Training"); outranks the glass tokens and the CMS theme
  return `[data-surface='admin'][data-glass][data-admin-theme='light'],.vt-pshell[data-glass][data-admin-theme='light']{${vars.join(';')}}`;
}

export function pageTheme(page: PublicWebsitePage | null): ThemeContent | null {
  const section = page?.sections.find((s) => s.type === 'theme');
  return section?.type === 'theme' ? section.content : null;
}
