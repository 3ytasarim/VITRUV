/**
 * Sprint 8B — mobile app version policy (shared by API and tests; the Flutter app mirrors the
 * header names in `lib/core/config/app_version.dart`).
 *
 * The app sends its marketing version (`1.0.0`, from pubspec) and platform on every request.
 * The operator may configure a minimum supported version per platform; nothing is enforced while
 * it is unset (the default — production behaviour unchanged).
 */
export const APP_VERSION_HEADER = 'X-Vitruv-App-Version';
export const APP_PLATFORM_HEADER = 'X-Vitruv-App-Platform';

export const APP_PLATFORMS = ['ios', 'android'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** What to do with a MOBILE session that sends no version header (app builds before Sprint 8B). */
export const LEGACY_APP_POLICIES = ['allow', 'update_required'] as const;
export type LegacyAppPolicy = (typeof LEGACY_APP_POLICIES)[number];

export const APP_COMPATIBILITY_STATUSES = ['SUPPORTED', 'UPDATE_REQUIRED', 'UNKNOWN'] as const;
export type AppCompatibilityStatus = (typeof APP_COMPATIBILITY_STATUSES)[number];

export type AppVersion = readonly [major: number, minor: number, patch: number];

/** Strict `MAJOR.MINOR.PATCH` (each 0–9999, no leading zeros, no pre-release/build suffix). */
const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

export function parseAppVersion(value: string | null | undefined): AppVersion | null {
  if (typeof value !== 'string') return null;
  const match = VERSION.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function parseAppPlatform(value: string | null | undefined): AppPlatform | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (APP_PLATFORMS as readonly string[]).includes(v) ? (v as AppPlatform) : null;
}

export interface AppVersionPolicy {
  /** Minimum supported version per platform; absent = not enforced for that platform. */
  minimum: Partial<Record<AppPlatform, AppVersion>>;
  legacy: LegacyAppPolicy;
}

export interface AppCompatibilityVerdict {
  status: AppCompatibilityStatus;
  platform: AppPlatform | null;
  version: string | null;
  minimumVersion: string | null;
}

export const formatAppVersion = (v: AppVersion) => v.join('.');

/**
 * Pure decision. `legacyHeaderless` = the caller is known to be a mobile app (MOBILE session) but
 * sent no version header. Unknown platform with a version → the strictest configured minimum.
 */
export function evaluateAppCompatibility(
  policy: AppVersionPolicy,
  input: { version?: string | null; platform?: string | null; legacyHeaderless?: boolean },
): AppCompatibilityVerdict {
  const platform = parseAppPlatform(input.platform);
  const configured = platform
    ? policy.minimum[platform]
    : Object.values(policy.minimum).reduce<AppVersion | undefined>(
        (max, v) => (v && (!max || compareAppVersions(v, max) > 0) ? v : max),
        undefined,
      );
  const minimumVersion = configured ? formatAppVersion(configured) : null;
  const rawVersion = typeof input.version === 'string' ? input.version.trim() : '';
  const version = parseAppVersion(rawVersion);
  if (!version) {
    if (
      input.legacyHeaderless &&
      !rawVersion &&
      configured &&
      policy.legacy === 'update_required'
    ) {
      return { status: 'UPDATE_REQUIRED', platform, version: null, minimumVersion };
    }
    // Malformed or absent: never block on what we can not read (old builds keep working).
    return { status: 'UNKNOWN', platform, version: null, minimumVersion };
  }
  if (configured && compareAppVersions(version, configured) < 0) {
    return {
      status: 'UPDATE_REQUIRED',
      platform,
      version: formatAppVersion(version),
      minimumVersion,
    };
  }
  return { status: 'SUPPORTED', platform, version: formatAppVersion(version), minimumVersion };
}
