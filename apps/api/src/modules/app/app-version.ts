import type { AppCompatibility } from '@vitruv/contracts';
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  evaluateAppCompatibility,
  parseAppVersion,
  type AppPlatform,
  type AppVersionPolicy,
  type LegacyAppPolicy,
} from '@vitruv/shared';
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../../lib/errors';
import type { AppEnv } from '../../types';

/**
 * Sprint 8B — server-side minimum mobile app version.
 *
 *   GET /v1/app/compatibility   public: what would happen to this app build (update screen at start)
 *   /v1/client/*                MOBILE sessions below the minimum → 426 APP_UPDATE_REQUIRED
 *
 * Rules (docs/ios-training-sprint8b-implementation.md §Minimum version):
 * - nothing configured → nothing enforced (production default, behaviour unchanged);
 * - only sessions created by the app (`clientType = MOBILE`) are checked — the web client area
 *   never sends the header and is never blocked;
 * - auth routes (/v1/auth/*: login, refresh, logout, me) are NOT checked: nobody is logged out,
 *   tokens stay valid, the app shows an update screen and works again after the update;
 * - header-less MOBILE sessions (app builds before 8B) are allowed unless the operator sets
 *   MOBILE_LEGACY_APP_POLICY=update_required (those builds show their generic error state);
 * - malformed versions are never blocked.
 */
export interface AppVersionDeps {
  policy: AppVersionPolicy;
  updateUrls: Partial<Record<AppPlatform, string>>;
}

export function appVersionDepsFromEnv(env: {
  MOBILE_MIN_VERSION_IOS?: string;
  MOBILE_MIN_VERSION_ANDROID?: string;
  MOBILE_LEGACY_APP_POLICY: LegacyAppPolicy;
  MOBILE_UPDATE_URL_IOS?: string;
  MOBILE_UPDATE_URL_ANDROID?: string;
}): AppVersionDeps {
  const ios = parseAppVersion(env.MOBILE_MIN_VERSION_IOS);
  const android = parseAppVersion(env.MOBILE_MIN_VERSION_ANDROID);
  return {
    policy: {
      minimum: { ...(ios ? { ios } : {}), ...(android ? { android } : {}) },
      legacy: env.MOBILE_LEGACY_APP_POLICY,
    },
    updateUrls: {
      ...(env.MOBILE_UPDATE_URL_IOS ? { ios: env.MOBILE_UPDATE_URL_IOS } : {}),
      ...(env.MOBILE_UPDATE_URL_ANDROID ? { android: env.MOBILE_UPDATE_URL_ANDROID } : {}),
    },
  };
}

function verdictFor(deps: AppVersionDeps, c: Context<AppEnv>, legacyHeaderless: boolean) {
  const verdict = evaluateAppCompatibility(deps.policy, {
    version: c.req.header(APP_VERSION_HEADER),
    platform: c.req.header(APP_PLATFORM_HEADER),
    legacyHeaderless,
  });
  const result: AppCompatibility = {
    ...verdict,
    updateUrl: (verdict.platform && deps.updateUrls[verdict.platform]) ?? null,
  };
  return result;
}

export function appCompatibilityRoutes(deps: AppVersionDeps) {
  const routes = new Hono<AppEnv>();
  routes.get('/', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(verdictFor(deps, c, false));
  });
  return routes;
}

/** Mounted on /v1/client/* after authenticate. */
export function requireSupportedApp(deps: AppVersionDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const principal = c.get('principal');
    const mobile = principal?.clientType === 'MOBILE';
    const hasHeader = Boolean(c.req.header(APP_VERSION_HEADER));
    // Unauthenticated calls (→ 401 from the route) and web sessions are never version-gated.
    if (principal && (mobile || (hasHeader && principal.clientType !== 'WEB'))) {
      const verdict = verdictFor(deps, c, mobile && !hasHeader);
      if (verdict.status === 'UPDATE_REQUIRED') {
        throw new AppError(
          426,
          'APP_UPDATE_REQUIRED',
          'Bitte aktualisiere die VITRUV App, um fortzufahren.',
          // same convention as sessionId on WORKOUT_IN_PROGRESS: path = key, message = value
          [
            { path: 'minimumVersion', message: verdict.minimumVersion ?? '' },
            ...(verdict.updateUrl ? [{ path: 'updateUrl', message: verdict.updateUrl }] : []),
          ],
        );
      }
    }
    await next();
  });
}
