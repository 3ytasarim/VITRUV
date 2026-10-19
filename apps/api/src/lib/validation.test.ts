import { apiErrorSchema } from '@vitruv/contracts';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, errorBody } from './errors';
import { validate } from './validation';

const app = new Hono()
  .post('/items', validate('json', z.object({ name: z.string().min(2) })), (c) =>
    c.json({ name: c.req.valid('json').name }),
  )
  .onError((error, c) =>
    error instanceof AppError
      ? c.json(errorBody(error.code, error.message, undefined, error.details), error.status)
      : c.text('unexpected', 500),
  );

const post = (body: unknown) =>
  app.request('/items', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('validate', () => {
  it('passes typed, validated input to the handler', async () => {
    const res = await post({ name: 'Kraft' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Kraft' });
  });

  it('returns VALIDATION_FAILED with field details', async () => {
    const res = await post({ name: 'x' });
    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.[0]?.path).toBe('name');
  });
});
