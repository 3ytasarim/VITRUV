import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../types';
import {
  authenticate,
  createDevPrincipalResolver,
  DEV_AUTH_HEADER,
  type DevUserRecord,
} from './authenticate';

const TOKEN = 'fictional-dev-token-0123456789-abcdef';

function appWith(user: DevUserRecord | null) {
  let lookups = 0;
  const resolver = createDevPrincipalResolver({
    token: TOKEN,
    email: 'dev@vitruv.invalid',
    loadUser: async () => {
      lookups += 1;
      return user;
    },
  });
  const app = new Hono<AppEnv>();
  app.use('*', authenticate(resolver));
  app.get('/', (c) => c.json(c.get('principal') ?? null));
  return { app, lookups: () => lookups };
}

const call = (app: Hono<AppEnv>, headers: Record<string, string> = {}) =>
  Promise.resolve(app.request('/', { headers })).then((res) => res.json());

describe('development principal resolver', () => {
  const active = { id: 'u-1', role: 'COACH', status: 'ACTIVE' };

  it('is anonymous without the header or with a wrong token', async () => {
    const { app } = appWith(active);
    expect(await call(app)).toBeNull();
    expect(await call(app, { [DEV_AUTH_HEADER]: 'wrong' })).toBeNull();
    expect(await call(app, { [DEV_AUTH_HEADER]: `${TOKEN}x` })).toBeNull();
  });

  it('takes the role from the database user, never from the request', async () => {
    const { app } = appWith(active);
    expect(await call(app, { [DEV_AUTH_HEADER]: TOKEN, 'X-Role': 'ADMIN' })).toEqual({
      userId: 'u-1',
      role: 'COACH',
    });
  });

  it('rejects disabled or missing users and unknown roles', async () => {
    expect(
      await call(appWith({ ...active, status: 'DISABLED' }).app, { [DEV_AUTH_HEADER]: TOKEN }),
    ).toBeNull();
    expect(await call(appWith(null).app, { [DEV_AUTH_HEADER]: TOKEN })).toBeNull();
    expect(
      await call(appWith({ ...active, role: 'ROOT' }).app, { [DEV_AUTH_HEADER]: TOKEN }),
    ).toBeNull();
  });

  it('caches the user lookup briefly', async () => {
    const { app, lookups } = appWith(active);
    await call(app, { [DEV_AUTH_HEADER]: TOKEN });
    await call(app, { [DEV_AUTH_HEADER]: TOKEN });
    expect(lookups()).toBe(1);
  });
});
