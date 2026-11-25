import { defineConfig } from 'vitest/config';

/**
 * Sprint 2.5 — tests against a REAL but ISOLATED PostgreSQL (never the project `.env`).
 * Needs VITRUV_IT_DATABASE_URL (loopback, sslmode=disable, vitruv_it_*), see
 * docs/ios-training-sprint2-validation.md. No root-env loader on purpose.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.pg.test.ts'],
    setupFiles: ['./test/pg-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
