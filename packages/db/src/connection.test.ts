import { describe, expect, it } from 'vitest';
import {
  describeDatabaseTarget,
  MissingDatabaseUrlError,
  poolConfigFromUrl,
  requireDatabaseUrl,
  toDirectUrl,
} from './connection';

// Fictional URLs only — never real credentials in tests.
const pooled =
  'postgresql://user:pw@ep-fake-name-123456-pooler.eu-central-1.aws.neon.tech/app?sslmode=require&channel_binding=require';

describe('requireDatabaseUrl', () => {
  it('fails clearly when DATABASE_URL is missing or blank', () => {
    expect(() => requireDatabaseUrl({})).toThrow(MissingDatabaseUrlError);
    expect(() => requireDatabaseUrl({ DATABASE_URL: '  ' })).toThrow(MissingDatabaseUrlError);
  });

  it('rejects non-postgres URLs', () => {
    expect(() => requireDatabaseUrl({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});

describe('toDirectUrl', () => {
  it('drops the -pooler suffix from the endpoint host only', () => {
    const direct = new URL(toDirectUrl(pooled));
    expect(direct.hostname).toBe('ep-fake-name-123456.eu-central-1.aws.neon.tech');
    expect(direct.username).toBe('user');
    expect(direct.pathname).toBe('/app');
  });

  it('leaves direct URLs untouched', () => {
    const url = 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/app?sslmode=require';
    expect(toDirectUrl(url)).toBe(url);
  });
});

describe('poolConfigFromUrl', () => {
  it('enforces certificate verification for sslmode=require', () => {
    const config = poolConfigFromUrl(pooled);
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.connectionString).not.toContain('channel_binding');
  });

  it('only disables TLS when explicitly requested', () => {
    expect(poolConfigFromUrl('postgresql://u:p@localhost/db?sslmode=disable').ssl).toBe(false);
    expect(poolConfigFromUrl('postgresql://u:p@localhost/db').ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
});

describe('describeDatabaseTarget', () => {
  it('returns credential-free metadata', () => {
    const info = describeDatabaseTarget(pooled);
    expect(info).toEqual({ provider: 'neon', pooled: true, tls: true });
    expect(JSON.stringify(info)).not.toMatch(/pw|user|ep-fake/);
  });
});
