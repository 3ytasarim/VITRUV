import { EnvValidationError } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from './env';

// Fictional URL — never real credentials in tests.
const DATABASE_URL =
  'postgresql://user:pw@ep-fake-pooler.eu-central-1.aws.neon.tech/app?sslmode=require';

describe('loadApiEnv', () => {
  it('applies safe defaults', () => {
    const env = loadApiEnv({ DATABASE_URL });
    expect(env).toMatchObject({ API_PORT: 4000, STORAGE_DRIVER: 'local', CORS_ORIGINS: [] });
  });

  it('fails clearly when DATABASE_URL is missing — no fallback database', () => {
    expect(() => loadApiEnv({})).toThrow(EnvValidationError);
    expect(() => loadApiEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('does not echo secret values in validation errors', () => {
    const bad = 'mysql://user:supersecret@db.example/app';
    expect(() => loadApiEnv({ DATABASE_URL: bad })).toThrow(/DATABASE_URL/);
    expect(() => loadApiEnv({ DATABASE_URL: bad })).not.toThrow(/supersecret/);
  });

  it('parses CORS origins and rejects malformed ones', () => {
    expect(
      loadApiEnv({ DATABASE_URL, CORS_ORIGINS: 'http://localhost:3000, https://vitruv.example' })
        .CORS_ORIGINS,
    ).toEqual(['http://localhost:3000', 'https://vitruv.example']);
    expect(() => loadApiEnv({ DATABASE_URL, CORS_ORIGINS: 'not a url' })).toThrow(/CORS_ORIGINS/);
  });

  it('requires full S3 configuration when the s3 driver is selected', () => {
    expect(() => loadApiEnv({ DATABASE_URL, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET_PRIVATE/);
  });

  it('forbids the local storage driver in production', () => {
    expect(() => loadApiEnv({ DATABASE_URL, NODE_ENV: 'production' })).toThrow(/STORAGE_DRIVER/);
  });

  it('keeps the development auth adapter out of production and requires its settings', () => {
    const token = 'x'.repeat(32);
    expect(() => loadApiEnv({ DATABASE_URL, DEV_AUTH: 'enabled' })).toThrow(/DEV_AUTH_TOKEN/);
    expect(() =>
      loadApiEnv({
        DATABASE_URL,
        DEV_AUTH: 'enabled',
        DEV_AUTH_TOKEN: 'short',
        DEV_AUTH_EMAIL: 'a@b.de',
      }),
    ).toThrow(/DEV_AUTH_TOKEN/);
    expect(
      loadApiEnv({
        DATABASE_URL,
        DEV_AUTH: 'enabled',
        DEV_AUTH_TOKEN: token,
        DEV_AUTH_EMAIL: 'a@b.de',
      }).DEV_AUTH,
    ).toBe('enabled');
    expect(() =>
      loadApiEnv({
        DATABASE_URL,
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        DEV_AUTH: 'enabled',
        DEV_AUTH_TOKEN: token,
        DEV_AUTH_EMAIL: 'a@b.de',
      }),
    ).toThrow(/must never run in production/);
  });

  it('requires a revalidation secret when the revalidation URL is set', () => {
    expect(() =>
      loadApiEnv({ DATABASE_URL, WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate' }),
    ).toThrow(/REVALIDATE_SECRET/);
    expect(
      loadApiEnv({
        DATABASE_URL,
        WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
        REVALIDATE_SECRET: 'r'.repeat(32),
      }).WEB_REVALIDATE_URL,
    ).toBe('http://localhost:3000/api/revalidate');
  });
});
