import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { authenticate, type PrincipalResolver } from './auth/authenticate';
import type { ClientIpResolver } from './lib/client-ip';
import { AppError, errorBody } from './lib/errors';
import type { Logger } from './lib/logger';
import { authRoutes } from './modules/auth/auth.routes';
import type { AuthServiceDeps } from './modules/auth/auth.service';
import { healthRoutes, type HealthDeps } from './modules/health/health.routes';
import {
  activationRoutes,
  adminClientRoutes,
  adminCoachRoutes,
  clientSelfRoutes,
} from './modules/management/management.routes';
import type { ManagementDeps } from './modules/management/management.service';
import { adminDashboardRoutes } from './modules/dashboard/dashboard.routes';
import { publicLeadRoutes } from './modules/leads/leads.routes';
import type { LeadServiceDeps } from './modules/leads/leads.service';
import {
  adminMediaRoutes,
  localMediaDeliveryRoutes,
  trainingMediaRoutes,
} from './modules/media/media.routes';
import type { TrainingDeps } from './modules/training/exercises.service';
import { adminTrainingRoutes, clientTrainingRoutes } from './modules/training/training.routes';
import { adminWorkoutRoutes, clientWorkoutRoutes } from './modules/workouts/workouts.routes';
import {
  adminNutritionRoutes,
  clientNutritionRoutes,
  NUTRITION_UPLOAD_PATH,
} from './modules/nutrition/nutrition.routes';
import type { MediaServiceDeps } from './modules/media/media.service';
import { adminWebsiteRoutes, publicWebsiteRoutes } from './modules/website/website.routes';
import type { WebsiteServiceDeps } from './modules/website/website.service';
import type { AppEnv } from './types';

export interface AppDeps {
  logger: Logger;
  corsOrigins: string[];
  bodyLimitBytes: number;
  health: Omit<HealthDeps, 'logger'>;
  /** Establishes the request principal for /v1/admin/* and /v1/auth/* (auth/authenticate.ts). */
  auth: PrincipalResolver;
  /** Login, sessions, password change (modules/auth). */
  sessions: Omit<AuthServiceDeps, 'logger'>;
  /** Client IP for rate limits; trusts X-Forwarded-For only from configured proxies. */
  clientIp: ClientIpResolver;
  /** Coach & client management, activation (modules/management). */
  management: Omit<ManagementDeps, 'logger'>;
  /** Training engine (modules/training). */
  training: Omit<TrainingDeps, 'logger'>;
  website: Omit<WebsiteServiceDeps, 'logger'>;
  media: Omit<MediaServiceDeps, 'logger'>;
  /** Nutrition PDFs reuse the media db + storage; the size limit is overridable for tests. */
  nutritionMaxBytes?: number;
  leads: Omit<LeadServiceDeps, 'logger'>;
}

/** The media upload routes have their own (larger) body limit. */
const UPLOAD_PATHS = new Set(['/v1/admin/media', '/v1/admin/training/media']);

/**
 * Builds the HTTP application from injected dependencies (no globals, no I/O at import time),
 * so tests can exercise it with `app.request()` and fakes.
 *
 * Route layout: infrastructure endpoints at the root (/health, /media in development),
 * business APIs under /v1/<audience>/<domain>.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    deps.logger.info(
      {
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    );
  });
  // CORP is set below instead, so media delivery can opt into cross-origin embedding.
  app.use('*', secureHeaders({ crossOriginResourcePolicy: false }));
  app.use('*', async (c, next) => {
    await next();
    if (!c.res.headers.has('Cross-Origin-Resource-Policy')) {
      c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    }
  });
  // Allow-list only (never '*'). No credentials mode: the API authenticates with the
  // Authorization header, never with cookies. Native apps send no Origin and are unaffected.
  app.use(
    '*',
    cors({
      origin: (origin) => (deps.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
      maxAge: 600,
    }),
  );
  // Authenticated / credential-bearing responses must never be stored by any cache.
  for (const path of ['/v1/auth/*', '/v1/admin/*', '/v1/client/*']) {
    app.use(path, async (c, next) => {
      await next();
      // Keep a stricter route value (private PDFs: 'private, no-store'); default no-store.
      if (!c.res.headers.get('Cache-Control')?.includes('no-store')) {
        c.res.headers.set('Cache-Control', 'no-store');
      }
      c.res.headers.set('Pragma', 'no-cache');
    });
  }
  const globalBodyLimit = bodyLimit({
    maxSize: deps.bodyLimitBytes,
    onError: (c) =>
      c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
  });
  app.use('*', (c, next) =>
    c.req.method === 'POST' &&
    (UPLOAD_PATHS.has(c.req.path) || NUTRITION_UPLOAD_PATH.test(c.req.path))
      ? next()
      : globalBodyLimit(c, next),
  );

  app.route('/health', healthRoutes({ ...deps.health, logger: deps.logger }));
  if (deps.media.storage.driver === 'local') {
    app.route('/media', localMediaDeliveryRoutes(deps.media.storage));
  }

  app.use('/v1/admin/*', authenticate(deps.auth));
  app.use('/v1/auth/*', authenticate(deps.auth));
  app.use('/v1/client/*', authenticate(deps.auth));
  app.route(
    '/v1/auth',
    authRoutes({ ...deps.sessions, logger: deps.logger, clientIp: deps.clientIp }),
  );
  app.route(
    '/v1/auth',
    activationRoutes({
      ...deps.management,
      logger: deps.logger,
      limits: deps.sessions.limits,
      clientIp: deps.clientIp,
    }),
  );
  const management = { ...deps.management, logger: deps.logger };
  app.route('/v1/admin/clients', adminClientRoutes(management));
  app.route('/v1/admin/coaches', adminCoachRoutes(management));
  app.route('/v1/client', clientSelfRoutes(management));
  app.route('/v1/admin/website', adminWebsiteRoutes({ ...deps.website, logger: deps.logger }));
  app.route('/v1/admin/media', adminMediaRoutes({ ...deps.media, logger: deps.logger }));
  app.route(
    '/v1/admin/training/media',
    trainingMediaRoutes({ ...deps.media, logger: deps.logger }),
  );
  const training = { ...deps.training, logger: deps.logger };
  app.route('/v1/admin/dashboard', adminDashboardRoutes(training));
  app.route('/v1/admin/training', adminWorkoutRoutes(training));
  app.route('/v1/admin/training', adminTrainingRoutes(training));
  app.route('/v1/client/training', clientTrainingRoutes(training));
  app.route('/v1/client/workouts', clientWorkoutRoutes(training));
  const nutritionDeps = {
    db: deps.media.db,
    storage: deps.media.storage,
    logger: deps.logger,
    maxBytes: deps.nutritionMaxBytes,
  };
  app.route('/v1/admin/nutrition', adminNutritionRoutes(nutritionDeps));
  app.route('/v1/client/nutrition', clientNutritionRoutes(nutritionDeps));
  app.route('/v1/public/website', publicWebsiteRoutes({ ...deps.website, logger: deps.logger }));
  app.route('/v1/public/leads', publicLeadRoutes({ ...deps.leads, logger: deps.logger }));

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Route not found.', c.get('requestId')), 404));

  app.onError((error, c) => {
    const id = c.get('requestId');
    if (error instanceof AppError) {
      return c.json(errorBody(error.code, error.message, id, error.details), error.status);
    }
    if (error instanceof HTTPException && error.status < 500) {
      return c.json(errorBody('BAD_REQUEST', 'Bad request.', id), error.status);
    }
    deps.logger.error({ requestId: id, err: error }, 'unhandled error');
    return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong.', id), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
