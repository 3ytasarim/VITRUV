import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is used ONLY to generate and check migration SQL (no DB connection needed).
 * Migrations are applied by `pnpm db:migrate` (scripts/migrate.ts), which adds a
 * destructive-statement guard and uses the direct Neon endpoint.
 * `drizzle-kit push` / `drop` are intentionally not wired up — no credentials are configured here.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
