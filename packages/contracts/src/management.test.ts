import { describe, expect, it } from 'vitest';
import {
  adminClientListItemSchema,
  clientSelfProfileSchema,
  createClientRequestSchema,
  createCoachRequestSchema,
  issuedActivationSchema,
  updateClientRequestSchema,
} from './management';

describe('management contracts', () => {
  it('never accept a role: create bodies drop it, update bodies reject unknown keys', () => {
    const created = createClientRequestSchema.parse({
      firstName: ' Erika ',
      lastName: 'Muster',
      email: ' Erika@Example.DE ',
      password: 'ein langes Passwort',
      role: 'ADMIN',
    });
    expect(created).not.toHaveProperty('role');
    expect(created).toMatchObject({
      firstName: 'Erika',
      email: 'erika@example.de',
      coachingStatus: 'ACTIVE',
    });
    expect(
      createCoachRequestSchema.parse({ displayName: 'C', email: 'c@x.de', role: 'ADMIN' }),
    ).not.toHaveProperty('role');
    expect(updateClientRequestSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(updateClientRequestSchema.safeParse({ email: 'neu@x.de' }).success).toBe(false);
    expect(updateClientRequestSchema.safeParse({}).success).toBe(false);
  });

  it('creates clients with a password; e-mail and username optional, username normalised', () => {
    const minimal = createClientRequestSchema.parse({
      firstName: 'Rauf Onur',
      lastName: 'Cullu',
      password: 'ein langes Passwort',
    });
    expect(minimal).not.toHaveProperty('email');
    expect(createClientRequestSchema.parse({ ...minimal, username: ' RaufOnur.C ' }).username).toBe(
      'raufonur.c',
    );
    expect(createClientRequestSchema.safeParse({ ...minimal, username: 'ab' }).success).toBe(false);
    expect(createClientRequestSchema.safeParse({ ...minimal, password: 'kurz' }).success).toBe(
      false,
    );
    const { password: _omit, ...withoutPassword } = minimal;
    expect(createClientRequestSchema.safeParse(withoutPassword).success).toBe(false);
  });

  it('normalises optional text: empty phone/notes become null, notes are plain text with a limit', () => {
    expect(updateClientRequestSchema.parse({ phone: '', internalNotes: '  ' })).toEqual({
      phone: null,
      internalNotes: null,
    });
    expect(updateClientRequestSchema.safeParse({ internalNotes: 'x'.repeat(4001) }).success).toBe(
      false,
    );
    expect(
      updateClientRequestSchema.parse({ internalNotes: 'Zeile 1\nZeile 2' }).internalNotes,
    ).toBe('Zeile 1\nZeile 2');
    expect(updateClientRequestSchema.safeParse({ phone: '<script>' }).success).toBe(false);
  });

  it('keeps internal notes and account internals out of list items and the client self-profile', () => {
    expect(Object.keys(adminClientListItemSchema.shape)).not.toContain('internalNotes');
    const self = Object.keys(clientSelfProfileSchema.shape);
    for (const key of ['internalNotes', 'account', 'phone', 'assignments']) {
      expect(self).not.toContain(key);
    }
  });

  it('activation links point to the fixed web path and carry an opaque token only', () => {
    expect(
      issuedActivationSchema.safeParse({
        token: 'A'.repeat(43),
        expiresAt: '2030-01-01T00:00:00.000Z',
        path: '/aktivieren',
      }).success,
    ).toBe(true);
    expect(
      issuedActivationSchema.safeParse({
        token: 'A'.repeat(43),
        expiresAt: '2030-01-01T00:00:00.000Z',
        path: 'https://evil.example/aktivieren',
      }).success,
    ).toBe(false);
  });
});
