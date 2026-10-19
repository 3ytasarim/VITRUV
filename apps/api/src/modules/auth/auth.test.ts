import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, principalResolver, silentLogger, unusedDb } from '../../../test/helpers';
import { bearerToken, chainResolvers, DEV_AUTH_HEADER } from '../../auth/authenticate';
import { createAuthResolver } from '../../auth/resolver';
import { loadApiEnv } from '../../config/env';
import { createClientIpResolver } from '../../lib/client-ip';
import type { AppEnv } from '../../types';
import { dummyPasswordHash, hashPassword, needsRehash, verifyPassword } from './password';
import { generateToken, hashToken, SESSION_POLICIES } from './tokens';

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: (c: { req: { header: (n: string) => string | undefined } }) => ({
    remote: { address: c.req.header('x-test-peer') ?? '198.51.100.1' },
  }),
}));

describe('password hashing (Argon2id)', () => {
  it('produces PHC strings with the documented parameters and a random salt', async () => {
    const a = await hashPassword('mit Leerzeichen und Ümlauten ✓');
    const b = await hashPassword('mit Leerzeichen und Ümlauten ✓');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(a).not.toBe(b);
    expect(needsRehash(a)).toBe(false);
  });

  it('verifies exactly — no trimming, no truncation, malformed hashes fail closed', async () => {
    const long = `${'x'.repeat(200)}-ende`;
    const hash = await hashPassword(long);
    expect(await verifyPassword(hash, long)).toBe(true);
    expect(await verifyPassword(hash, long.slice(0, 200))).toBe(false);
    const spaced = await hashPassword(' passwort mit rand ');
    expect(await verifyPassword(spaced, 'passwort mit rand')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('flags hashes with older parameters for upgrade', () => {
    expect(needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('has a real dummy hash for unknown accounts (equal verification work)', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(dummy, '')).toBe(false);
  });
});

describe('tokens', () => {
  it('are 256-bit base64url values from the CSPRNG and stored only as SHA-256 hex', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it('never creates indefinitely valid sessions', () => {
    for (const policy of Object.values(SESSION_POLICIES)) {
      expect(policy.accessTtlMs).toBeLessThanOrEqual(15 * 60_000);
      expect(policy.refreshIdleMs).toBeLessThan(policy.absoluteMs);
      expect(policy.absoluteMs).toBeLessThanOrEqual(90 * 86_400_000);
    }
  });
});

describe('resolvers', () => {
  const request = (headers: Record<string, string>) => {
    const app = new Hono<AppEnv>();
    let token: string | null = null;
    app.get('/', (c) => {
      token = bearerToken(c);
      return c.body(null, 204);
    });
    return Promise.resolve(app.request('/', { headers })).then(() => token);
  };

  it('accepts only well-formed Bearer tokens', async () => {
    const token = generateToken();
    expect(await request({ authorization: `Bearer ${token}` })).toBe(token);
    expect(await request({ authorization: `bearer ${token}` })).toBeNull();
    expect(await request({ authorization: `Basic ${token}` })).toBeNull();
    expect(await request({ authorization: 'Bearer short' })).toBeNull();
    expect(await request({ cookie: `session=${token}` })).toBeNull();
  });

  it('chains resolvers in order', async () => {
    const chained = chainResolvers(
      { name: 'none', resolve: async () => null },
      principalResolver('COACH', 'u-1'),
    );
    const app = new Hono<AppEnv>();
    app.get('/', async (c) => c.json(await chained.resolve(c)));
    expect(await (await app.request('/')).json()).toEqual({ userId: 'u-1', role: 'COACH' });
  });

  it('never wires the development adapter in production, even if the env check were bypassed', async () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost/db',
      DEV_AUTH: 'enabled',
      DEV_AUTH_TOKEN: 'd'.repeat(40),
      DEV_AUTH_EMAIL: 'dev@vitruv.invalid',
    });
    expect(createAuthResolver(env, unusedDb, silentLogger).name).toBe('session+development');
    const production = { ...env, NODE_ENV: 'production' as const };
    const resolver = createAuthResolver(production, unusedDb, silentLogger);
    expect(resolver.name).toBe('session');
    const app = new Hono<AppEnv>();
    app.get('/', async (c) => c.json({ principal: await resolver.resolve(c) }));
    const res = await app.request('/', { headers: { [DEV_AUTH_HEADER]: 'd'.repeat(40) } });
    expect(await res.json()).toEqual({ principal: null });
  });
});

describe('client IP for rate limits', () => {
  const ipOf = async (headers: Record<string, string>) => {
    const resolve = createClientIpResolver(['127.0.0.1', '::1']);
    const app = new Hono<AppEnv>();
    app.get('/', (c) => c.text(resolve(c)));
    return (await app.request('/', { headers })).text();
  };

  it('ignores X-Forwarded-For from untrusted peers', async () => {
    expect(await ipOf({ 'x-forwarded-for': '203.0.113.9' })).toBe('198.51.100.1');
  });

  it('uses the rightmost forwarded address from a trusted proxy', async () => {
    expect(
      await ipOf({ 'x-test-peer': '127.0.0.1', 'x-forwarded-for': '10.0.0.1, 203.0.113.9' }),
    ).toBe('203.0.113.9');
    expect(await ipOf({ 'x-test-peer': '::1', 'x-forwarded-for': 'not-an-ip' })).toBe('::1');
  });
});

describe('/v1/auth HTTP behaviour (no database needed)', () => {
  const app = buildTestApp();

  it('requires authentication for me / logout-all / password — 401 before validation, no-store', async () => {
    for (const [method, path] of [
      ['GET', '/v1/auth/me'],
      ['POST', '/v1/auth/logout-all'],
      ['POST', '/v1/auth/password'],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('validates login input with the shared contract (no account lookup on invalid input)', async () => {
    const res = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kein-email', password: '', clientType: 'ROOT' }),
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('VALIDATION_FAILED');
    expect(text).not.toContain('kein-email');
  });

  it('rejects oversized auth bodies', async () => {
    const res = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.de', password: 'x'.repeat(20_000), clientType: 'WEB' }),
    });
    expect([400, 413]).toContain(res.status);
  });

  it('rejects malformed refresh tokens before touching the database', async () => {
    const res = await app.request('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('logout without any credential is a harmless no-op', async () => {
    const res = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(204);
  });

  it('CORS: allow-listed origins only, Authorization allowed, never with credentials', async () => {
    const preflight = await app.request('/v1/auth/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    );
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
    const foreign = await app.request('/v1/auth/me', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('admin responses are not cacheable either', async () => {
    const res = await app.request('/v1/admin/website/pages/home');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
