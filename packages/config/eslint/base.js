// Shared flat ESLint config for all TypeScript workspaces (web extends it with Next rules).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: [
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/migrations/**',
  ],
};

export default tseslint.config(ignores, js.configs.recommended, ...tseslint.configs.strict, {
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    globals: { ...globals.node },
  },
  rules: {
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    // `import { type A } from 'x'` keeps an empty import of 'x' under verbatimModuleSyntax, which
    // bundles the whole module into client code (Stage C: zod/contracts leaked into the homepage).
    '@typescript-eslint/no-import-type-side-effects': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
  },
});
