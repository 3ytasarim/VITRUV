/**
 * Writes the generated token files for web and Flutter.
 *
 *   pnpm --filter @vitruv/design-tokens generate   # write
 *   pnpm --filter @vitruv/design-tokens check      # fail if committed output is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { generateCss } from '../src/generate-css';
import { generateDart } from '../src/generate-dart';
import { OUTPUTS } from '../src/outputs';
import { tokens } from '../src/tokens';
import { checkContrast, validateTokens } from '../src/validate';

const problems = validateTokens(tokens);
const failing = checkContrast(tokens).filter((r) => !r.pass);
for (const f of failing)
  problems.push(`contrast ${f.theme}: ${f.fg} on ${f.bg} = ${f.ratio} < ${f.min} (${f.note})`);
if (problems.length > 0) {
  console.error(`Design tokens invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const files = [
  { path: OUTPUTS.css, content: generateCss(tokens) },
  { path: OUTPUTS.dart, content: generateDart(tokens) },
];

const checkOnly = process.argv.includes('--check');
let stale = 0;
for (const file of files) {
  let current = '';
  try {
    current = readFileSync(file.path, 'utf8');
  } catch {
    // missing file counts as stale
  }
  if (current === file.content) continue;
  if (checkOnly) {
    console.error(`stale: ${file.path}`);
    stale++;
  } else {
    writeFileSync(file.path, file.content);
    console.warn(`wrote: ${file.path}`);
  }
}

if (checkOnly && stale > 0) {
  console.error(
    'Generated design tokens are out of date. Run: pnpm --filter @vitruv/design-tokens generate',
  );
  process.exit(1);
}
console.warn(checkOnly ? 'design tokens: up to date' : 'design tokens: done');
