import {
  accountStatusRequestSchema,
  activateRequestSchema,
  activationCheckRequestSchema,
  assignClientRequestSchema,
  clientListQuerySchema,
  createClientRequestSchema,
  createCoachRequestSchema,
  updateClientRequestSchema,
  updateCoachRequestSchema,
} from '@vitruv/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import type { ClientIpResolver } from '../../lib/client-ip';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import type { AuthRateLimits } from '../auth/auth.service';
import { activateAccount, checkActivation } from './activation.service';
import {
  assignClient,
  clientSelfProfile,
  coachOptions,
  createClient,
  createCoach,
  getClient,
  getCoach,
  listClients,
  listCoaches,
  regenerateClientActivation,
  regenerateCoachActivation,
  setClientAccountStatus,
  setCoachAccountStatus,
  updateClient,
  updateCoach,
  type ManagementDeps,
} from './management.service';

const idParam = z.object({ id: z.uuid() });

function actorOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

const smallBodies = bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) =>
    c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
});

/**
 * /v1/admin/clients — permission check per route, object scope inside every service call
 * (COACH: only their actively assigned clients; out-of-scope ids answer 404).
 */
export function adminClientRoutes(deps: ManagementDeps) {
  const routes = new Hono<AppEnv>();
  routes.use('*', smallBodies);

  routes.get(
    '/',
    requirePermission('clients.read'),
    validate('query', clientListQuerySchema),
    async (c) => c.json(await listClients(deps, actorOf(c), c.req.valid('query'))),
  );
  routes.post(
    '/',
    requirePermission('clients.create'),
    validate('json', createClientRequestSchema),
    async (c) => c.json(await createClient(deps, actorOf(c), c.req.valid('json')), 201),
  );
  // Coaches a client can be assigned to (ADMIN select options).
  routes.get('/coach-options', requirePermission('clients.assign'), async (c) =>
    c.json(await coachOptions(deps)),
  );
  routes.get('/:id', requirePermission('clients.read'), validate('param', idParam), async (c) =>
    c.json(await getClient(deps, actorOf(c), c.req.valid('param').id)),
  );
  routes.patch(
    '/:id',
    requirePermission('clients.update'),
    validate('param', idParam),
    validate('json', updateClientRequestSchema),
    async (c) =>
      c.json(await updateClient(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json'))),
  );
  routes.put(
    '/:id/assignment',
    requirePermission('clients.assign'),
    validate('param', idParam),
    validate('json', assignClientRequestSchema),
    async (c) =>
      c.json(
        await assignClient(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json').coachId),
      ),
  );
  routes.put(
    '/:id/account',
    requirePermission('clients.account.manage'),
    validate('param', idParam),
    validate('json', accountStatusRequestSchema),
    async (c) =>
      c.json(
        await setClientAccountStatus(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').status,
        ),
      ),
  );
  routes.post(
    '/:id/activation',
    requirePermission('clients.account.manage'),
    validate('param', idParam),
    async (c) =>
      c.json(
        { activation: await regenerateClientActivation(deps, actorOf(c), c.req.valid('param').id) },
        201,
      ),
  );
  return routes;
}

/** /v1/admin/coaches — ADMIN only (coaches.* permissions). */
export function adminCoachRoutes(deps: ManagementDeps) {
  const routes = new Hono<AppEnv>();
  routes.use('*', smallBodies);

  routes.get('/', requirePermission('coaches.read'), async (c) => c.json(await listCoaches(deps)));
  routes.post(
    '/',
    requirePermission('coaches.create'),
    validate('json', createCoachRequestSchema),
    async (c) => c.json(await createCoach(deps, actorOf(c), c.req.valid('json')), 201),
  );
  routes.get('/:id', requirePermission('coaches.read'), validate('param', idParam), async (c) =>
    c.json(await getCoach(deps, c.req.valid('param').id)),
  );
  routes.patch(
    '/:id',
    requirePermission('coaches.update'),
    validate('param', idParam),
    validate('json', updateCoachRequestSchema),
    async (c) => c.json(await updateCoach(deps, c.req.valid('param').id, c.req.valid('json'))),
  );
  routes.put(
    '/:id/account',
    requirePermission('coaches.account.manage'),
    validate('param', idParam),
    validate('json', accountStatusRequestSchema),
    async (c) =>
      c.json(
        await setCoachAccountStatus(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').status,
        ),
      ),
  );
  routes.post(
    '/:id/activation',
    requirePermission('coaches.account.manage'),
    validate('param', idParam),
    async (c) =>
      c.json(
        { activation: await regenerateCoachActivation(deps, actorOf(c), c.req.valid('param').id) },
        201,
      ),
  );
  return routes;
}

/** /v1/client — the signed-in CLIENT's own data (future Flutter app). */
export function clientSelfRoutes(deps: ManagementDeps) {
  const routes = new Hono<AppEnv>();
  routes.get('/me', requirePermission('self:read'), async (c) =>
    c.json(await clientSelfProfile(deps, actorOf(c))),
  );
  return routes;
}

/** /v1/auth/activation + /v1/auth/activate — public, rate-limited per IP, generic failures. */
export function activationRoutes(
  deps: ManagementDeps & {
    limits: Pick<AuthRateLimits, 'activationPerIp'>;
    clientIp: ClientIpResolver;
  },
) {
  const routes = new Hono<AppEnv>();
  const limit = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    if (!deps.limits.activationPerIp.hit(deps.clientIp(c))) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.');
    }
    await next();
  };
  routes.post(
    '/activation/check',
    limit,
    validate('json', activationCheckRequestSchema),
    async (c) =>
      c.json({
        valid: true as const,
        ...(await checkActivation(deps.db, c.req.valid('json').token)),
      }),
  );
  routes.post('/activate', limit, validate('json', activateRequestSchema), async (c) =>
    c.json(await activateAccount(deps, c.req.valid('json'))),
  );
  return routes;
}
