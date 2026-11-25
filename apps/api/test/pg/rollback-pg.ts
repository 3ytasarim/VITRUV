import {
  assertIsolatedServer,
  assertIsolatedTestDatabaseUrl,
  createDatabase,
  ISOLATED_DB_ENV,
  isolatedDatabaseUrl,
  type DatabaseHandle,
  type DbExecutor,
} from '@vitruv/db';
import { sql } from 'drizzle-orm';
import { inRollback as inRollbackOriginal } from '../rollback';

/**
 * `test:pg` replacement for test/rollback.ts (wired by a vitest alias — the existing integration
 * suites stay byte-for-byte unchanged). Same API, but the database is the migrated, ISOLATED
 * `vitruv_it_api` instead of DATABASE_URL, and every rolled-back test first re-checks the
 * server's cluster_name marker on its own connection (fail-closed).
 */
// Everything else (must, createFixture, createAsset …) unchanged; the three names below shadow it.
export * from '../rollback';

const base = assertIsolatedTestDatabaseUrl(process.env[ISOLATED_DB_ENV], process.env);
export const databaseUrl = isolatedDatabaseUrl(base, 'vitruv_it_api');

export function openTestDatabase(): DatabaseHandle {
  return createDatabase(databaseUrl, { maxConnections: 2, connectionTimeoutMs: 15_000 });
}

export async function inRollback(
  handle: DatabaseHandle,
  test: (tx: DbExecutor) => Promise<void>,
): Promise<void> {
  await inRollbackOriginal(handle, async (tx) => {
    await assertIsolatedServer({
      query: async (text) => ({
        rows: (await tx.execute(sql.raw(text))).rows as Record<string, unknown>[],
      }),
    });
    await test(tx);
  });
}
