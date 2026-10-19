import { describe, expect, it } from 'vitest';
import { apiErrorSchema, dbHealthResponseSchema, mediaSlotSchema } from './index';

const uuid = '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f';

describe('contracts', () => {
  it('db health failure shape carries no connection details', () => {
    const parsed = dbHealthResponseSchema.parse({
      status: 'unavailable',
      database: 'unreachable',
      host: 'should-be-stripped.example',
    });
    expect(parsed).toEqual({ status: 'unavailable', database: 'unreachable' });
  });

  it('media slot requires a desktop asset and allows an optional mobile variant', () => {
    expect(mediaSlotSchema.safeParse({ desktop: { assetId: uuid } }).success).toBe(true);
    expect(mediaSlotSchema.safeParse({ mobile: { assetId: uuid } }).success).toBe(false);
    expect(
      mediaSlotSchema.safeParse({ desktop: { assetId: uuid, focalPoint: { x: 2, y: 0 } } }).success,
    ).toBe(false);
  });

  it('error envelope only accepts known codes', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(
      true,
    );
    expect(apiErrorSchema.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(
      false,
    );
  });
});
