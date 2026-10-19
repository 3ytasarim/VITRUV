import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'coverage/**']),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // `import { type A } from 'x'` keeps an empty import of 'x' (verbatimModuleSyntax) and ships
      // the whole module to the browser — use `import type` for type-only imports.
      '@typescript-eslint/no-import-type-side-effects': 'error',
      // CmsMedia renders <picture>/<img> built with getImageProps (optimised srcsets + art
      // direction). Editorial media still only arrives via CMS slots (project rule "CMS media").
      '@next/next/no-img-element': 'off',
    },
  },
]);
