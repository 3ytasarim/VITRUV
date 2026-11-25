import { createConnection } from 'node:net';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/helpers';

/**
 * Sprint 7.5 — authorization must not depend on how a path is spelled.
 *
 * Authentication runs as wildcard middleware (`/v1/admin/*`, `/v1/client/*`, `/v1/auth/*`) and
 * every protected route checks the principal again (`requirePermission` / `principalOf`). These
 * tests sweep EVERY registered route without credentials and with path variants from the 2026
 * Hono / @hono/node-server advisories (encoded line terminators, encoded slashes, backslashes,
 * double slashes, case). A database is never reached: the test app's db throws on use, so any
 * unauthenticated request that got past authorization would surface as a 500.
 */

/**
 * Endpoints that are intentionally reachable without a session — the credential (password,
 * refresh token, one-time activation token) travels in the validated JSON body, rate-limited.
 */
const PUBLIC = new Set([
  'POST /v1/auth/login',
  'POST /v1/auth/refresh',
  'POST /v1/auth/logout',
  'POST /v1/auth/activate',
  'POST /v1/auth/activation/check',
]);

const UUID = '00000000-0000-4000-8000-000000000001';

type Route = { method: string; path: string };

function protectedRoutes(): Route[] {
  const app = buildTestApp();
  const seen = new Set<string>();
  const routes: Route[] = [];
  for (const r of app.routes) {
    if (r.method === 'ALL') continue; // middleware
    if (!/^\/v1\/(admin|client|auth)\//.test(r.path)) continue;
    const path = r.path.replace(/:[A-Za-z]+(\{[^}]*\})?/g, UUID);
    const key = `${r.method} ${path}`;
    if (seen.has(key) || PUBLIC.has(`${r.method} ${r.path}`)) continue;
    seen.add(key);
    routes.push({ method: r.method, path });
  }
  return routes;
}

const request = (path: string, method: string, headers: Record<string, string> = {}) =>
  buildTestApp().request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: '{}' }),
  });

describe('every protected route refuses requests without a valid session', () => {
  const routes = protectedRoutes();

  it('finds the protected API surface (admin, client, auth)', () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(routes.some((r) => r.path.startsWith('/v1/admin/training/'))).toBe(true);
    expect(routes.some((r) => r.path.startsWith('/v1/client/workouts'))).toBe(true);
  });

  it('no credentials → 401 on every route (never 2xx, never a database access)', async () => {
    const failures: string[] = [];
    for (const r of routes) {
      const res = await request(r.path, r.method);
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('an invalid bearer token is treated exactly like none', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((_, i) => i % 5 === 0)) {
      const res = await request(r.path, r.method, { authorization: 'Bearer not-a-real-token' });
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('a development auth header is ignored when DEV_AUTH is not wired', async () => {
    const res = await request('/v1/admin/clients', 'GET', { 'x-vitruv-dev-auth': 'guess' });
    expect(res.status).toBe(401);
  });
});

describe('path spelling never bypasses authorization', () => {
  const targets = [
    '/v1/admin/clients',
    '/v1/admin/training/templates',
    `/v1/admin/training/clients/${UUID}/workouts`,
    '/v1/client/workouts',
    '/v1/admin/media',
  ];
  const variants = (p: string) => [
    `${p}%0A`,
    `${p}%0D`,
    `${p}%0D%0A`,
    `${p}%E2%80%A8`,
    `${p}/`,
    p.replace('/v1/admin/', '/v1/admin%2F').replace('/v1/client/', '/v1/client%2F'),
    p.replace('/v1/', '/v1//'),
    p.replace('/v1/', '//v1/'),
    p.toUpperCase(),
    p.replace('/v1/', '/v1/./'),
    p.replace('/v1/', '/v1/x/../'),
    p.replace('/v1/admin', '/v1/%61dmin').replace('/v1/client', '/v1/%63lient'),
  ];

  for (const target of targets) {
    it(`${target}: every variant is 401 or 404, never data`, async () => {
      const results: string[] = [];
      for (const v of variants(target)) {
        const res = await request(v, 'GET');
        if (res.status !== 401 && res.status !== 404) results.push(`${v} → ${res.status}`);
      }
      expect(results).toEqual([]);
    });
  }
});

describe('@hono/node-server: backslashes are not path separators (GHSA-jpvv-r467-5p4w)', () => {
  let server: ReturnType<typeof serve>;
  let port = 0;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = serve({ fetch: buildTestApp().fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        port = (info as AddressInfo).port;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Raw HTTP/1.1 — fetch() would normalise the backslash before sending. */
  const raw = (target: string) =>
    new Promise<number>((resolve, reject) => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk.toString()));
      socket.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
      socket.on('error', reject);
    });

  it('a real server answers the normal path with 401 and backslash spellings with 404/401/400', async () => {
    expect(await raw('/v1/admin/clients')).toBe(401);
    for (const target of [
      '/v1\\admin\\clients',
      '/v1/admin\\clients',
      '/v1%5Cadmin%5Cclients',
      '/health\\..\\v1\\admin\\clients',
    ]) {
      const status = await raw(target);
      expect([400, 401, 404], `${target} → ${status}`).toContain(status);
    }
  });

  it('the public health endpoint stays reachable', async () => {
    expect(await raw('/health')).toBe(200);
  });
});
