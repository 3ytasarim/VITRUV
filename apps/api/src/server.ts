import { serve } from '@hono/node-server';
import { createDatabase, describeDatabaseTarget } from '@vitruv/db';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { createAuthResolver } from './auth/resolver';
import { loadApiEnv } from './config/env';
import { createObjectStorage } from './infra/storage/index';
import { createClientIpResolver } from './lib/client-ip';
import { createLogger } from './lib/logger';
import { createRateLimiter } from '@vitruv/shared';
import { createMediaUrlResolver } from './modules/media/media-url';
import { createWebRevalidationHook } from './modules/website/revalidation';

const VERSION = process.env.npm_package_version ?? '0.0.0';

const MINUTE = 60_000;

function main() {
  const env = loadApiEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });

  const database = createDatabase(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  const urls = createMediaUrlResolver(
    env.PUBLIC_MEDIA_BASE_URL ?? `${env.API_PUBLIC_URL.replace(/\/+$/, '')}/media`,
  );
  logger.info(
    { database: describeDatabaseTarget(env.DATABASE_URL), storage: storage.driver },
    'dependencies configured',
  );

  // After a committed public change: expire the web app's cache tag (see revalidation.ts).
  const revalidateWeb =
    env.WEB_REVALIDATE_URL && env.REVALIDATE_SECRET
      ? createWebRevalidationHook({ url: env.WEB_REVALIDATE_URL, secret: env.REVALIDATE_SECRET })
      : undefined;

  const app = createApp({
    logger,
    corsOrigins: env.CORS_ORIGINS,
    bodyLimitBytes: env.API_BODY_LIMIT_BYTES,
    privateUrlTtlSeconds: env.PRIVATE_URL_TTL_SECONDS,
    health: { version: VERSION, startedAt: Date.now(), pingDatabase: database.ping },
    auth: createAuthResolver(env, database.db, logger),
    clientIp: createClientIpResolver(env.TRUSTED_PROXY_IPS),
    management: { db: database.db },
    training: { db: database.db, urls },
    sessions: {
      db: database.db,
      // Temporary brakes, never permanent lockouts (docs/AUTH-ARCHITECTURE.md → Rate limiting).
      limits: {
        loginPerIp: createRateLimiter({ limit: 30, windowMs: 15 * MINUTE }),
        loginFailuresPerIpAndEmail: createRateLimiter({ limit: 5, windowMs: 15 * MINUTE }),
        loginFailuresPerEmail: createRateLimiter({ limit: 20, windowMs: 60 * MINUTE }),
        passwordChangeFailuresPerUser: createRateLimiter({ limit: 5, windowMs: 15 * MINUTE }),
        activationPerIp: createRateLimiter({ limit: 20, windowMs: 15 * MINUTE }),
      },
    },
    website: {
      db: database.db,
      urls,
      onPublished: revalidateWeb,
    },
    leads: {
      db: database.db,
      // Per e-mail: 3 inquiries/hour; whole process: 30/minute. E-mail notification: not configured.
      perEmail: createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }),
      global: createRateLimiter({ limit: 30, windowMs: 60 * 1000 }),
      notify: undefined,
    },
    media: {
      db: database.db,
      storage,
      urls,
      limits: { IMAGE: env.MEDIA_MAX_IMAGE_BYTES, VIDEO: env.MEDIA_MAX_VIDEO_BYTES },
      // A replaced file changes the resolved media URL on the public page.
      onPublicMediaChanged: revalidateWeb
        ? async () => {
            await revalidateWeb({
              pageSlug: 'home',
              sectionKey: 'media',
              contentRevision: 0,
              publishedAt: new Date(),
              reason: 'media',
            });
          }
        : undefined,
      uploads: {
        tmpDir: env.MEDIA_UPLOAD_TMP_DIR ?? join(tmpdir(), 'vitruv-uploads'),
        maxConcurrent: env.MEDIA_UPLOAD_CONCURRENCY,
      },
    },
  });

  const server = serve({ fetch: app.fetch, hostname: env.API_HOST, port: env.API_PORT }, (info) =>
    logger.info({ port: info.port }, 'vitruv-api listening'),
  );
  // Node's default (5 min for a whole request) would cut off large uploads on slow links.
  if ('requestTimeout' in server) server.requestTimeout = env.API_REQUEST_TIMEOUT_MS;

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void database.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (error) {
  // Env errors list variable names only; other startup errors print their name, not internals.
  const e = error as Error;
  console.error(e.name === 'EnvValidationError' ? e.message : `Startup failed: ${e.name}`);
  process.exit(1);
}
