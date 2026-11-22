import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { assertMigrationsAreSafe } from './migration-guard';

/**
 * FAIL-CLOSED guard for tests that run against a REAL PostgreSQL (Sprint 2.5).
 *
 * The project `.env` points at the production Neon database, so DB tests must never read
 * DATABASE_URL. They read only VITRUV_IT_DATABASE_URL and refuse to run unless BOTH hold:
 *
 *  1. static (before any socket is opened): loopback host, `sslmode=disable`, database name
 *     `vitruv_it_*`, no `neon` anywhere, and not equal to DATABASE_URL / DATABASE_URL_DIRECT
 *  2. dynamic (first query): the server reports `cluster_name = 'vitruv-it'` and a loopback
 *     server address — a marker only the throw-away test cluster has (set in its postgresql.conf)
 *
 * Anything else throws. There is no fallback and no "skip silently": a misconfiguration fails.
 */

export const ISOLATED_DB_ENV = 'VITRUV_IT_DATABASE_URL';
export const ISOLATED_CLUSTER_NAME = 'vitruv-it';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DB_NAME = /^vitruv_it_[a-z0-9_]{1,40}$/;

export class NotIsolatedDatabaseError extends Error {
  constructor(reason: string) {
    // The reason never contains the URL itself (credentials).
    super(`Refusing to use this database for tests: ${reason}`);
    this.name = 'NotIsolatedDatabaseError';
  }
}

/** Static checks on the URL; returns the parsed URL. */
export function assertIsolatedTestDatabaseUrl(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): URL {
  if (!value?.trim()) throw new NotIsolatedDatabaseError(`${ISOLATED_DB_ENV} is not set`);
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new NotIsolatedDatabaseError('not a valid URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new NotIsolatedDatabaseError('not a postgres:// URL');
  }
  if (!LOOPBACK.has(url.hostname)) throw new NotIsolatedDatabaseError('host is not loopback');
  if (/neon/i.test(value)) throw new NotIsolatedDatabaseError('URL mentions neon');
  if (url.searchParams.get('sslmode') !== 'disable') {
    throw new NotIsolatedDatabaseError('sslmode=disable is required (local cluster only)');
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!DB_NAME.test(name)) throw new NotIsolatedDatabaseError('database name must be vitruv_it_*');
  for (const key of ['DATABASE_URL', 'DATABASE_URL_DIRECT']) {
    const other = env[key]?.trim();
    if (other && other === value.trim()) {
      throw new NotIsolatedDatabaseError(`${ISOLATED_DB_ENV} equals ${key}`);
    }
  }
  return url;
}

/** Same server, another `vitruv_it_*` database (e.g. one per scenario). */
export function isolatedDatabaseUrl(base: URL, database: string): string {
  if (!DB_NAME.test(database))
    throw new NotIsolatedDatabaseError('database name must be vitruv_it_*');
  const url = new URL(base.toString());
  url.pathname = `/${database}`;
  return url.toString();
}

type Queryable = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Dynamic check on an open connection: the server must be the marked test cluster. */
export async function assertIsolatedServer(client: Queryable): Promise<void> {
  const { rows } = await client.query(
    "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
  );
  const row = rows[0] ?? {};
  if (row.cluster !== ISOLATED_CLUSTER_NAME) {
    throw new NotIsolatedDatabaseError(`server cluster_name is not '${ISOLATED_CLUSTER_NAME}'`);
  }
  const addr = String(row.addr ?? '').replace(/\/\d+$/, '');
  if (!LOOPBACK.has(addr)) throw new NotIsolatedDatabaseError('server address is not loopback');
  if (!DB_NAME.test(String(row.db))) {
    throw new NotIsolatedDatabaseError('connected database is not vitruv_it_*');
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers for DB test suites (they all go through the guard above)
// ---------------------------------------------------------------------------------------------

/** Base URL of the isolated cluster, statically AND dynamically verified. */
export async function verifiedIsolatedBase(env: NodeJS.ProcessEnv = process.env): Promise<URL> {
  const base = assertIsolatedTestDatabaseUrl(env[ISOLATED_DB_ENV], env);
  const client = new pg.Client({ connectionString: base.toString() });
  await client.connect();
  try {
    await assertIsolatedServer(client);
  } finally {
    await client.end();
  }
  return base;
}

/**
 * Drops (if present) and creates `database` on the verified isolated cluster. Only ever runs
 * after assertIsolatedServer() passed on the same server.
 */
export async function recreateIsolatedDatabase(base: URL, database: string): Promise<string> {
  const target = isolatedDatabaseUrl(base, database);
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  try {
    await assertIsolatedServer(admin);
    await admin.query(`drop database if exists "${database}" with (force)`);
    await admin.query(`create database "${database}"`);
  } finally {
    await admin.end();
  }
  return target;
}

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

type JournalEntry = { idx: number; tag: string };

/** Journal entries of the repository's migrations folder (in order). */
export function migrationJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

/**
 * Applies the repository migrations with drizzle's migrator (same as `pnpm db:migrate`), after
 * the destructive-SQL guard, to an isolated database. `throughTag` stops after that migration
 * (a copy of the folder with a shortened journal is used; the repository files are not touched).
 */
export async function migrateIsolated(url: string, throughTag?: string): Promise<number> {
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql'));
  assertMigrationsAreSafe(
    files.map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') })),
    new Set(
      JSON.parse(readFileSync(join(MIGRATIONS, 'APPROVED_DESTRUCTIVE.json'), 'utf8')) as string[],
    ),
  );
  let folder = MIGRATIONS;
  if (throughTag) {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
      entries: JournalEntry[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === throughTag);
    if (end < 0) throw new Error(`unknown migration ${throughTag}`);
    folder = mkdtempSync(join(tmpdir(), 'vitruv-it-migrations-'));
    mkdirSync(join(folder, 'meta'));
    const entries = journal.entries.slice(0, end + 1);
    for (const entry of entries) {
      copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    }
    writeFileSync(
      join(folder, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries }, null, 2),
    );
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const probe = await pool.connect();
    try {
      await assertIsolatedServer(probe);
    } finally {
      probe.release();
    }
    await migrate(drizzle(pool), { migrationsFolder: folder });
    const { rows } = await pool.query<{ count: number }>(
      'select count(*)::int as count from drizzle.__drizzle_migrations',
    );
    return rows[0]?.count ?? 0;
  } finally {
    await pool.end();
    if (folder !== MIGRATIONS) rmSync(folder, { recursive: true, force: true });
  }
}
