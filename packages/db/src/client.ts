import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { poolConfigFromUrl } from './connection';
import * as schema from './schema/index';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Anything that can run queries: the pooled database or an open transaction. Services take this,
 * so they compose inside a caller's transaction (and integration tests can roll everything back).
 */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Lightweight connectivity probe (`select 1`). Throws on failure. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Max pooled connections. Neon's pooler multiplexes further; keep this modest per process. */
  maxConnections?: number;
  connectionTimeoutMs?: number;
}

export function createDatabase(
  connectionString: string,
  options: CreateDatabaseOptions = {},
): DatabaseHandle {
  const pool = new pg.Pool({
    ...poolConfigFromUrl(connectionString),
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
    idleTimeoutMillis: 30_000,
  });
  // An idle client erroring (e.g. Neon scaling to zero) must not crash the process.
  pool.on('error', () => undefined);

  const db = drizzle(pool, { schema });

  return {
    db,
    async ping() {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}
