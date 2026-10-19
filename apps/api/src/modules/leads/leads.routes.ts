import { leadRequestSchema, type LeadResponse } from '@vitruv/contracts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import { submitLead, type LeadServiceDeps } from './leads.service';

/**
 * Public inquiry endpoint — mounted at /v1/public/leads. Write-only: there is no route that reads
 * leads publicly. Responses never echo submitted data.
 */
export function publicLeadRoutes(deps: LeadServiceDeps) {
  const routes = new Hono<AppEnv>();
  routes.post(
    '/',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Anfrage zu groß.', c.get('requestId')), 413),
    }),
    validate('json', leadRequestSchema),
    async (c) => {
      await submitLead(deps, c.req.valid('json'));
      c.header('Cache-Control', 'no-store');
      const body: LeadResponse = { ok: true };
      return c.json(body, 201);
    },
  );
  return routes;
}
