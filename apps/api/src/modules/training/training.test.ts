import { describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from '../../../test/helpers';

/**
 * Route gates of the training API (no database: only rejections are asserted here; behaviour
 * with data, object scope and nested-id guessing are covered by test/training.int.test.ts).
 */
const ID = '00000000-0000-4000-8000-000000000001';
const T = '/v1/admin/training';
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const ROUTES: [string, string, unknown?][] = [
  ['GET', `${T}/exercises`],
  ['POST', `${T}/exercises`, { name: 'Plank' }],
  ['PATCH', `${T}/exercises/${ID}`, { name: 'Plank' }],
  ['POST', `${T}/exercises/${ID}/deactivate`],
  ['GET', `${T}/clients/${ID}/programs`],
  ['POST', `${T}/clients/${ID}/programs`, { title: 'Plan' }],
  ['GET', `${T}/programs/${ID}`],
  ['GET', `${T}/programs/${ID}/preview`],
  ['POST', `${T}/programs/${ID}/activate`],
  ['POST', `${T}/programs/${ID}/weeks`, {}],
  ['PATCH', `${T}/weeks/${ID}`, { title: 'W' }],
  ['POST', `${T}/weeks/${ID}/days`, { title: 'Tag' }],
  ['POST', `${T}/days/${ID}/sections`, { type: 'MAIN' }],
  ['POST', `${T}/sections/${ID}/assignments`, { exerciseId: ID, sets: 3, reps: 10 }],
  ['PATCH', `${T}/assignments/${ID}`, { sets: 3 }],
  ['DELETE', `${T}/assignments/${ID}`],
  ['GET', `${T}/media`],
  ['DELETE', `${T}/media/${ID}`],
];
const send = (
  app: ReturnType<typeof buildTestApp>,
  [method, path, body]: (typeof ROUTES)[number],
) => app.request(path, body === undefined ? { method } : json(method, body));

describe('training routes — permission boundary', () => {
  it('anonymous: 401 everywhere, no-store', async () => {
    const app = buildTestApp();
    for (const route of ROUTES) {
      const res = await send(app, route);
      expect(res.status, route.join(' ')).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('CLIENT: 403 on every admin training route', async () => {
    const app = buildTestApp({ auth: principalResolver('CLIENT', 'u-client') });
    for (const route of ROUTES) expect((await send(app, route)).status, route.join(' ')).toBe(403);
  });

  it('COACH may not delete training media (ADMIN only) and has no website CMS access', async () => {
    const app = buildTestApp({ auth: principalResolver('COACH', 'u-coach') });
    expect((await app.request(`${T}/media/${ID}`, { method: 'DELETE' })).status).toBe(403);
    expect((await app.request('/v1/admin/website/pages')).status).toBe(403);
    expect((await app.request('/v1/admin/media')).status).toBe(403);
  });

  it('the client endpoint is self-context only: no client id route exists; non-clients get 403', async () => {
    const coach = buildTestApp({ auth: principalResolver('COACH', 'u-coach') });
    expect((await coach.request('/v1/client/training/active')).status).toBe(403);
    expect((await coach.request(`/v1/client/${ID}/training`)).status).toBe(404);
    expect((await buildTestApp().request('/v1/client/training/active')).status).toBe(401);
  });

  it('validates ids, prescriptions and reorder payloads before any lookup', async () => {
    const app = buildTestApp({ auth: principalResolver('ADMIN', 'u-admin') });
    expect((await app.request(`${T}/programs/not-a-uuid`)).status).toBe(400);
    const empty = await app.request(
      `${T}/sections/${ID}/assignments`,
      json('POST', { exerciseId: ID }),
    );
    expect(empty.status).toBe(400);
    expect(await empty.text()).toContain('mindestens');
    const negative = await app.request(
      `${T}/sections/${ID}/assignments`,
      json('POST', { exerciseId: ID, sets: 3, reps: 10, restSeconds: -1 }),
    );
    expect(negative.status).toBe(400);
    const dup = await app.request(
      `${T}/programs/${ID}/weeks/reorder`,
      json('POST', { ids: [ID, ID] }),
    );
    expect(dup.status).toBe(400);
    const smuggle = await app.request(`${T}/programs/${ID}`, json('PATCH', { clientId: ID }));
    expect(smuggle.status).toBe(400);
    const status = await app.request(`${T}/programs/${ID}`, json('PATCH', { status: 'ACTIVE' }));
    expect(status.status).toBe(400);
  });
});
