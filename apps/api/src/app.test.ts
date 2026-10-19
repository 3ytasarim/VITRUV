import { apiErrorSchema, dbHealthResponseSchema, healthResponseSchema } from '@vitruv/contracts';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/helpers';

describe('GET /health', () => {
  it('reports process health without touching the database', async () => {
    let pinged = false;
    const app = buildTestApp({
      pingDatabase: async () => {
        pinged = true;
      },
    });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json()).status).toBe('ok');
    expect(pinged).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /health/db', () => {
  it('returns ok with latency when the database answers', async () => {
    const res = await buildTestApp().request('/health/db');
    expect(res.status).toBe(200);
    expect(dbHealthResponseSchema.parse(await res.json())).toMatchObject({ status: 'ok' });
  });

  it('returns 503 without leaking driver details when the database fails', async () => {
    const app = buildTestApp({
      pingDatabase: async () => {
        throw Object.assign(
          new Error('connect ECONNREFUSED ep-secret-host.neon.tech user=owner password=hunter2'),
          { code: 'ECONNREFUSED' },
        );
      },
    });
    const res = await app.request('/health/db');
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: 'unavailable', database: 'unreachable' });
    expect(text).not.toMatch(/neon|hunter2|owner|ECONNREFUSED/);
  });

  it('times out a hanging database instead of hanging the request', async () => {
    const app = buildTestApp({ pingDatabase: () => new Promise(() => undefined) });
    const res = await app.request('/health/db');
    expect(res.status).toBe(503);
  });
});

describe('cross-cutting HTTP behaviour', () => {
  it('returns the standard error envelope with a request id for unknown routes', async () => {
    const res = await buildTestApp().request('/does-not-exist');
    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('sets secure headers', async () => {
    const res = await buildTestApp().request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('allows configured origins only', async () => {
    const app = buildTestApp();
    const allowed = await app.request('/health', { headers: { Origin: 'http://localhost:3000' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    const denied = await app.request('/health', { headers: { Origin: 'https://evil.example' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await buildTestApp().request('/health', {
      method: 'POST',
      body: 'x'.repeat(4096),
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status).toBe(413);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
