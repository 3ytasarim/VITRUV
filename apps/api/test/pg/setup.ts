import { assertIsolatedTestDatabaseUrl, ISOLATED_DB_ENV } from '@vitruv/db';

/**
 * Setup for `test:pg` (Sprint 2.5). Deliberately loads NO `.env`. The production variable names
 * are removed from the test process (nothing can fall back to them) and the isolated URL is
 * checked statically — a bad value throws (fail-closed, never a silent skip).
 */
assertIsolatedTestDatabaseUrl(process.env[ISOLATED_DB_ENV], process.env);
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_DIRECT;
delete process.env.DIRECT_URL;
