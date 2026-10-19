import { describe, expect, it } from 'vitest';
import {
  authTokenSchema,
  changePasswordRequestSchema,
  currentUserSchema,
  loginRequestSchema,
  newPasswordSchema,
} from './auth';

describe('auth contracts', () => {
  it('normalises the login e-mail but never touches the password', () => {
    const parsed = loginRequestSchema.parse({
      email: ' Admin@Example.DE ',
      password: '  mit Rand  ',
      clientType: 'WEB',
    });
    expect(parsed.email).toBe('admin@example.de');
    expect(parsed.password).toBe('  mit Rand  ');
  });

  it('accepts a username instead of the e-mail (lowercased); rejects malformed names', () => {
    const ok = (email: string) =>
      loginRequestSchema.safeParse({ email, password: 'x', clientType: 'WEB' });
    expect(ok(' Admin ').data?.email).toBe('admin');
    expect(ok('coach.max-1').success).toBe(true);
    expect(ok('ab').success).toBe(false);
    expect(ok('a/b').success).toBe(false);
    expect(ok('kein@mail').success).toBe(false);
  });

  it('only knows the WEB and MOBILE client types', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.de', password: 'x', clientType: 'ADMIN' }).success,
    ).toBe(false);
  });

  it('new passwords: length only — spaces, Unicode and long passphrases allowed', () => {
    expect(newPasswordSchema.safeParse('kurz').success).toBe(false);
    expect(newPasswordSchema.safeParse('nurkleinbuchstaben').success).toBe(true);
    expect(newPasswordSchema.safeParse('vier wörter mit leerzeichen').success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(256)).success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(257)).success).toBe(false);
  });

  it('requires a different new password', () => {
    const same = changePasswordRequestSchema.safeParse({
      currentPassword: 'gleiches Passwort 1',
      newPassword: 'gleiches Passwort 1',
    });
    expect(same.success).toBe(false);
  });

  it('accepts only opaque 43-character tokens', () => {
    expect(authTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(authTokenSchema.safeParse('A'.repeat(42)).success).toBe(false);
    expect(authTokenSchema.safeParse(`${'A'.repeat(42)}=`).success).toBe(false);
  });

  it('the user shape has no room for secrets', () => {
    const keys = Object.keys(currentUserSchema.shape);
    expect(keys).toEqual(['id', 'email', 'displayName', 'role', 'status', 'permissions']);
    const parsed = currentUserSchema.parse({
      id: '00000000-0000-4000-8000-000000000000',
      email: 'a@b.de',
      displayName: null,
      role: 'ADMIN',
      status: 'ACTIVE',
      permissions: ['admin.access'],
      passwordHash: '$argon2id$…',
    });
    expect(parsed).not.toHaveProperty('passwordHash');
  });
});
