import type { AuthTokens } from '@vitruv/contracts';

/**
 * Browser side of the session (docs/AUTH-ARCHITECTURE.md → Browser flow).
 *
 * The web SERVER holds the API token pair for the Admin/Coach browser in two HttpOnly cookies.
 * JavaScript never sees them (no localStorage/sessionStorage); the server forwards the access
 * token to the API as a Bearer header.
 *
 *  - HttpOnly, Path=/ — never readable by scripts
 *  - Secure + `__Host-` prefix whenever the site runs on https or in production (the prefix pins
 *    the cookie to this exact host, no Domain attribute, no subdomain can overwrite it)
 *  - SameSite=Lax — sent on top-level navigation (deep links into /admin keep working), never on
 *    cross-site POST/fetch; mutations are additionally origin-checked (proxy + server actions)
 */
export interface AuthCookieConfig {
  secure: boolean;
  access: string;
  refresh: string;
}

export function authCookieConfig(env: {
  NODE_ENV?: string;
  PUBLIC_SITE_URL?: string;
}): AuthCookieConfig {
  const secure =
    env.NODE_ENV === 'production' || (env.PUBLIC_SITE_URL ?? '').startsWith('https://');
  const prefix = secure ? '__Host-' : '';
  return { secure, access: `${prefix}vitruv_at`, refresh: `${prefix}vitruv_rt` };
}

/** The access cookie ends slightly before the token so the server never sends an expired one. */
const ACCESS_COOKIE_SKEW_MS = 30_000;

export interface CookieWrite {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    expires: Date;
  };
}

/** The two Set-Cookie writes for a token pair (login, refresh, password change). */
export function sessionCookieWrites(config: AuthCookieConfig, tokens: AuthTokens): CookieWrite[] {
  const base = { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' } as const;
  return [
    {
      name: config.access,
      value: tokens.accessToken,
      options: {
        ...base,
        expires: new Date(Date.parse(tokens.accessTokenExpiresAt) - ACCESS_COOKIE_SKEW_MS),
      },
    },
    {
      name: config.refresh,
      value: tokens.refreshToken,
      options: { ...base, expires: new Date(Date.parse(tokens.refreshTokenExpiresAt)) },
    },
  ];
}

/** Writes that delete both cookies (logout, failed refresh). */
export function clearCookieWrites(config: AuthCookieConfig): CookieWrite[] {
  const base = { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' } as const;
  return [config.access, config.refresh].map((name) => ({
    name,
    value: '',
    options: { ...base, expires: new Date(0) },
  }));
}

/**
 * Where to go after login. Only same-site admin paths are accepted — never absolute URLs,
 * protocol-relative `//host` or backslash tricks (open-redirect protection).
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return '/admin';
  if (!/^\/admin(?:[/?#]|$)/.test(value)) return '/admin';
  if (value.includes('\\') || value.includes('//') || /[\u0000-\u001F]/.test(value)) {
    return '/admin';
  }
  return value;
}

/** The client area ("Mein Training") — CLIENT accounts only; never part of the admin panel. */
export const PORTAL_PATH = '/mein-training';

/** Like safeNextPath, for the client area: only own /mein-training paths, else its start page. */
export function safePortalPath(value: unknown): string {
  return isPortalPath(value) ? value : PORTAL_PATH;
}

function isPortalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\/mein-training(?:[/?#]|$)/.test(value) &&
    !value.includes('\\') &&
    !value.includes('//') &&
    !/[\u0000-\u001F]/.test(value)
  );
}

/** Where the login form may send someone back to (the role decides after the login). */
export function safeLoginNext(value: unknown): string {
  return isPortalPath(value) ? value : safeNextPath(value);
}

export function isProtectedPath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === PORTAL_PATH ||
    pathname.startsWith(`${PORTAL_PATH}/`)
  );
}
