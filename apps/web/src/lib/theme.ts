import type { PublicWebsitePage } from '@vitruv/contracts';

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

export function pageTheme(page: PublicWebsitePage | null): ThemeContent | null {
  const section = page?.sections.find((s) => s.type === 'theme');
  return section?.type === 'theme' ? section.content : null;
}
