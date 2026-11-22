import { assertIsolatedTestDatabaseUrl, ISOLATED_DB_ENV } from '../src/isolated-test-database';

/**
 * Setup for `test:pg` (real, ISOLATED PostgreSQL). Deliberately does NOT load any `.env`.
 * Production variable names are removed from this process so nothing can fall back to them,
 * then the isolated URL is checked statically (fail-closed: a bad value throws, no skip).
 */
const isolated = process.env[ISOLATED_DB_ENV];
assertIsolatedTestDatabaseUrl(isolated, process.env);
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_DIRECT;
delete process.env.DIRECT_URL;
