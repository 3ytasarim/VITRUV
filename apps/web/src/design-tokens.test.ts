import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web app may only express visual values through the generated design tokens
 * (packages/design-tokens → src/styles/tokens.generated.css). These checks keep Sprint 0-style
 * hardcoded values and Tailwind's default palette from creeping back in.
 */
const SRC = join(import.meta.dirname);
const GENERATED = 'styles/tokens.generated.css';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')
      ? [path]
      : [];
  });
}

const files = sourceFiles(SRC)
  .map((path) => ({
    rel: relative(SRC, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }))
  .filter((f) => f.rel !== GENERATED);

describe('web uses design tokens only', () => {
  it('contains no hardcoded hex colours outside the generated token file', () => {
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => `${f.rel}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("does not use Tailwind's default colour palette", () => {
    const palette =
      /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/g;
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(palette)].map((m) => `${f.rel}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('does not use the retired Sprint 0 token names', () => {
    const retired =
      /--container-page|--spacing-gutter|--spacing-section|--radius-card|--shadow-raised|accent-fg\b|electric-\d|anthracite-|offwhite-|surface-raised|text-lead\b/g;
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(retired)].map((m) => `${f.rel}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('uses no arbitrary colour, size, shadow or radius values', () => {
    const arbitrary =
      /\b(?:bg|text|border|ring|outline|fill|stroke|shadow|drop-shadow|rounded(?:-[a-z]+)?|p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|w|h|size|min-[wh]|max-[wh]|top|left|right|bottom|inset|leading|tracking)-\[(?:#|rgb|hsl|oklch|\d|-\d|calc\(\d)/g;
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(arbitrary)].map((m) => `${f.rel}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps clip-path inside the component layer (chamfer system)', () => {
    const offenders = files
      // public.css adapts the chamfer system per surface (it only switches clip-path OFF);
      // public-functional.css is the public site's reference design (chamfered buttons/cards).
      .filter(
        (f) =>
          ![
            'styles/components.css',
            'styles/public.css',
            'styles/public-functional.css',
            'styles/public-reference.css',
          ].includes(f.rel) && /clip-path|clipPath/.test(f.text),
      )
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('no longer uses the retired element-clipping chamfer-* utilities', () => {
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(/(?<![\w-])chamfer-(?:xs|sm|md|lg)\b/g)].map((m) => `${f.rel}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('imports the generated tokens into the global stylesheet', () => {
    const globals = files.find((f) => f.rel === 'styles/globals.css');
    expect(globals?.text).toContain("@import './tokens.generated.css';");
  });
});
