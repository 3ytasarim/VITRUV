import { describe, expect, it } from 'vitest';
import { contrastRatio, toCss, toDart } from './color';
import { fluidAt, fluidCss } from './fluid';
import { REQUIRED_COLOR_ROLES, tokens } from './tokens';
import { checkContrast, validateTokens } from './validate';

describe('token set', () => {
  it('passes structural validation', () => {
    expect(validateTokens(tokens)).toEqual([]);
  });

  it.each(['dark', 'light', 'public', 'admin', 'glass'] as const)(
    'defines every required semantic colour in %s',
    (theme) => {
      for (const role of REQUIRED_COLOR_ROLES)
        expect(tokens.colors[theme][role], role).toBeDefined();
    },
  );

  it('keeps the prototype master values', () => {
    expect(tokens.colors.dark.bg.hex).toBe('#050505');
    expect(tokens.colors.dark.surface.hex).toBe('#0e0e0e');
    expect(tokens.colors.dark.fg.hex).toBe('#f2f2ee');
    expect(tokens.colors.dark.accent.hex).toBe('#4d8dff');
    expect(tokens.colors.dark.accentText.hex).toBe('#5b9dff');
    expect(tokens.layout.contentMax).toBe(1240);
    expect(tokens.layout.section.max).toBe(110);
    expect(tokens.layout.breakpoints.md).toBe(820);
    expect(tokens.motion.easing.out).toEqual([0.22, 1, 0.36, 1]);
  });
});

describe('contrast (WCAG 2.1)', () => {
  const results = checkContrast(tokens);

  it.each(results.map((r) => [`${r.theme}: ${r.fg} on ${r.bg} (${r.note})`, r] as const))(
    '%s meets its minimum',
    (_label, r) => {
      expect(r.ratio, `${r.ratio} < ${r.min}`).toBeGreaterThanOrEqual(r.min);
    },
  );

  it('documents why the prototype 45 % meta text was corrected', () => {
    const { fg, bg } = tokens.colors.dark;
    const prototype = contrastRatio({ hex: fg.hex, alpha: 0.45 }, bg, bg);
    expect(prototype).toBeLessThan(4.5);
    expect(tokens.colors.dark.fgSubtle.alpha).toBeGreaterThanOrEqual(0.5);
  });

  it('computes known reference ratios', () => {
    const black = { hex: '#000000' } as const;
    const white = { hex: '#ffffff' } as const;
    expect(contrastRatio(white, black, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(black, black, black)).toBeCloseTo(1, 5);
  });
});

describe('validation catches broken definitions', () => {
  it('reports a missing required role', () => {
    const { error: _omit, ...withoutError } = tokens.colors.dark;
    const broken = { ...tokens, colors: { ...tokens.colors, dark: withoutError } };
    expect(validateTokens(broken as typeof tokens)).toContain(
      'colors.dark: missing required role "error"',
    );
  });

  it('reports roles that collide after name flattening', () => {
    const broken = {
      ...tokens,
      colors: {
        ...tokens.colors,
        dark: { ...tokens.colors.dark, 'fg-muted': tokens.colors.dark.fg },
      },
    };
    expect(validateTokens(broken as typeof tokens).join('\n')).toMatch(
      /both map to "--color-fg-muted"/,
    );
  });

  it('reports invalid hex, alpha and spacing values', () => {
    const broken = {
      ...tokens,
      palette: { ...tokens.palette, ink950: '#05050' },
      colors: {
        ...tokens.colors,
        dark: { ...tokens.colors.dark, overlay: { hex: '#050505', alpha: 1.4 } },
      },
      space: { ...tokens.space, 3: 13 },
    };
    const problems = validateTokens(broken as unknown as typeof tokens).join('\n');
    expect(problems).toMatch(/palette.ink950: invalid hex/);
    expect(problems).toMatch(/overlay: alpha 1.4/);
    expect(problems).toMatch(/space.3 = 13px/);
  });

  it('reports type roles that use a font face that is not loaded', () => {
    const broken = {
      ...tokens,
      typeScale: { ...tokens.typeScale, body: { ...tokens.typeScale.body, weight: 300 } },
    };
    expect(validateTokens(broken as unknown as typeof tokens).join('\n')).toMatch(
      /body 300 is not a loaded font face/,
    );
  });
});

describe('value conversion', () => {
  it('formats colours for CSS and Dart', () => {
    expect(toCss({ hex: '#4d8dff' })).toBe('#4d8dff');
    expect(toCss({ hex: '#f2f2ee', alpha: 0.5 })).toBe('rgb(242 242 238 / 0.5)');
    expect(toDart({ hex: '#4d8dff' })).toBe('Color(0xFF4D8DFF)');
    expect(toDart({ hex: '#f2f2ee', alpha: 0.5 })).toBe('Color(0x80F2F2EE)');
  });

  it('builds zoom-friendly fluid sizes that hit min and max at the range ends', () => {
    expect(fluidCss(16, 16)).toBe('1rem');
    expect(fluidCss(40, 80)).toBe('clamp(2.5rem, 1.6667rem + 3.7037vw, 5rem)');
    expect(fluidAt(40, 80, 360)).toBe(40);
    expect(fluidAt(40, 80, 1440)).toBe(80);
    expect(fluidAt(40, 80, 2560)).toBe(80);
    expect(fluidAt(40, 80, 900)).toBeCloseTo(60, 5);
  });
});

describe('theme presets', () => {
  it('blue preset stays readable on the black/white site (WCAG AA)', () => {
    const black = { hex: '#0a0a0a' } as const;
    const p = tokens.themePresets.blue;
    // eyebrows/links are small text: 4.5:1 on the page background
    expect(contrastRatio({ hex: p.eyebrow }, black, black)).toBeGreaterThanOrEqual(4.5);
    // button label on the blue fill
    const fill = { hex: p.button } as const;
    expect(contrastRatio({ hex: p.buttonText }, fill, fill)).toBeGreaterThanOrEqual(4.5);
    // route + accent fills as UI boundaries: 3:1
    expect(contrastRatio({ hex: p.accentSecondary }, black, black)).toBeGreaterThanOrEqual(3);
  });
});
