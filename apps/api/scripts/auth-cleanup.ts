/**
 * Removes auth data that can never be used again (safe to run any time, e.g. daily via the
 * hosting platform's cron):
 *  - sessions past their absolute expiry, or revoked longer than the retention window
 *  - audit events older than the retention window
 *
 *   pnpm --filter @vitruv/api auth:cleanup
 *
 * Narrow WHERE clauses only (see modules/auth/auth.service.ts → purgeSessions/purgeAuthEvents).
 */
import { createDatabase } from '@vitruv/db';
import { purgeAuthEvents, purgeSessions } from '../src/modules/auth/auth.service';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const handle = createDatabase(process.env.DATABASE_URL, { maxConnections: 1 });
  try {
    const now = new Date();
    const sessions = await purgeSessions(handle.db, now);
    const events = await purgeAuthEvents(handle.db, now);
    console.warn(`auth cleanup: ${sessions} session(s), ${events} audit event(s) removed`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(`auth cleanup failed: ${(error as Error).name}`);
  process.exit(1);
});
