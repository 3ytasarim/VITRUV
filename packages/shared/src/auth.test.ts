import { describe, expect, it } from 'vitest';
import { normalizeEmail, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth';
import { createRateLimiter } from './rate-limit';
import { roleHasPermission } from './roles';

describe('auth vocabulary', () => {
  it('normalises e-mails by trimming and lowercasing only (no alias rules)', () => {
    expect(normalizeEmail('  Max.Muster+Test@Example.DE ')).toBe('max.muster+test@example.de');
  });

  it('uses a length-only password policy with a sane maximum', () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
    expect(PASSWORD_MAX_LENGTH).toBeGreaterThanOrEqual(128);
  });

  it('grants panel access to ADMIN and COACH, never to CLIENT', () => {
    expect(roleHasPermission('ADMIN', 'admin.access')).toBe(true);
    expect(roleHasPermission('COACH', 'admin.access')).toBe(true);
    expect(roleHasPermission('CLIENT', 'admin.access')).toBe(false);
  });
});

describe('rate limiter isLimited()', () => {
  it('reports exhaustion without counting, and resets after the window', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect(limiter.isLimited('k')).toBe(false);
    limiter.hit('k');
    expect(limiter.isLimited('k')).toBe(false);
    limiter.hit('k');
    expect(limiter.isLimited('k')).toBe(true);
    expect(limiter.isLimited('other')).toBe(false);
    now = 1000;
    expect(limiter.isLimited('k')).toBe(false);
  });
});
