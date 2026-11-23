import { describe, expect, it } from 'vitest';
import {
  compareAppVersions,
  evaluateAppCompatibility,
  parseAppPlatform,
  parseAppVersion,
  type AppVersionPolicy,
} from './app-version';

describe('app version parsing and comparison', () => {
  it('accepts strict MAJOR.MINOR.PATCH only', () => {
    expect(parseAppVersion('1.0.0')).toEqual([1, 0, 0]);
    expect(parseAppVersion(' 2.10.3 ')).toEqual([2, 10, 3]);
    for (const bad of [
      '',
      '1',
      '1.0',
      '1.0.0.0',
      '01.0.0',
      '1.0.0-beta',
      '1.0.0+5',
      'v1.0.0',
      'x',
    ]) {
      expect(parseAppVersion(bad), bad).toBeNull();
    }
    expect(parseAppVersion(undefined)).toBeNull();
  });

  it('compares numerically, not lexically', () => {
    const v = (s: string) => parseAppVersion(s) ?? [0, 0, 0];
    expect(compareAppVersions(v('1.10.0'), v('1.9.0'))).toBeGreaterThan(0);
    expect(compareAppVersions(v('1.0.0'), v('1.0.1'))).toBeLessThan(0);
    expect(compareAppVersions(v('2.0.0'), v('2.0.0'))).toBe(0);
  });

  it('platforms are an allow-list', () => {
    expect(parseAppPlatform('iOS')).toBe('ios');
    expect(parseAppPlatform('android')).toBe('android');
    expect(parseAppPlatform('web')).toBeNull();
  });
});

describe('evaluateAppCompatibility', () => {
  const policy: AppVersionPolicy = {
    minimum: { ios: [1, 2, 0], android: [1, 1, 0] },
    legacy: 'allow',
  };

  it('nothing configured → never blocks', () => {
    const none: AppVersionPolicy = { minimum: {}, legacy: 'update_required' };
    expect(evaluateAppCompatibility(none, { version: '0.0.1', platform: 'ios' }).status).toBe(
      'SUPPORTED',
    );
    expect(evaluateAppCompatibility(none, { legacyHeaderless: true }).status).toBe('UNKNOWN');
  });

  it('below / at / above the platform minimum', () => {
    expect(evaluateAppCompatibility(policy, { version: '1.1.9', platform: 'ios' })).toEqual({
      status: 'UPDATE_REQUIRED',
      platform: 'ios',
      version: '1.1.9',
      minimumVersion: '1.2.0',
    });
    expect(evaluateAppCompatibility(policy, { version: '1.2.0', platform: 'ios' }).status).toBe(
      'SUPPORTED',
    );
    expect(evaluateAppCompatibility(policy, { version: '1.1.9', platform: 'android' }).status).toBe(
      'SUPPORTED',
    );
  });

  it('unknown platform uses the strictest configured minimum', () => {
    expect(evaluateAppCompatibility(policy, { version: '1.1.5' }).status).toBe('UPDATE_REQUIRED');
    expect(evaluateAppCompatibility(policy, { version: '1.1.5' }).minimumVersion).toBe('1.2.0');
  });

  it('malformed versions are never blocked (UNKNOWN)', () => {
    expect(evaluateAppCompatibility(policy, { version: 'abc', platform: 'ios' }).status).toBe(
      'UNKNOWN',
    );
  });

  it('header-less legacy apps: allowed by default, blocked only with legacy=update_required', () => {
    expect(evaluateAppCompatibility(policy, { legacyHeaderless: true }).status).toBe('UNKNOWN');
    expect(
      evaluateAppCompatibility({ ...policy, legacy: 'update_required' }, { legacyHeaderless: true })
        .status,
    ).toBe('UPDATE_REQUIRED');
    // a non-mobile caller (web) without the header is never treated as legacy
    expect(evaluateAppCompatibility({ ...policy, legacy: 'update_required' }, {}).status).toBe(
      'UNKNOWN',
    );
  });
});
