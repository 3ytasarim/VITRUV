import { describe, expect, it } from 'vitest';
import { tokens } from '@vitruv/design-tokens';
import { themeCss } from './theme';

const base = {
  background: '#f2efe9',
  surface: '#faf8f4',
  surfaceSunken: '#e9e4db',
  heading: '#2b2825',
  text: '#2b2825',
  textMuted: '#57524c',
  textSubtle: '#6f6a64',
  eyebrow: '#7a6747',
  button: '#2b2825',
  buttonText: '#f2efe9',
  accent: '#a3906f',
  accentSecondary: '#cf5a3c',
  dark: '#2b2825',
};

describe('themeCss (admin website colours)', () => {
  it('maps the colour roles onto the public surface variables', () => {
    const css = themeCss(base)!;
    expect(css.startsWith("[data-surface='public']{")).toBe(true);
    expect(css).toContain('--color-bg:#f2efe9');
    expect(css).toContain('--color-heading:#2b2825');
    expect(css).toContain('--color-brand-gold:#a3906f');
    expect(css).toContain('--vt-ink:#2b2825');
  });

  it('drops anything that is not a #rrggbb colour (no CSS injection)', () => {
    const css = themeCss({ ...base, accent: 'red;}body{display:none', heading: '#12345' })!;
    expect(css).not.toContain('display:none');
    expect(css).not.toContain('--color-brand-gold');
    expect(css).not.toContain('--color-heading');
  });

  it('black/white: light copy on dark areas comes from the text colour; line art is inverted', () => {
    const css = themeCss({ ...base, background: '#0a0a0a', text: '#f5f5f5', dark: '#161616' })!;
    expect(css).toContain('--vt-paper:#f5f5f5');
    expect(css).toContain('--vt-ink:#161616');
    expect(css).toContain('--vt-logo-filter:invert(1) brightness(1.15)');
    expect(css).toContain('--vt-art-blend:screen');
    expect(css).toContain('color-scheme:dark');
    // light palettes stay as they were
    expect(themeCss(base)).not.toContain('--vt-logo-filter');
    expect(themeCss(base)).toContain('--vt-paper:#f2efe9');
  });

  it('renders nothing without a theme', () => {
    expect(themeCss(null)).toBeNull();
  });
});

describe('VITRUV Blau preset', () => {
  it('keeps black/white and turns buttons, route, accents, eyebrows and FAQ + blue', () => {
    const live = { ...base, background: '#0a0a0a', text: '#f5f5f5', heading: '#ffffff' };
    const css = themeCss({ ...live, ...tokens.themePresets.blue }) ?? '';
    expect(css).toContain('--color-bg:#0a0a0a');
    expect(css).toContain('--color-heading:#ffffff');
    expect(css).toContain('--color-accent:#4d8dff');
    expect(css).toContain('--color-on-accent:#050505');
    expect(css).toContain('--color-route:#4d8dff');
    expect(css).toContain('--color-brand-gold:#4d8dff');
    expect(css).toContain('--color-accent-text:#5b9dff');
    // over the hero video the dark theme keeps the blue button (light themes swap to paper)
    expect(css).toContain('--vt-media-accent:#4d8dff');
    expect(css).toContain('--vt-media-on-accent:#050505');
    expect(themeCss(base)).not.toContain('--vt-media-accent');
  });
});
