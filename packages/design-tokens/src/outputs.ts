import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Generated artefacts, committed to the repo and verified for drift by tests and `check`. */
export const OUTPUTS = {
  css: resolve(repoRoot, 'apps/web/src/styles/tokens.generated.css'),
  dart: resolve(repoRoot, 'apps/mobile/lib/core/theme/vitruv_tokens.g.dart'),
  pubspec: resolve(repoRoot, 'apps/mobile/pubspec.yaml'),
  webFonts: resolve(repoRoot, 'apps/web/src/lib/fonts.ts'),
} as const;
