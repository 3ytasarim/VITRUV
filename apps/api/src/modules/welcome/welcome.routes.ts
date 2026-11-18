import {
  createWelcomeVideoRequestSchema,
  updateWelcomeVideoRequestSchema,
  welcomeCategoryRequestSchema,
  welcomeOrderRequestSchema,
} from '@vitruv/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import * as welcome from './welcome.service';

const idParam = z.object({ id: z.uuid() });

function actorOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

/** /v1/admin/welcome — ADMIN only (`welcome.manage`). Mutations answer with the full overview. */
export function adminWelcomeRoutes(deps: welcome.WelcomeDeps) {
  const r = new Hono<AppEnv>();
  r.use(
    '*',
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
    }),
  );
  const manage = requirePermission('welcome.manage');

  r.get('/', manage, async (c) => c.json(await welcome.adminWelcome(deps)));

  r.post('/categories', manage, validate('json', welcomeCategoryRequestSchema), async (c) =>
    c.json(await welcome.createWelcomeCategory(deps, actorOf(c), c.req.valid('json')), 201),
  );
  r.put('/categories/order', manage, validate('json', welcomeOrderRequestSchema), async (c) =>
    c.json(await welcome.orderWelcomeCategories(deps, c.req.valid('json').ids)),
  );
  r.patch(
    '/categories/:id',
    manage,
    validate('param', idParam),
    validate('json', welcomeCategoryRequestSchema),
    async (c) =>
      c.json(
        await welcome.renameWelcomeCategory(deps, c.req.valid('param').id, c.req.valid('json')),
      ),
  );
  r.delete('/categories/:id', manage, validate('param', idParam), async (c) =>
    c.json(await welcome.deleteWelcomeCategory(deps, c.req.valid('param').id)),
  );
  r.put(
    '/categories/:id/videos/order',
    manage,
    validate('param', idParam),
    validate('json', welcomeOrderRequestSchema),
    async (c) =>
      c.json(
        await welcome.orderWelcomeVideos(deps, c.req.valid('param').id, c.req.valid('json').ids),
      ),
  );

  r.post('/videos', manage, validate('json', createWelcomeVideoRequestSchema), async (c) =>
    c.json(await welcome.createWelcomeVideo(deps, actorOf(c), c.req.valid('json')), 201),
  );
  r.patch(
    '/videos/:id',
    manage,
    validate('param', idParam),
    validate('json', updateWelcomeVideoRequestSchema),
    async (c) =>
      c.json(await welcome.updateWelcomeVideo(deps, c.req.valid('param').id, c.req.valid('json'))),
  );
  r.delete('/videos/:id', manage, validate('param', idParam), async (c) =>
    c.json(await welcome.deleteWelcomeVideo(deps, c.req.valid('param').id)),
  );
  return r;
}

/** /v1/client/welcome — the same videos for every client. */
export function clientWelcomeRoutes(deps: welcome.WelcomeDeps) {
  const r = new Hono<AppEnv>();
  r.get('/', requirePermission('welcome.self.read'), async (c) =>
    c.json(await welcome.clientWelcome(deps)),
  );
  return r;
}
