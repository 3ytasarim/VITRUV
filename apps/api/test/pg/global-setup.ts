import { migrateIsolated, recreateIsolatedDatabase, verifiedIsolatedBase } from '@vitruv/db';

/**
 * Once per `test:pg` run: verify the isolated cluster (static + cluster_name marker), recreate the
 * throw-away database `vitruv_it_api` and apply ALL repository migrations with drizzle's migrator.
 * The existing *.int.test.ts suites then run against it (through test/pg/rollback-pg.ts).
 */
export default async function setup(): Promise<void> {
  const base = await verifiedIsolatedBase(process.env);
  const url = await recreateIsolatedDatabase(base, 'vitruv_it_api');
  const applied = await migrateIsolated(url);
  if (applied !== 25) throw new Error(`expected 25 applied migrations, got ${applied}`);
}
