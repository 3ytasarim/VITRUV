import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    setupFiles: ['@vitruv/config/vitest/load-root-env'],
    testTimeout: 20_000,
  },
});
