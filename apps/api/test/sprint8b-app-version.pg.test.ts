import { appCompatibilitySchema, authSessionResponseSchema } from '@vitruv/contracts';
import {
  assertIsolatedServer,
  createDatabase,
  migrateIsolated,
  recreateIsolatedDatabase,
  schema,
  verifiedIsolatedBase,
  type DatabaseHandle,
} from '@vitruv/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { appVersionDepsFromEnv, type AppVersionDeps } from '../src/modules/app/app-version';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits, testUrls } from './helpers';

/**
 * Sprint 8B — minimum mobile app version, end to end with REAL sessions (login → access token →
 * session resolver → clientType), isolated cluster only. Fictional user.
 */
const PASSWORD = 'korrekt Pferd Batterie Heftklammer';
const EMAIL = 'it-version-client@vitruv.invalid';
const STORE = 'https://apps.apple.com/app/id0000000000';
let handle: DatabaseHandle;
let clientId: string;

const policy = (over: Partial<Parameters<typeof appVersionDepsFromEnv>[0]> = {}) =>
  appVersionDepsFromEnv({
    MOBILE_MIN_VERSION_IOS: '1.2.0',
    MOBILE_LEGACY_APP_POLICY: 'allow',
    MOBILE_UPDATE_URL_IOS: STORE,
    ...over,
  });

function app(appVersions?: AppVersionDeps) {
  return buildTestApp({
    db: handle.db,
    bodyLimitBytes: 1_048_576,
    auth: createSessionResolver((token) => resolveAccessToken({ db: handle.db }, token)),
    sessions: { db: handle.db, limits: testAuthLimits() },
    management: { db: handle.db },
    website: { db: handle.db, urls: testUrls },
    ...(appVersions ? { appVersions } : {}),
  });
}

async function login(clientType: 'WEB' | 'MOBILE') {
  const res = await app().request('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, clientType }),
  });
  expect(res.status).toBe(200);
  return authSessionResponseSchema.parse(await res.json());
}

const headers = (token: string, version?: string, platform = 'ios') => ({
  Authorization: `Bearer ${token}`,
  ...(version ? { 'X-Vitruv-App-Version': version, 'X-Vitruv-App-Platform': platform } : {}),
});

describe('Sprint 8B — minimum app version (isolated)', () => {
  beforeAll(async () => {
    const base = await verifiedIsolatedBase(process.env);
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_s8b_version');
    await migrateIsolated(url);
    handle = createDatabase(url, { maxConnections: 4, connectionTimeoutMs: 15_000 });
    const probe = await handle.db.execute(
      sql.raw(
        "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
      ),
    );
    await assertIsolatedServer({ query: async () => ({ rows: probe.rows }) });
    const [u] = await handle.db
      .insert(schema.users)
      .values({
        email: EMAIL,
        role: 'CLIENT',
        status: 'ACTIVE',
        displayName: 'Versions Test',
        passwordHash: await hashPassword(PASSWORD),
      })
      .returning();
    if (!u) throw new Error('fixture user');
    clientId = u.id;
    await handle.db
      .insert(schema.clientProfiles)
      .values({ userId: clientId, firstName: 'Versions', lastName: 'Test' });
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('default (nothing configured): even a very old version passes — production unchanged', async () => {
    const mobile = await login('MOBILE');
    const res = await app().request('/v1/client/me', {
      headers: headers(mobile.tokens.accessToken, '0.0.1'),
    });
    expect(res.status).toBe(200);
  });

  it('MOBILE below the minimum → 426 APP_UPDATE_REQUIRED; at/above → 200', async () => {
    const mobile = await login('MOBILE');
    const old = await app(policy()).request('/v1/client/me', {
      headers: headers(mobile.tokens.accessToken, '1.1.9'),
    });
    expect(old.status).toBe(426);
    const body = (await old.json()) as {
      error: { code: string; details: { path: string; message: string }[] };
    };
    expect(body.error.code).toBe('APP_UPDATE_REQUIRED');
    expect(body.error.details).toEqual([
      { path: 'minimumVersion', message: '1.2.0' },
      { path: 'updateUrl', message: STORE },
    ]);
    for (const ok of ['1.2.0', '1.10.0', '2.0.0']) {
      const res = await app(policy()).request('/v1/client/me', {
        headers: headers(mobile.tokens.accessToken, ok),
      });
      expect(res.status, ok).toBe(200);
    }
  });

  it('an outdated app is NOT logged out: auth routes work, the session stays valid', async () => {
    const mobile = await login('MOBILE');
    const a = app(policy());
    expect(
      (await a.request('/v1/client/me', { headers: headers(mobile.tokens.accessToken, '1.0.0') }))
        .status,
    ).toBe(426);
    const me = await a.request('/v1/auth/me', {
      headers: headers(mobile.tokens.accessToken, '1.0.0'),
    });
    expect(me.status).toBe(200);
    const refreshed = await a.request('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vitruv-App-Version': '1.0.0' },
      body: JSON.stringify({ refreshToken: mobile.tokens.refreshToken }),
    });
    expect(refreshed.status).toBe(200);
    const sessions = await handle.db
      .select({ revokedAt: schema.authSessions.revokedAt })
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, clientId));
    expect(sessions.every((s) => s.revokedAt === null)).toBe(true);
  });

  it('web sessions are never version-gated (no header, or even an old header)', async () => {
    const web = await login('WEB');
    const strict = app(policy({ MOBILE_LEGACY_APP_POLICY: 'update_required' }));
    expect(
      (await strict.request('/v1/client/me', { headers: headers(web.tokens.accessToken) })).status,
    ).toBe(200);
    expect(
      (await strict.request('/v1/client/me', { headers: headers(web.tokens.accessToken, '0.0.1') }))
        .status,
    ).toBe(200);
  });

  it('legacy app builds (MOBILE, no header): allowed by default, 426 only with update_required', async () => {
    const mobile = await login('MOBILE');
    expect(
      (
        await app(policy()).request('/v1/client/me', {
          headers: headers(mobile.tokens.accessToken),
        })
      ).status,
    ).toBe(200);
    const strict = app(policy({ MOBILE_LEGACY_APP_POLICY: 'update_required' }));
    expect(
      (await strict.request('/v1/client/me', { headers: headers(mobile.tokens.accessToken) }))
        .status,
    ).toBe(426);
    // the other platform has no minimum → never blocked
    expect(
      (
        await strict.request('/v1/client/me', {
          headers: headers(mobile.tokens.accessToken, '0.1.0', 'android'),
        })
      ).status,
    ).toBe(200);
  });

  it('GET /v1/app/compatibility is public, uncached and mirrors the decision', async () => {
    const a = app(policy());
    const check = async (h: Record<string, string>) => {
      const res = await a.request('/v1/app/compatibility', { headers: h });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      return appCompatibilitySchema.parse(await res.json());
    };
    expect(
      await check({ 'X-Vitruv-App-Version': '1.1.0', 'X-Vitruv-App-Platform': 'ios' }),
    ).toEqual({
      status: 'UPDATE_REQUIRED',
      platform: 'ios',
      version: '1.1.0',
      minimumVersion: '1.2.0',
      updateUrl: STORE,
    });
    expect(
      (await check({ 'X-Vitruv-App-Version': '1.2.0', 'X-Vitruv-App-Platform': 'ios' })).status,
    ).toBe('SUPPORTED');
    expect((await check({})).status).toBe('UNKNOWN');
    const none = await app().request('/v1/app/compatibility', {
      headers: { 'X-Vitruv-App-Version': '0.0.1', 'X-Vitruv-App-Platform': 'ios' },
    });
    expect(((await none.json()) as { status: string }).status).toBe('SUPPORTED');
  });

  it('an invalid token with an old version header is 401 (not 426): no version oracle', async () => {
    const res = await app(policy()).request('/v1/client/me', {
      headers: headers('not-a-real-token', '0.0.1'),
    });
    expect(res.status).toBe(401);
  });
});
