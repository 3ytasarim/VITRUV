import { createRateLimiter } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver, testAuthLimits } from '../../../test/helpers';

/**
 * Route-level gates of the management API (no database: requests that pass the permission
 * check would reach the DB guard, so only rejections are asserted here; behaviour with data is
 * covered by test/management.int.test.ts).
 */
const ID = '00000000-0000-4000-8000-000000000001';
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('management route permissions', () => {
  const asRole = (role: 'ADMIN' | 'COACH' | 'CLIENT') =>
    buildTestApp({ auth: principalResolver(role, '00000000-0000-4000-8000-0000000000aa') });

  it('anonymous callers get 401 everywhere, responses are no-store', async () => {
    const app = buildTestApp();
    for (const [method, path] of [
      ['GET', '/v1/admin/clients'],
      ['GET', `/v1/admin/clients/${ID}`],
      ['GET', '/v1/admin/coaches'],
      ['GET', '/v1/client/me'],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('CLIENT is refused on every management route', async () => {
    const app = asRole('CLIENT');
    const requests: [string, string, unknown?][] = [
      ['GET', '/v1/admin/clients'],
      ['POST', '/v1/admin/clients', { firstName: 'a', lastName: 'b', email: 'a@b.de' }],
      ['GET', `/v1/admin/clients/${ID}`],
      ['PATCH', `/v1/admin/clients/${ID}`, { firstName: 'x' }],
      ['PUT', `/v1/admin/clients/${ID}/assignment`, { coachId: null }],
      ['PUT', `/v1/admin/clients/${ID}/account`, { status: 'DISABLED' }],
      ['POST', `/v1/admin/clients/${ID}/activation`],
      ['GET', '/v1/admin/coaches'],
      ['POST', '/v1/admin/coaches', { displayName: 'x', email: 'a@b.de' }],
      ['PUT', `/v1/admin/coaches/${ID}/account`, { status: 'DISABLED' }],
    ];
    for (const [method, path, body] of requests) {
      const res = await app.request(path, body === undefined ? { method } : json(method, body));
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('COACH can not manage coaches, reassign clients or list coach options', async () => {
    const app = asRole('COACH');
    for (const [method, path, body] of [
      ['GET', '/v1/admin/coaches'],
      ['GET', `/v1/admin/coaches/${ID}`],
      ['POST', '/v1/admin/coaches', { displayName: 'x', email: 'a@b.de' }],
      ['PATCH', `/v1/admin/coaches/${ID}`, { displayName: 'x' }],
      ['PUT', `/v1/admin/coaches/${ID}/account`, { status: 'DISABLED' }],
      ['POST', `/v1/admin/coaches/${ID}/activation`],
      ['PUT', `/v1/admin/clients/${ID}/assignment`, { coachId: null }],
      ['GET', '/v1/admin/clients/coach-options'],
    ] as const) {
      const res = await app.request(path, body === undefined ? { method } : json(method, body));
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('validates ids, bodies and list parameters before any lookup', async () => {
    const app = asRole('ADMIN');
    expect((await app.request('/v1/admin/clients/not-a-uuid')).status).toBe(400);
    expect((await app.request('/v1/admin/clients?pageSize=51')).status).toBe(400);
    expect((await app.request('/v1/admin/clients?coachingStatus=DELETED')).status).toBe(400);
    const badCreate = await app.request(
      '/v1/admin/clients',
      json('POST', { firstName: '', lastName: 'x', email: 'kein-email' }),
    );
    expect(badCreate.status).toBe(400);
    // unknown fields on updates are rejected (no role/email smuggling)
    const smuggle = await app.request(`/v1/admin/clients/${ID}`, json('PATCH', { role: 'ADMIN' }));
    expect(smuggle.status).toBe(400);
    const status = await app.request(
      `/v1/admin/clients/${ID}/account`,
      json('PUT', { status: 'DELETED' }),
    );
    expect(status.status).toBe(400);
  });
});

describe('public activation endpoints', () => {
  it('validate the token format and the password policy without touching the database', async () => {
    const app = buildTestApp();
    const bad = await app.request('/v1/auth/activate', json('POST', { token: 'x', password: 'y' }));
    expect(bad.status).toBe(400);
    const weak = await app.request(
      '/v1/auth/activate',
      json('POST', { token: 'A'.repeat(43), password: 'kurz' }),
    );
    expect(weak.status).toBe(400);
    expect(await weak.text()).toContain('Mindestens 12 Zeichen');
  });

  it('are rate-limited per client IP', async () => {
    const app = buildTestApp({
      sessions: {
        db: undefined as never,
        limits: testAuthLimits({
          activationPerIp: createRateLimiter({ limit: 2, windowMs: 60_000 }),
        }),
      },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push(
        (await app.request('/v1/auth/activation/check', json('POST', { token: 'x' }))).status,
      );
    }
    expect(statuses).toEqual([400, 400, 429]);
  });
});
