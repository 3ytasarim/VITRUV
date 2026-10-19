import { describe, expect, it } from 'vitest';
import { isUserRole, PERMISSIONS, roleHasPermission, USER_ROLES } from './roles';
import { executionModeOf } from './workout';

describe('roles', () => {
  it('defines exactly the three platform roles', () => {
    expect(USER_ROLES).toEqual(['ADMIN', 'COACH', 'CLIENT']);
  });

  it('rejects unknown or differently-cased role strings', () => {
    expect(isUserRole('COACH')).toBe(true);
    expect(isUserRole('coach')).toBe(false);
    expect(isUserRole('SUPERADMIN')).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });

  it('keeps clients away from CMS and management permissions', () => {
    expect(roleHasPermission('CLIENT', 'self:read')).toBe(true);
    expect(roleHasPermission('CLIENT', 'website.content.write')).toBe(false);
    expect(roleHasPermission('CLIENT', 'website.media.write')).toBe(false);
    expect(roleHasPermission('CLIENT', 'clients.read')).toBe(false);
  });

  it('reserves the Website CMS for ADMIN — coaches have no website permission at all', () => {
    const website = PERMISSIONS.filter((permission) => permission.startsWith('website.'));
    expect(website).toHaveLength(6);
    for (const permission of website) {
      expect(roleHasPermission('ADMIN', permission)).toBe(true);
      expect(roleHasPermission('COACH', permission)).toBe(false);
      expect(roleHasPermission('CLIENT', permission)).toBe(false);
    }
  });

  it('reserves coach management and reassignment for admins', () => {
    for (const permission of [
      'coaches.read',
      'coaches.create',
      'coaches.update',
      'coaches.account.manage',
      'clients.assign',
    ] as const) {
      expect(roleHasPermission('ADMIN', permission)).toBe(true);
      expect(roleHasPermission('COACH', permission)).toBe(false);
      expect(roleHasPermission('CLIENT', permission)).toBe(false);
    }
  });

  it('lets coaches manage (their own) clients but never reassign them', () => {
    for (const permission of [
      'clients.read',
      'clients.create',
      'clients.update',
      'clients.account.manage',
    ] as const) {
      expect(roleHasPermission('COACH', permission)).toBe(true);
      expect(roleHasPermission('CLIENT', permission)).toBe(false);
    }
  });

  it('training: ADMIN + COACH manage (COACH scoped server-side), only ADMIN deletes media, CLIENT reads its own plan', () => {
    for (const permission of [
      'training.exercises.read',
      'training.exercises.write',
      'training.programs.read',
      'training.programs.create',
      'training.programs.update',
      'training.programs.activate',
    ] as const) {
      expect(roleHasPermission('ADMIN', permission)).toBe(true);
      expect(roleHasPermission('COACH', permission)).toBe(true);
      expect(roleHasPermission('CLIENT', permission)).toBe(false);
    }
    expect(roleHasPermission('ADMIN', 'training.media.delete')).toBe(true);
    expect(roleHasPermission('COACH', 'training.media.delete')).toBe(false);
    expect(roleHasPermission('CLIENT', 'training.self.read')).toBe(true);
    expect(roleHasPermission('COACH', 'training.self.read')).toBe(false);
    // permanent rule: COACH never regains Website CMS permissions
    expect(
      PERMISSIONS.filter((p) => p.startsWith('website.') && roleHasPermission('COACH', p)),
    ).toEqual([]);
  });

  it('workouts: CLIENT records only its own (self), COACH/ADMIN read session summaries', () => {
    expect(roleHasPermission('CLIENT', 'training.self.workout')).toBe(true);
    expect(roleHasPermission('COACH', 'training.self.workout')).toBe(false);
    expect(roleHasPermission('CLIENT', 'training.sessions.read')).toBe(false);
    expect(roleHasPermission('COACH', 'training.sessions.read')).toBe(true);
    expect(roleHasPermission('ADMIN', 'training.sessions.read')).toBe(true);
    expect(roleHasPermission('CLIENT', 'admin.access')).toBe(false);
  });
});

describe('nutrition permissions', () => {
  it('ADMIN + COACH manage documents (COACH scoped server-side); CLIENT reads only its own', () => {
    for (const permission of [
      'nutrition.documents.read',
      'nutrition.documents.write',
      'nutrition.documents.assign',
    ] as const) {
      expect(roleHasPermission('ADMIN', permission)).toBe(true);
      expect(roleHasPermission('COACH', permission)).toBe(true);
      expect(roleHasPermission('CLIENT', permission)).toBe(false);
    }
    expect(roleHasPermission('CLIENT', 'nutrition.self.read')).toBe(true);
    expect(roleHasPermission('COACH', 'nutrition.self.read')).toBe(false);
    expect(
      PERMISSIONS.filter((p) => p.startsWith('website.') && roleHasPermission('COACH', p)),
    ).toEqual([]);
  });
});

describe('executionModeOf', () => {
  const none = { sets: null, reps: null, totalReps: null, durationSeconds: null };
  it('derives the mode from structured fields only (never free text)', () => {
    expect(executionModeOf({ ...none, sets: 4, reps: 12 })).toBe('SETS_REPS');
    expect(executionModeOf({ ...none, reps: 12 })).toBe('SETS_REPS');
    expect(executionModeOf({ ...none, sets: 3, durationSeconds: 30 })).toBe('SETS_REPS');
    expect(executionModeOf({ ...none, totalReps: 70 })).toBe('TOTAL_REPS');
    expect(executionModeOf({ ...none, durationSeconds: 45 })).toBe('DURATION');
    expect(executionModeOf(none)).toBe('CUSTOM');
  });
});
