import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DbExecutor } from '@vitruv/db';
import { WEBSITE_MEDIA_MAX_BYTES, type UserRole } from '@vitruv/shared';
import { createApp, type AppDeps } from '../src/app';
import { anonymousResolver, type PrincipalResolver } from '../src/auth/authenticate';
import type { ObjectStorage } from '../src/infra/storage/object-storage';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import { createLogger } from '../src/lib/logger';
import { createRateLimiter } from '@vitruv/shared';
import type { AuthRateLimits } from '../src/modules/auth/auth.service';
import { createMediaUrlResolver } from '../src/modules/media/media-url';

export const silentLogger = createLogger({ level: 'silent' });

/** Fails loudly if a unit test reaches the database (DB behaviour is covered by *.int.test.ts). */
export const unusedDb = new Proxy(
  {},
  {
    get() {
      throw new Error('The database is not available in unit tests.');
    },
  },
) as DbExecutor;

export const testUrls = createMediaUrlResolver('http://localhost:4000/media');

/** A resolver that authenticates every request as the given fictional user/role. */
export function principalResolver(role: UserRole, userId: string): PrincipalResolver {
  return { name: 'test', resolve: async () => ({ userId, role }) };
}

/** Generous auth limits for tests that are not about rate limiting. */
export function testAuthLimits(overrides: Partial<AuthRateLimits> = {}): AuthRateLimits {
  const limiter = () => createRateLimiter({ limit: 1000, windowMs: 60_000 });
  return {
    loginPerIp: limiter(),
    loginFailuresPerIpAndEmail: limiter(),
    loginFailuresPerEmail: limiter(),
    passwordChangeFailuresPerUser: limiter(),
    activationPerIp: limiter(),
    ...overrides,
  };
}

export function buildTestApp(
  overrides: Partial<AppDeps> & {
    pingDatabase?: () => Promise<void>;
    db?: DbExecutor;
    storageDir?: string;
    storage?: ObjectStorage;
  } = {},
) {
  const {
    pingDatabase = async () => undefined,
    db = unusedDb,
    storageDir = join(tmpdir(), 'vitruv-api-unit-storage'),
    storage: injectedStorage,
    ...rest
  } = overrides;
  const storage = injectedStorage ?? createLocalStorage(storageDir);
  return createApp({
    logger: silentLogger,
    corsOrigins: ['http://localhost:3000'],
    bodyLimitBytes: 1024,
    health: { version: 'test', startedAt: Date.now(), pingDatabase, dbTimeoutMs: 200 },
    auth: anonymousResolver,
    sessions: { db, limits: testAuthLimits() },
    clientIp: () => '203.0.113.10',
    management: { db },
    training: { db, urls: testUrls },
    website: { db, urls: testUrls },
    media: { db, storage, urls: testUrls, limits: WEBSITE_MEDIA_MAX_BYTES },
    leads: {
      db,
      perEmail: createRateLimiter({ limit: 3, windowMs: 60_000 }),
      global: createRateLimiter({ limit: 30, windowMs: 60_000 }),
    },
    ...rest,
  });
}
