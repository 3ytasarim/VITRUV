import { createHash, timingSafeEqual } from 'node:crypto';
import { isUserRole } from '@vitruv/shared';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';
import type { Principal } from './principal';

/**
 * Turns request credentials into a verified Principal (or null = anonymous).
 *
 * Production: `createSessionResolver` (Bearer access token → auth_sessions → users). In local
 * development the isolated dev adapter below may be chained after it. Handlers never see how the
 * principal was established — they only call `requirePermission(...)`.
 */
export interface PrincipalResolver {
  readonly name: string;
  resolve(c: Context<AppEnv>): Promise<Principal | null>;
}

export const anonymousResolver: PrincipalResolver = {
  name: 'anonymous',
  resolve: async () => null,
};

/** Extracts `Authorization: Bearer <token>` (opaque base64url token) or null. */
export function bearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('authorization');
  const match = header ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header.trim()) : null;
  return match?.[1] ?? null;
}

/**
 * Production resolver: the access token is looked up by its hash; the session must be unrevoked
 * and unexpired and the user ACTIVE. Role comes from the users row on every request, so role
 * changes and account disabling take effect immediately. The API never reads cookies — browsers
 * can not attach this credential on their own, which keeps the API itself free of CSRF.
 */
export function createSessionResolver(
  resolveAccessToken: (token: string) => Promise<Principal | null>,
): PrincipalResolver {
  return {
    name: 'session',
    async resolve(c) {
      const token = bearerToken(c);
      return token ? resolveAccessToken(token) : null;
    },
  };
}

/** First resolver that yields a principal wins. */
export function chainResolvers(...resolvers: PrincipalResolver[]): PrincipalResolver {
  return {
    name: resolvers.map((r) => r.name).join('+'),
    async resolve(c) {
      for (const resolver of resolvers) {
        const principal = await resolver.resolve(c);
        if (principal) return principal;
      }
      return null;
    },
  };
}

/** Sets `principal` on the request when the resolver verifies the caller. */
export function authenticate(resolver: PrincipalResolver) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const principal = await resolver.resolve(c);
    if (principal) c.set('principal', principal);
    await next();
  });
}

export const DEV_AUTH_HEADER = 'x-vitruv-dev-auth';

export interface DevUserRecord {
  id: string;
  role: string;
  status: string;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * DEVELOPMENT ONLY (DEV_AUTH=enabled; env validation refuses it in production, and server.ts
 * never wires it when NODE_ENV=production).
 *
 * A request presenting the shared secret in `x-vitruv-dev-auth` acts as the existing users row
 * with DEV_AUTH_EMAIL. The role comes from the database, not from the request. It remains for
 * local scripted API tooling (E2E fixtures); the web Admin uses real sessions since Sprint 4.
 * It yields no session, so session-bound actions (password change) are refused for it.
 */
export function createDevPrincipalResolver(options: {
  token: string;
  email: string;
  loadUser: (email: string) => Promise<DevUserRecord | null>;
  cacheMs?: number;
}): PrincipalResolver {
  const expected = digest(options.token);
  let cached: { at: number; principal: Principal | null } | undefined;

  const loadPrincipal = async (): Promise<Principal | null> => {
    const now = Date.now();
    if (cached && now - cached.at < (options.cacheMs ?? 30_000)) return cached.principal;
    const user = await options.loadUser(options.email);
    const principal =
      user && user.status === 'ACTIVE' && isUserRole(user.role)
        ? { userId: user.id, role: user.role }
        : null;
    cached = { at: now, principal };
    return principal;
  };

  return {
    name: 'development',
    async resolve(c) {
      const presented = c.req.header(DEV_AUTH_HEADER);
      if (!presented) return null;
      // Constant-time comparison of fixed-length digests.
      if (!timingSafeEqual(digest(presented), expected)) return null;
      return loadPrincipal();
    },
  };
}
