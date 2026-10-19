import { schema, type DbExecutor } from '@vitruv/db';
import { normalizeEmail } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import type { ApiEnv } from '../config/env';
import type { Logger } from '../lib/logger';
import { resolveAccessToken } from '../modules/auth/auth.service';
import {
  chainResolvers,
  createDevPrincipalResolver,
  createSessionResolver,
  type PrincipalResolver,
} from './authenticate';

/**
 * Real sessions always; the development adapter is chained after them only when explicitly
 * enabled outside production (env validation already refuses DEV_AUTH in production — this is
 * the second, independent guard).
 */
export function createAuthResolver(env: ApiEnv, db: DbExecutor, logger: Logger): PrincipalResolver {
  const sessions = createSessionResolver((token) => resolveAccessToken({ db }, token));
  if (
    env.NODE_ENV === 'production' ||
    env.DEV_AUTH !== 'enabled' ||
    !env.DEV_AUTH_TOKEN ||
    !env.DEV_AUTH_EMAIL
  ) {
    return sessions;
  }
  logger.warn(
    'DEV_AUTH is enabled: API routes also accept the development token. Never use outside local development.',
  );
  const development = createDevPrincipalResolver({
    token: env.DEV_AUTH_TOKEN,
    email: env.DEV_AUTH_EMAIL,
    loadUser: async (email) => {
      const [user] = await db
        .select({ id: schema.users.id, role: schema.users.role, status: schema.users.status })
        .from(schema.users)
        .where(eq(sql`lower(${schema.users.email})`, normalizeEmail(email)));
      return user ?? null;
    },
  });
  return chainResolvers(sessions, development);
}
