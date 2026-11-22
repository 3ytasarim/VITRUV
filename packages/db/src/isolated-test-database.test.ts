import { describe, expect, it } from 'vitest';
import {
  assertIsolatedServer,
  assertIsolatedTestDatabaseUrl,
  isolatedDatabaseUrl,
  NotIsolatedDatabaseError,
} from './isolated-test-database';

const OK = 'postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable';

describe('isolated test database guard (Sprint 2.5, fail-closed)', () => {
  it('accepts only a loopback vitruv_it_* URL with sslmode=disable', () => {
    expect(assertIsolatedTestDatabaseUrl(OK, {}).hostname).toBe('127.0.0.1');
    const refused = [
      undefined,
      '',
      'not a url',
      'mysql://127.0.0.1/vitruv_it_a?sslmode=disable',
      'postgresql://u:p@ep-cool-1.eu-central-1.aws.neon.tech/vitruv_it_a?sslmode=disable',
      'postgresql://u@db.example.com/vitruv_it_a?sslmode=disable',
      'postgresql://u@127.0.0.1/neondb?sslmode=disable',
      'postgresql://u@127.0.0.1/vitruv?sslmode=disable',
      'postgresql://u@127.0.0.1/vitruv_it_a',
      'postgresql://u@127.0.0.1/vitruv_it_a?sslmode=require',
    ];
    for (const value of refused) {
      expect(() => assertIsolatedTestDatabaseUrl(value, {}), String(value)).toThrow(
        NotIsolatedDatabaseError,
      );
    }
  });

  it('refuses a URL identical to DATABASE_URL / DATABASE_URL_DIRECT', () => {
    expect(() => assertIsolatedTestDatabaseUrl(OK, { DATABASE_URL: OK })).toThrow(/DATABASE_URL/);
    expect(() => assertIsolatedTestDatabaseUrl(OK, { DATABASE_URL_DIRECT: OK })).toThrow(
      /DATABASE_URL_DIRECT/,
    );
  });

  it('never puts the URL (credentials) into the error message', () => {
    const secret = 'postgresql://user:s3cr3t@db.example.com/vitruv_it_a?sslmode=disable';
    expect(() => assertIsolatedTestDatabaseUrl(secret, {})).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('s3cr3t') }),
    );
  });

  it('derives sibling databases only with a vitruv_it_* name', () => {
    const base = assertIsolatedTestDatabaseUrl(OK, {});
    expect(isolatedDatabaseUrl(base, 'vitruv_it_fresh')).toContain('/vitruv_it_fresh?');
    expect(() => isolatedDatabaseUrl(base, 'postgres')).toThrow(NotIsolatedDatabaseError);
  });

  it('dynamic check: server must report the vitruv-it marker, loopback and vitruv_it_*', async () => {
    const server = (row: Record<string, unknown>) => ({ query: async () => ({ rows: [row] }) });
    await expect(
      assertIsolatedServer(
        server({ cluster: 'vitruv-it', addr: '127.0.0.1/32', db: 'vitruv_it_a' }),
      ),
    ).resolves.toBeUndefined();
    for (const row of [
      { cluster: '', addr: '127.0.0.1/32', db: 'vitruv_it_a' }, // any other local PostgreSQL
      { cluster: 'vitruv-it', addr: '10.1.2.3/32', db: 'vitruv_it_a' }, // tunnelled remote
      { cluster: 'vitruv-it', addr: '127.0.0.1/32', db: 'neondb' },
      {},
    ]) {
      await expect(assertIsolatedServer(server(row))).rejects.toThrow(NotIsolatedDatabaseError);
    }
  });
});
