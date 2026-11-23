import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../../config/env';
import { appVersionDepsFromEnv } from './app-version';

describe('env (Sprint 8B minimum app version)', () => {
  const required = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  it('defaults enforce nothing', () => {
    const env = loadApiEnv(required);
    expect(env.MOBILE_MIN_VERSION_IOS).toBeUndefined();
    expect(env.MOBILE_MIN_VERSION_ANDROID).toBeUndefined();
    expect(env.MOBILE_LEGACY_APP_POLICY).toBe('allow');
    expect(appVersionDepsFromEnv(env)).toEqual({
      policy: { minimum: {}, legacy: 'allow' },
      updateUrls: {},
    });
  });

  it('accepts strict versions and https store links only', () => {
    const env = loadApiEnv({
      ...required,
      MOBILE_MIN_VERSION_IOS: '1.2.0',
      MOBILE_UPDATE_URL_IOS: 'https://apps.apple.com/app/id0000000000',
    });
    expect(appVersionDepsFromEnv(env).policy.minimum).toEqual({ ios: [1, 2, 0] });
    expect(() => loadApiEnv({ ...required, MOBILE_MIN_VERSION_IOS: '1.2' })).toThrow(
      /MOBILE_MIN_VERSION_IOS/,
    );
    expect(() => loadApiEnv({ ...required, MOBILE_MIN_VERSION_ANDROID: 'latest' })).toThrow(
      /MOBILE_MIN_VERSION_ANDROID/,
    );
    expect(() =>
      loadApiEnv({ ...required, MOBILE_UPDATE_URL_IOS: 'http://apps.apple.com/x' }),
    ).toThrow(/MOBILE_UPDATE_URL_IOS/);
    expect(() => loadApiEnv({ ...required, MOBILE_LEGACY_APP_POLICY: 'block' })).toThrow(
      /MOBILE_LEGACY_APP_POLICY/,
    );
  });
});
