import { Hono } from 'hono';
import { requirePermission } from '../../auth/principal';
import { AppError } from '../../lib/errors';
import type { AppEnv } from '../../types';
import type { TrainingDeps } from '../training/exercises.service';
import { adminDashboard } from './dashboard.service';

/** GET /v1/admin/dashboard — start page numbers, scoped to the actor's clients. */
export function adminDashboardRoutes(deps: TrainingDeps) {
  const r = new Hono<AppEnv>();
  r.get('/', requirePermission('clients.read'), async (c) => {
    const principal = c.get('principal');
    if (!principal) throw AppError.unauthenticated();
    return c.json(await adminDashboard(deps, principal));
  });
  return r;
}
