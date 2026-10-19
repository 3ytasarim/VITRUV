import { createDatabase, type DatabaseHandle } from '@vitruv/db';
import { dbHealthResponseSchema } from '@vitruv/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

/**
 * Integration: the real API health route against the configured Neon database.
 * Read-only (`select 1`). Skipped when DATABASE_URL is not available.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('GET /health/db against Neon (integration)', () => {
  let database: DatabaseHandle | undefined;
  afterAll(async () => database?.close());

  it('reports the database as reachable', async () => {
    database = createDatabase(url as string, { maxConnections: 1 });
    const app = buildTestApp({
      health: {
        version: 'int',
        startedAt: Date.now(),
        pingDatabase: database.ping,
        dbTimeoutMs: 10_000,
      },
    });
    const res = await app.request('/health/db');
    const body = dbHealthResponseSchema.parse(await res.json());
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });
});
