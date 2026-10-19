import { toCss } from './color';
import { fluidCss } from './fluid';
import type { ShadowLayer, tokens as Tokens } from './tokens';
import { kebab } from './validate';

type TokenSet = typeof Tokens;

/** CSS custom properties created by next/font in apps/web/src/lib/fonts.ts. */
export const NEXT_FONT_VARIABLES = {
  heading: '--font-chakra-petch',
  label: '--font-barlow-condensed',
  body: '--font-barlow',
} as const;

/** next/font variables of the public-surface families (apps/web/src/lib/fonts.ts). */
export const NEXT_PUBLIC_FONT_VARIABLES = {
  sans: '--font-jost',
  serif: '--font-bodoni-moda',
} as const;

const fontStack = (nextVar: string, fallback: readonly string[]) =>
  `var(${nextVar}), ${fallback.map((x) => (x.includes(' ') ? `'${x}'` : x)).join(', ')}`;

const px = (n: number) => `${n}px`;
const rem = (n: number) => `${Number((n / 16).toFixed(4))}rem`;
const shadow = (layers: readonly ShadowLayer[]) =>
  layers
    .map(
      (l) =>
        `${l.inset ? 'inset ' : ''}${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} ${toCss(l.color)}`,
    )
    .join(', ');
const bezier = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;
const dropShadow = (layers: readonly ShadowLayer[]) =>
  layers.map((l) => `drop-shadow(${px(l.x)} ${px(l.y)} ${px(l.blur)} ${toCss(l.color)})`).join(' ');

export function generateCss(t: TokenSet): string {
  const out: string[] = [
    '/*',
    ' * GENERATED FILE — do not edit.',
    ' * Source: packages/design-tokens/src/tokens.ts',
    ' * Regenerate: pnpm --filter @vitruv/design-tokens generate',
    ' */',
    '',
    '@theme {',
    '  /* Tailwind defaults are reset so only VITRUV tokens exist as utilities. */',
    '  --color-*: initial;',
    '  --font-*: initial;',
    '  --text-*: initial;',
    '  --radius-*: initial;',
    '  --shadow-*: initial;',
    '  --ease-*: initial;',
    '  --breakpoint-*: initial;',
    '  --container-*: initial;',
    '',
  ];

  out.push('  /* Colour — dark (production master) */');
  for (const [role, value] of Object.entries(t.colors.dark))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);

  out.push('', '  /* Font families (next/font variables + metric-compatible fallbacks) */');
  for (const [role, f] of Object.entries(t.fontFamilies)) {
    const nextVar = NEXT_FONT_VARIABLES[role as keyof typeof NEXT_FONT_VARIABLES];
    out.push(
      `  --font-${role}: var(${nextVar}), ${f.fallback.map((x) => (x.includes(' ') ? `'${x}'` : x)).join(', ')};`,
    );
  }

  out.push('', '  /* Public-surface font families (web only) */');
  for (const [role, f] of Object.entries(t.publicFontFamilies)) {
    const nextVar = NEXT_PUBLIC_FONT_VARIABLES[role as keyof typeof NEXT_PUBLIC_FONT_VARIABLES];
    out.push(`  --font-public-${role}: ${fontStack(nextVar, f.fallback)};`);
  }

  out.push('', '  /* Decorative colours (public surface; never small text) */');
  for (const [role, value] of Object.entries(t.decorativeColors))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);

  out.push('', '  /* Type scale (fluid 360 → 1440 px) */');
  for (const [name, r] of Object.entries(t.typeScale)) {
    const k = kebab(name);
    out.push(`  --text-${k}: ${fluidCss(r.min, r.max)};`);
    out.push(`  --text-${k}--line-height: ${r.lineHeight};`);
    out.push(`  --text-${k}--letter-spacing: ${r.letterSpacing}em;`);
    out.push(`  --text-${k}--font-weight: ${r.weight};`);
  }

  out.push('', '  /* Spacing — Tailwind multiplies this base (p-4 = 16px) */');
  out.push(`  --spacing: ${rem(t.spaceBase)};`);

  out.push('', '  /* Layout */');
  for (const [name, value] of Object.entries(t.layout.breakpoints))
    out.push(`  --breakpoint-${name}: ${rem(value)};`);
  out.push(`  --container-content: ${rem(t.layout.contentMax)};`);
  out.push(`  --container-measure-narrow: ${rem(t.layout.measureNarrow)};`);
  out.push(`  --container-measure: ${rem(t.layout.measure)};`);
  out.push(`  --container-measure-display: ${rem(t.layout.measureDisplay)};`);

  out.push('', '  /* Shape */');
  for (const [name, value] of Object.entries(t.shape.radius))
    out.push(`  --radius-${name}: ${px(value)};`);

  out.push('', '  /* Effects */');
  out.push(`  --shadow-glow: ${shadow(t.effects.glow)};`);
  out.push(`  --shadow-glow-strong: ${shadow(t.effects.glowStrong)};`);
  out.push(`  --shadow-glow-soft: ${shadow(t.effects.glowSoft)};`);

  out.push('', '  /* Motion */');
  for (const [name, b] of Object.entries(t.motion.easing))
    out.push(`  --ease-${kebab(name)}: ${bezier(b)};`);
  out.push('}', '');

  out.push(':root {');
  out.push(`  --gutter: ${fluidCss(t.layout.gutter.min, t.layout.gutter.max)};`);
  out.push(`  --section-space: ${fluidCss(t.layout.section.min, t.layout.section.max)};`);
  out.push(`  --tap-target: ${px(t.layout.tapTarget)};`);
  for (const [name, value] of Object.entries(t.shape.chamfer))
    out.push(`  --chamfer-${name}: ${px(value)};`);
  for (const [name, value] of Object.entries(t.shape.border))
    out.push(`  --border-${name}: ${px(value)};`);
  out.push(`  --focus-offset: ${px(t.shape.focusOffset)};`);
  // Per-role family / style / case as variables so a surface (public) can restyle the roles.
  for (const [name, r] of Object.entries(t.typeScale)) {
    const k = kebab(name);
    out.push(`  --type-${k}-family: var(--font-${r.family});`);
    out.push(`  --type-${k}-style: ${r.italic ? 'italic' : 'normal'};`);
    out.push(`  --type-${k}-case: ${r.uppercase ? 'uppercase' : 'none'};`);
  }
  out.push(`  --backdrop-blur: ${px(t.effects.backdropBlur)};`);
  // Same glow layers as filters: drop-shadow follows non-rectangular (chamfered) silhouettes.
  out.push(`  --filter-glow: ${dropShadow(t.effects.glow)};`);
  out.push(`  --filter-glow-strong: ${dropShadow(t.effects.glowStrong)};`);
  out.push(`  --filter-glow-soft: ${dropShadow(t.effects.glowSoft)};`);
  for (const [name, ms] of Object.entries(t.motion.duration))
    out.push(`  --duration-${name}: ${ms}ms;`);
  out.push('}', '');

  out.push('@media (prefers-reduced-motion: reduce) {', '  :root {');
  for (const name of Object.keys(t.motion.duration)) {
    out.push(`    --duration-${name}: ${t.motion.reducedMotion.durationMs}ms;`);
  }
  out.push('  }', '}', '');

  out.push("/* Colour — light variant (compatibility; opt-in via <html data-theme='light'>) */");
  out.push("[data-theme='light'] {");
  for (const [role, value] of Object.entries(t.colors.light))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);
  out.push('}', '');

  out.push(
    "/* Public surface ('Greek Harmony'): <div data-surface='public'> — public site and login */",
  );
  out.push("[data-surface='public'] {");
  // Re-declared here: next/font defines its variables on this element (not on :root).
  for (const [role, f] of Object.entries(t.publicFontFamilies)) {
    const nextVar = NEXT_PUBLIC_FONT_VARIABLES[role as keyof typeof NEXT_PUBLIC_FONT_VARIABLES];
    out.push(`  --font-public-${role}: ${fontStack(nextVar, f.fallback)};`);
  }
  for (const [role, value] of Object.entries(t.colors.public))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);
  for (const [name, r] of Object.entries(t.publicTypeScale)) {
    const k = kebab(name);
    out.push(`  --text-${k}: ${fluidCss(r.min, r.max)};`);
    out.push(`  --text-${k}--line-height: ${r.lineHeight};`);
    out.push(`  --text-${k}--letter-spacing: ${r.letterSpacing}em;`);
    out.push(`  --text-${k}--font-weight: ${r.weight};`);
    out.push(`  --type-${k}-family: var(--font-public-${r.family});`);
    out.push(`  --type-${k}-style: ${r.italic ? 'italic' : 'normal'};`);
    out.push(`  --type-${k}-case: ${r.uppercase ? 'uppercase' : 'none'};`);
  }
  out.push('}', '');

  out.push("/* Admin surface: <div data-surface='admin'> — functional warm-neutral light panel */");
  out.push("[data-surface='admin'] {");
  for (const [role, f] of Object.entries(t.publicFontFamilies)) {
    const nextVar = NEXT_PUBLIC_FONT_VARIABLES[role as keyof typeof NEXT_PUBLIC_FONT_VARIABLES];
    out.push(`  --font-public-${role}: ${fontStack(nextVar, f.fallback)};`);
  }
  for (const [role, value] of Object.entries(t.colors.admin))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);
  for (const [name, weight] of Object.entries(t.adminTypeWeights)) {
    const k = kebab(name);
    out.push(`  --text-${k}--font-weight: ${weight};`);
    out.push(`  --type-${k}-family: var(--font-public-sans);`);
    out.push(`  --type-${k}-style: normal;`);
    const tracking = t.adminTypeTracking[name as keyof typeof t.adminTypeTracking];
    if (tracking !== undefined) out.push(`  --text-${k}--letter-spacing: ${tracking}em;`);
    // Headings in sentence case on the panel; labels keep the system's uppercase.
    if (t.typeScale[name as keyof typeof t.typeScale].family === 'heading')
      out.push(`  --type-${k}-case: none;`);
  }
  out.push('}', '');

  out.push(
    '/* Glass surface: data-glass on the admin shell / client area — monochrome frosted panels */',
  );
  // :root raises specificity above the per-surface blocks and the CMS colour style (public).
  out.push(':root [data-glass] {');
  for (const [role, value] of Object.entries(t.colors.glass))
    out.push(`  --color-${kebab(role)}: ${toCss(value)};`);
  out.push('}', '');

  out.push('/* Semantic typography roles: class="type-display", "type-eyebrow", … */');
  for (const name of Object.keys(t.typeScale)) {
    const k = kebab(name);
    out.push(`@utility type-${k} {`);
    out.push(`  font-family: var(--type-${k}-family);`);
    out.push(`  font-size: var(--text-${k});`);
    out.push(`  font-weight: var(--text-${k}--font-weight);`);
    out.push(`  line-height: var(--text-${k}--line-height);`);
    out.push(`  letter-spacing: var(--text-${k}--letter-spacing);`);
    out.push(`  font-style: var(--type-${k}-style);`);
    out.push(`  text-transform: var(--type-${k}-case);`);
    out.push('}');
  }
  out.push('');

  // Chamfer geometry is NOT generated as a clip-path utility: clipping the element itself would
  // also clip its border and keyboard focus outline. The shape lives in the web component layer
  // (apps/web/src/styles/components.css) and only consumes the --chamfer-* variables above.

  return out.join('\n') + '\n';
}
