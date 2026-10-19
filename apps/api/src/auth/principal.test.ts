import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { AppError, errorBody } from '../lib/errors';
import type { AppEnv } from '../types';
import { type Principal, requirePermission } from './principal';

function appWith(principal?: Principal) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    // Stands in for the future authentication middleware.
    if (principal) c.set('principal', principal);
    await next();
  });
  app.get('/cms', requirePermission('website.content.write'), (c) => c.text('ok'));
  app.onError((error, c) =>
    error instanceof AppError
      ? c.json(errorBody(error.code, error.message, undefined), error.status)
      : c.text('unexpected', 500),
  );
  return app;
}

describe('requirePermission', () => {
  it('rejects anonymous requests with 401', async () => {
    expect((await appWith().request('/cms')).status).toBe(401);
  });

  it('rejects roles without the permission with 403', async () => {
    const res = await appWith({ userId: 'u1', role: 'CLIENT' }).request('/cms');
    expect(res.status).toBe(403);
  });

  it('allows roles with the permission (Website CMS: ADMIN only)', async () => {
    const res = await appWith({ userId: 'u1', role: 'ADMIN' }).request('/cms');
    expect(res.status).toBe(200);
    const coach = await appWith({ userId: 'u2', role: 'COACH' }).request('/cms');
    expect(coach.status).toBe(403);
  });

  it('ignores role claims sent by the client', async () => {
    const res = await appWith().request('/cms', {
      headers: { 'X-Role': 'ADMIN', 'X-User-Id': 'u1' },
    });
    expect(res.status).toBe(401);
  });
});
