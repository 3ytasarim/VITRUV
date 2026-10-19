import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blankToUndefined, EnvValidationError, parseEnv } from './env';

const schema = z.object({ SECRET_URL: z.url(), PORT: z.coerce.number().default(4000) });

describe('parseEnv', () => {
  it('returns parsed values with defaults', () => {
    expect(parseEnv(schema, { SECRET_URL: 'https://example.test' })).toEqual({
      SECRET_URL: 'https://example.test',
      PORT: 4000,
    });
  });

  it('names the variable but never echoes its value', () => {
    const secret = 'not-a-url-but-very-secret';
    let caught: unknown;
    try {
      parseEnv(schema, { SECRET_URL: secret });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as Error).message).toContain('SECRET_URL');
    expect((caught as Error).message).not.toContain(secret);
  });

  it('treats blank values as unset', () => {
    expect(blankToUndefined({ A: '', B: 'x' })).toEqual({ A: undefined, B: 'x' });
  });
});
