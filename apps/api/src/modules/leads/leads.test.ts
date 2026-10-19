import { Writable } from 'node:stream';
import { apiErrorSchema } from '@vitruv/contracts';
import type { DbExecutor } from '@vitruv/db';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../test/helpers';
import { createRateLimiter } from '@vitruv/shared';
import { MIN_COMPLETION_MS } from './leads.service';

const NOW = 1_800_000_000_000;
const valid = {
  name: 'Erika Musterfrau',
  email: 'Erika.Muster@Example.com',
  phone: '+49 30 1234567',
  message: 'Ich möchte stärker werden. <script>alert(1)</script>',
  consent: true,
  website: '',
  startedAt: NOW - 60_000,
};

/** Minimal stand-in for the insert chain; records what would be stored. */
function fakeDb() {
  const rows: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          rows.push(row);
          return [{ id: `lead-${rows.length}`, createdAt: new Date(NOW) }];
        },
      }),
    }),
  } as unknown as DbExecutor;
  return { db, rows };
}

function setup(options: { perEmail?: number; global?: number } = {}) {
  const { db, rows } = fakeDb();
  const logs: string[] = [];
  const logger = pino(
    { level: 'info' },
    new Writable({
      write(chunk, _enc, done) {
        logs.push(String(chunk));
        done();
      },
    }),
  );
  const app = buildTestApp({
    logger,
    bodyLimitBytes: 1_048_576,
    leads: {
      db,
      perEmail: createRateLimiter({
        limit: options.perEmail ?? 3,
        windowMs: 60_000,
        now: () => NOW,
      }),
      global: createRateLimiter({ limit: options.global ?? 30, windowMs: 60_000, now: () => NOW }),
      now: () => NOW,
    },
  });
  const post = (body: unknown) =>
    app.request('/v1/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { post, rows, logs, app };
}

describe('POST /v1/public/leads', () => {
  it('stores a valid, normalised inquiry and answers without echoing data', async () => {
    const { post, rows } = setup();
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Erika Musterfrau',
      email: 'erika.muster@example.com',
      phone: '+49 30 1234567',
    });
    // Script-like input is kept verbatim as plain text (rendered as text, never as HTML).
    expect(rows[0]?.message).toBe(valid.message);
    expect(rows[0]?.consentAt).toEqual(new Date(NOW));
  });

  it.each([
    ['malformed e-mail', { email: 'keine-mail' }, 'email'],
    ['missing consent', { consent: false }, 'consent'],
    ['empty name', { name: '   ' }, 'name'],
    ['oversized message', { message: 'x'.repeat(2001) }, 'message'],
    ['letters in phone', { phone: 'call me' }, 'phone'],
    ['control characters', { name: 'a\u0000b' }, 'name'],
  ])('rejects %s', async (_label, patch, path) => {
    const { post, rows } = setup();
    const res = await post({ ...valid, ...patch });
    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.details?.map((d) => d.path)).toContain(path);
    expect(JSON.stringify(body)).not.toContain('keine-mail'); // values are never echoed
    expect(rows).toHaveLength(0);
  });

  it('rejects oversized request bodies', async () => {
    const { post } = setup();
    expect((await post({ ...valid, message: 'x'.repeat(20_000) })).status).toBe(413);
  });

  it('silently discards honeypot and implausibly fast submissions', async () => {
    const { post, rows } = setup();
    expect((await post({ ...valid, website: 'https://spam.example' })).status).toBe(201);
    expect((await post({ ...valid, startedAt: NOW - (MIN_COMPLETION_MS - 500) })).status).toBe(201);
    expect(rows).toHaveLength(0);
  });

  it('rate-limits repeated inquiries per e-mail address', async () => {
    const { post, rows } = setup({ perEmail: 2 });
    expect((await post(valid)).status).toBe(201);
    expect((await post({ ...valid, email: 'ERIKA.muster@example.com' })).status).toBe(201);
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(apiErrorSchema.parse(await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(rows).toHaveLength(2);
    expect((await post({ ...valid, email: 'andere@example.com' })).status).toBe(201);
  });

  it('applies a process-wide safety limit', async () => {
    const { post } = setup({ global: 1 });
    expect((await post(valid)).status).toBe(201);
    expect((await post({ ...valid, email: 'zwei@example.com' })).status).toBe(429);
  });

  it('never logs personal data', async () => {
    const { post, logs } = setup();
    await post(valid);
    await post({ ...valid, email: 'kaputt' });
    const output = logs.join('\n');
    expect(output).toContain('website lead stored');
    for (const pii of ['Erika', 'example.com', '1234567', 'stärker'])
      expect(output).not.toContain(pii);
  });

  it('offers no way to read leads publicly', async () => {
    const { app } = setup();
    expect((await app.request('/v1/public/leads')).status).toBe(404);
    expect((await app.request('/v1/public/leads/lead-1')).status).toBe(404);
  });
});

describe('createRateLimiter', () => {
  it('opens a new window after windowMs', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);
    now = 1000;
    expect(limiter.hit('a')).toBe(true);
  });
});
