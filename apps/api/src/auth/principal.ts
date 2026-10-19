import { roleHasPermission, type Permission, type UserRole } from '@vitruv/shared';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';
import { AppError } from '../lib/errors';

/**
 * The authenticated actor of a request.
 *
 * It is ONLY ever set by the server-side authentication middleware after verifying an access
 * token (or, in development, the dev adapter) and loading the role from the database. Role or
 * user IDs sent by a client (headers, body, query) are never trusted.
 */
export interface Principal {
  userId: string;
  role: UserRole;
  /** The verified session (absent for the development adapter). */
  sessionId?: string;
}

/** Guards a route by permission. Without an authenticated principal the request is rejected. */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const principal = c.get('principal');
    if (!principal) throw AppError.unauthenticated();
    if (!roleHasPermission(principal.role, permission)) throw AppError.forbidden();
    await next();
  });
}
