import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Sprint 2.5 — API tests against a REAL but ISOLATED PostgreSQL (never the project `.env`).
 * Needs VITRUV_IT_DATABASE_URL (loopback, sslmode=disable, vitruv_it_*). The existing integration
 * suites run unchanged: their `./rollback` import is redirected to the guarded test/pg/rollback-pg.ts.
 * Files run one after another (shared isolated server, real concurrency inside a file).
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\.\/rollback$/,
        replacement: fileURLToPath(new URL('./test/pg/rollback-pg.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['test/**/*.pg.test.ts', 'test/**/*.int.test.ts'],
    setupFiles: ['./test/pg/setup.ts'],
    globalSetup: ['./test/pg/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
