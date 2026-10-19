import { toDart } from './color';
import type { ShadowLayer, tokens as Tokens } from './tokens';

type TokenSet = typeof Tokens;

const num = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const boxShadows = (layers: readonly ShadowLayer[]) =>
  `[\n${layers
    .map(
      (l) =>
        `    BoxShadow(color: ${toDart(l.color)}, offset: Offset(${num(l.x)}, ${num(l.y)}), blurRadius: ${num(l.blur)}, spreadRadius: ${num(l.spread)}),`,
    )
    .join('\n')}\n  ]`;

/** Data-only Dart constants. Types live in the hand-written `vitruv_token_types.dart`. */
export function generateDart(t: TokenSet): string {
  const o: string[] = [
    '// GENERATED FILE — do not edit.',
    '// Source: packages/design-tokens/src/tokens.ts',
    '// Regenerate: pnpm --filter @vitruv/design-tokens generate',
    '// ignore_for_file: lines_longer_than_80_chars, require_trailing_commas',
    '// Generated output must stay byte-identical (drift-checked), so the formatter is off:',
    '// dart format off',
    '',
    "import 'package:flutter/animation.dart';",
    "import 'package:flutter/painting.dart';",
    '',
    "import 'vitruv_token_types.dart';",
    '',
  ];

  o.push('abstract final class VitruvColors {');
  for (const [theme, roles] of Object.entries(t.colors)) {
    o.push(`  static const ${theme} = VitruvColorScheme(`);
    for (const [role, value] of Object.entries(roles)) o.push(`    ${role}: ${toDart(value)},`);
    o.push('  );');
  }
  o.push('}', '');

  o.push('abstract final class VitruvFonts {');
  for (const [role, f] of Object.entries(t.fontFamilies))
    o.push(`  static const ${role} = '${f.family}';`);
  o.push('}', '');

  o.push('abstract final class VitruvType {');
  for (const [name, r] of Object.entries(t.typeScale)) {
    o.push(`  static const ${name} = VitruvTextRole(`);
    o.push(`    fontFamily: VitruvFonts.${r.family},`);
    o.push(`    fontWeight: FontWeight.w${r.weight},`);
    o.push(`    italic: ${Boolean(r.italic)},`);
    o.push(`    uppercase: ${Boolean(r.uppercase)},`);
    o.push(`    minSize: ${num(r.min)},`);
    o.push(`    maxSize: ${num(r.max)},`);
    o.push(`    height: ${num(r.lineHeight)},`);
    o.push(`    letterSpacingEm: ${num(r.letterSpacing)},`);
    o.push('  );');
  }
  o.push(`  static const fluidMinViewport = ${num(t.fluidRange.minViewport)};`);
  o.push(`  static const fluidMaxViewport = ${num(t.fluidRange.maxViewport)};`);
  o.push('}', '');

  o.push('abstract final class VitruvSpace {');
  o.push(`  static const base = ${num(t.spaceBase)};`);
  for (const [key, value] of Object.entries(t.space))
    o.push(`  static const s${key} = ${num(value)};`);
  o.push('}', '');

  const L = t.layout;
  o.push('abstract final class VitruvLayout {');
  o.push(`  static const contentMax = ${num(L.contentMax)};`);
  o.push(`  static const measureNarrow = ${num(L.measureNarrow)};`);
  o.push(`  static const measure = ${num(L.measure)};`);
  o.push(`  static const measureDisplay = ${num(L.measureDisplay)};`);
  o.push(`  static const gutterMin = ${num(L.gutter.min)};`);
  o.push(`  static const gutterMax = ${num(L.gutter.max)};`);
  o.push(`  static const sectionMin = ${num(L.section.min)};`);
  o.push(`  static const sectionMax = ${num(L.section.max)};`);
  o.push(`  static const tapTarget = ${num(L.tapTarget)};`);
  for (const [name, value] of Object.entries(L.breakpoints))
    o.push(`  static const breakpoint${pascal(name)} = ${num(value)};`);
  o.push('}', '');

  const S = t.shape;
  o.push('abstract final class VitruvShape {');
  for (const [name, value] of Object.entries(S.chamfer))
    o.push(`  static const chamfer${pascal(name)} = ${num(value)};`);
  for (const [name, value] of Object.entries(S.radius))
    o.push(`  static const radius${pascal(name)} = ${num(value)};`);
  for (const [name, value] of Object.entries(S.border))
    o.push(`  static const border${pascal(name)} = ${num(value)};`);
  o.push(`  static const focusOffset = ${num(S.focusOffset)};`);
  o.push('}', '');

  o.push('abstract final class VitruvEffects {');
  o.push(`  static const glow = <BoxShadow>${boxShadows(t.effects.glow)};`);
  o.push(`  static const glowStrong = <BoxShadow>${boxShadows(t.effects.glowStrong)};`);
  o.push(`  static const glowSoft = <BoxShadow>${boxShadows(t.effects.glowSoft)};`);
  o.push(`  static const backdropBlur = ${num(t.effects.backdropBlur)};`);
  o.push('}', '');

  const M = t.motion;
  o.push('abstract final class VitruvMotion {');
  for (const [name, ms] of Object.entries(M.duration))
    o.push(`  static const ${lowerFirst(name)} = Duration(milliseconds: ${ms});`);
  for (const [name, b] of Object.entries(M.easing))
    o.push(`  static const ease${pascal(name)} = Cubic(${b.map(num).join(', ')});`);
  o.push(`  static const maxFlashesPerSecond = ${M.maxFlashesPerSecond};`);
  o.push('}');

  return o.join('\n') + '\n';
}
