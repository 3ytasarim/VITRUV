import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateCss } from './generate-css';
import { generateDart } from './generate-dart';
import { OUTPUTS } from './outputs';
import { tokens } from './tokens';
import { kebab } from './validate';

/**
 * Guards against silent drift between the canonical tokens and what web/Flutter actually use.
 * If one of these fails: run `pnpm --filter @vitruv/design-tokens generate` (never hand-edit output).
 */
describe('generated outputs are in sync', () => {
  it('web CSS matches the generator', () => {
    expect(readFileSync(OUTPUTS.css, 'utf8')).toBe(generateCss(tokens));
  });

  it('Flutter Dart matches the generator', () => {
    expect(readFileSync(OUTPUTS.dart, 'utf8')).toBe(generateDart(tokens));
  });

  it('generation is deterministic', () => {
    expect(generateCss(tokens)).toBe(generateCss(tokens));
    expect(generateDart(tokens)).toBe(generateDart(tokens));
  });

  it('every colour role and type role reaches both platforms', () => {
    const css = generateCss(tokens);
    const dart = generateDart(tokens);
    for (const role of Object.keys(tokens.colors.dark)) {
      expect(css).toContain(`--color-${kebab(role)}:`);
      expect(dart).toContain(`    ${role}: Color(0x`);
    }
    for (const name of Object.keys(tokens.typeScale)) {
      expect(css).toContain(`@utility type-${kebab(name)} {`);
      expect(dart).toContain(`static const ${name} = VitruvTextRole(`);
    }
  });
});

describe('font files are declared exactly as the tokens require', () => {
  // pubspec.yaml was created on Windows (CRLF); compare on normalized line endings.
  const pubspec = readFileSync(OUTPUTS.pubspec, 'utf8').replace(/\r\n/g, '\n');
  const webFonts = readFileSync(OUTPUTS.webFonts, 'utf8');

  it.each(
    tokens.fontFaces.map(
      (f) => [`${f.family} ${f.weight}${f.italic ? ' italic' : ''}`, f] as const,
    ),
  )('Flutter pubspec bundles %s', (_label, face) => {
    const family = tokens.fontFamilies[face.family].family;
    const block = pubspec.split(`- family: ${family}\n`)[1]?.split('- family:')[0] ?? '';
    expect(block, `pubspec family "${family}"`).not.toBe('');
    const weightLine = face.weight === 400 ? '' : `weight: ${face.weight}`;
    const entries = block.split('- asset:').slice(1);
    const match = entries.some(
      (e) =>
        (weightLine === ''
          ? !/weight:/.test(e) || /weight: 400/.test(e)
          : e.includes(weightLine)) &&
        (face.italic ? e.includes('style: italic') : !e.includes('style: italic')),
    );
    expect(match).toBe(true);
  });

  it.each(Object.values(tokens.fontFamilies).map((f) => f.family))(
    'web loads %s via next/font',
    (family) => {
      const fn = family.replace(/ /g, '_');
      const call = webFonts.split(`${fn}({`)[1]?.split('})')[0] ?? '';
      expect(call, `next/font call for ${family}`).not.toBe('');
      const weights = tokens.fontFaces
        .filter((f) => tokens.fontFamilies[f.family].family === family)
        .map((f) => String(f.weight));
      for (const w of new Set(weights)) expect(call).toContain(`'${w}'`);
      const needsItalic = tokens.fontFaces.some(
        (f) => tokens.fontFamilies[f.family].family === family && f.italic,
      );
      expect(call.includes("'italic'")).toBe(needsItalic);
    },
  );

  it.each(Object.values(tokens.publicFontFamilies).map((f) => f.family))(
    'web loads the public-surface family %s via next/font',
    (family) => {
      const fn = family.replace(/ /g, '_');
      const call = webFonts.split(`${fn}({`)[1]?.split('})')[0] ?? '';
      expect(call, `next/font call for ${family}`).not.toBe('');
      const faces = tokens.publicFontFaces.filter(
        (f) => tokens.publicFontFamilies[f.family].family === family,
      );
      for (const w of new Set(faces.map((f) => String(f.weight)))) expect(call).toContain(`'${w}'`);
      expect(call.includes("'italic'")).toBe(faces.some((f) => f.italic));
    },
  );
});
