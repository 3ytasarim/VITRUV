/**
 * Applies pending Drizzle migrations to the existing Neon database.
 *
 *   pnpm db:migrate
 *
 * Safety:
 *  - reads DATABASE_URL (never printed); fails if missing
 *  - connects to the direct (non-pooler) endpoint for DDL
 *  - refuses destructive SQL unless the file is listed in migrations/APPROVED_DESTRUCTIVE.json
 *  - each migration runs inside a transaction (drizzle migrator)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { poolConfigFromUrl, requireDatabaseUrl, toDirectUrl } from '../src/connection';
import { assertMigrationsAreSafe } from '../src/migration-guard';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function loadApprovedDestructive(): Set<string> {
  const file = join(migrationsFolder, 'APPROVED_DESTRUCTIVE.json');
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, 'utf8')) as string[]);
}

async function main(): Promise<void> {
  const sqlFiles = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql'));
  assertMigrationsAreSafe(
    sqlFiles.map((file) => ({ file, sql: readFileSync(join(migrationsFolder, file), 'utf8') })),
    loadApprovedDestructive(),
  );
  console.warn(`[migrate] ${sqlFiles.length} migration file(s) passed the destructive-SQL guard`);

  const url = process.env.DATABASE_URL_DIRECT?.trim() || toDirectUrl(requireDatabaseUrl());
  const pool = new pg.Pool({ ...poolConfigFromUrl(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    const { rows } = await pool.query<{ count: number }>(
      'select count(*)::int as count from drizzle.__drizzle_migrations',
    );
    console.warn(`[migrate] done — ${rows[0]?.count ?? 0} migration(s) recorded in history`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Driver errors can embed connection details; print only the class and the code/message.
  const e = error as { name?: string; code?: string; message?: string };
  console.error(`[migrate] FAILED: ${e.name ?? 'Error'}${e.code ? ` (${e.code})` : ''}`);
  if (e.name === 'DestructiveMigrationError' || e.name === 'MissingDatabaseUrlError') {
    console.error(e.message);
  }
  process.exit(1);
});
