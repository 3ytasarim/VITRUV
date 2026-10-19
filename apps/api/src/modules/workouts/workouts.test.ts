import { describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from '../../../test/helpers';

/**
 * Route gates of the workout API (no database: only rejections before any lookup are asserted;
 * behaviour, snapshots and object scope are covered by test/workouts.int.test.ts).
 */
const ID = '00000000-0000-4000-8000-000000000001';
const W = '/v1/client/workouts';
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const CLIENT_ROUTES: [string, string, unknown?][] = [
  ['GET', W],
  ['POST', W, { trainingDayId: ID }],
  ['GET', `${W}/current`],
  ['GET', `${W}/${ID}`],
  ['PATCH', `${W}/${ID}/exercises/${ID}`, { status: 'COMPLETED' }],
  ['PATCH', `${W}/${ID}/exercises/${ID}/sets/1`, { completed: true }],
  ['PUT', `${W}/${ID}/note`, { note: 'x' }],
  ['PUT', `${W}/${ID}/exercises/${ID}/note`, { note: 'x' }],
  ['POST', `${W}/${ID}/complete`],
  ['POST', `${W}/${ID}/abandon`],
];
const send = (
  app: ReturnType<typeof buildTestApp>,
  [method, path, body]: [string, string, unknown?],
) => app.request(path, body === undefined ? { method } : json(method, body));

describe('workout routes — permission boundary', () => {
  it('anonymous: 401 everywhere, no-store', async () => {
    const app = buildTestApp();
    for (const route of CLIENT_ROUTES) {
      const res = await send(app, route);
      expect(res.status, route.join(' ')).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect((await app.request(`/v1/admin/training/clients/${ID}/workouts`)).status).toBe(401);
  });

  it('COACH: 403 on every client workout route (self context is CLIENT-only)', async () => {
    const app = buildTestApp({ auth: principalResolver('COACH', 'u-coach') });
    for (const route of CLIENT_ROUTES) {
      expect((await send(app, route)).status, route.join(' ')).toBe(403);
    }
  });

  it('CLIENT: no access to coach summaries; no route takes a client id', async () => {
    const app = buildTestApp({ auth: principalResolver('CLIENT', 'u-client') });
    expect((await app.request(`/v1/admin/training/clients/${ID}/workouts`)).status).toBe(403);
    expect((await app.request(`/v1/admin/training/clients/${ID}/workouts/${ID}`)).status).toBe(403);
    expect((await app.request(`/v1/client/${ID}/workouts`)).status).toBe(404);
  });

  it('validates ids and bodies before any lookup; targets and client ids can not be sent', async () => {
    const app = buildTestApp({ auth: principalResolver('CLIENT', 'u-client') });
    const bad: [string, string, unknown?][] = [
      ['GET', `${W}/not-a-uuid`],
      ['POST', W, { trainingDayId: 'x' }],
      ['POST', W, { trainingDayId: ID, clientId: ID }],
      ['PATCH', `${W}/${ID}/exercises/${ID}`, {}],
      ['PATCH', `${W}/${ID}/exercises/${ID}`, { sets: 5 }],
      ['PATCH', `${W}/${ID}/exercises/${ID}`, { restSeconds: 10 }],
      ['PATCH', `${W}/${ID}/exercises/${ID}`, { actualReps: -3 }],
      ['PATCH', `${W}/${ID}/exercises/${ID}/sets/0`, { completed: true }],
      ['PATCH', `${W}/${ID}/exercises/${ID}/sets/1`, { targetReps: 3 }],
      ['GET', `${W}?limit=1000`],
      ['PUT', `${W}/${ID}/note`, {}],
      ['PUT', `${W}/${ID}/exercises/${ID}/note`, { note: 'x', clientId: ID }],
      ['PUT', `${W}/${ID}/exercises/not-a-uuid/note`, { note: 'x' }],
    ];
    for (const route of bad) expect((await send(app, route)).status, route.join(' ')).toBe(400);
    const roomy = buildTestApp({
      auth: principalResolver('CLIENT', 'u-client'),
      bodyLimitBytes: 65_536,
    });
    const long: [string, string, unknown] = ['PUT', `${W}/${ID}/note`, { note: 'ä'.repeat(2001) }];
    expect((await send(roomy, long)).status).toBe(400);
  });
});
