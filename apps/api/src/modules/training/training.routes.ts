import {
  createAssignmentRequestSchema,
  createDayRequestSchema,
  createExerciseRequestSchema,
  createProgramRequestSchema,
  createSectionRequestSchema,
  exerciseListQuerySchema,
  reorderRequestSchema,
  saveClientPlanRequestSchema,
  updateAssignmentRequestSchema,
  updateDayRequestSchema,
  updateExerciseRequestSchema,
  updateProgramRequestSchema,
  updateSectionRequestSchema,
  updateWeekRequestSchema,
  weekInputSchema,
} from '@vitruv/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import {
  createExercise,
  getExercise,
  listExercises,
  setExerciseActive,
  updateExercise,
  type TrainingDeps,
} from './exercises.service';
import * as plan from './plan.service';
import * as programs from './programs.service';

const idParam = z.object({ id: z.uuid() });
const clientParam = z.object({ clientId: z.uuid() });

function actorOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

/**
 * /v1/admin/training — exercise library + client programs. Permissions per route; client scope
 * (COACH → assigned clients only) is enforced inside every program/structure service call, for
 * every nested id. Mutations answer with the complete program tree.
 */
export function adminTrainingRoutes(deps: TrainingDeps) {
  const r = new Hono<AppEnv>();
  r.use(
    '*',
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
    }),
  );
  const read = requirePermission('training.programs.read');
  const update = requirePermission('training.programs.update');

  // ---- exercise library
  r.get(
    '/exercises',
    requirePermission('training.exercises.read'),
    validate('query', exerciseListQuerySchema),
    async (c) => c.json(await listExercises(deps, c.req.valid('query'))),
  );
  r.post(
    '/exercises',
    requirePermission('training.exercises.write'),
    validate('json', createExerciseRequestSchema),
    async (c) => c.json(await createExercise(deps, actorOf(c), c.req.valid('json')), 201),
  );
  r.get(
    '/exercises/:id',
    requirePermission('training.exercises.read'),
    validate('param', idParam),
    async (c) => c.json(await getExercise(deps, c.req.valid('param').id)),
  );
  r.patch(
    '/exercises/:id',
    requirePermission('training.exercises.write'),
    validate('param', idParam),
    validate('json', updateExerciseRequestSchema),
    async (c) => c.json(await updateExercise(deps, c.req.valid('param').id, c.req.valid('json'))),
  );
  for (const [path, active] of [
    ['/exercises/:id/deactivate', false],
    ['/exercises/:id/reactivate', true],
  ] as const) {
    r.post(
      path,
      requirePermission('training.exercises.write'),
      validate('param', idParam),
      async (c) =>
        c.json(await setExerciseActive(deps, actorOf(c), c.req.valid('param').id, active)),
    );
  }

  // ---- dated client plan (flat list: exercise + date + note; saved as a whole)
  r.get('/clients/:clientId/plan', read, validate('param', clientParam), async (c) =>
    c.json(await plan.clientPlan(deps, actorOf(c), c.req.valid('param').clientId)),
  );
  r.put(
    '/clients/:clientId/plan',
    update,
    validate('param', clientParam),
    validate('json', saveClientPlanRequestSchema),
    async (c) =>
      c.json(
        await plan.saveClientPlan(
          deps,
          actorOf(c),
          c.req.valid('param').clientId,
          c.req.valid('json'),
        ),
      ),
  );

  // ---- programs
  r.get('/clients/:clientId/programs', read, validate('param', clientParam), async (c) =>
    c.json(await programs.listPrograms(deps, actorOf(c), c.req.valid('param').clientId)),
  );
  r.post(
    '/clients/:clientId/programs',
    requirePermission('training.programs.create'),
    validate('param', clientParam),
    validate('json', createProgramRequestSchema),
    async (c) =>
      c.json(
        await programs.createProgram(
          deps,
          actorOf(c),
          c.req.valid('param').clientId,
          c.req.valid('json'),
        ),
        201,
      ),
  );
  r.get('/programs/:id', read, validate('param', idParam), async (c) =>
    c.json(await programs.getProgram(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.get('/programs/:id/preview', read, validate('param', idParam), async (c) =>
    c.json(await programs.previewProgram(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.patch(
    '/programs/:id',
    update,
    validate('param', idParam),
    validate('json', updateProgramRequestSchema),
    async (c) =>
      c.json(
        await programs.updateProgram(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  );
  r.delete('/programs/:id', update, validate('param', idParam), async (c) => {
    await programs.deleteProgram(deps, actorOf(c), c.req.valid('param').id);
    return c.body(null, 204);
  });
  r.post(
    '/programs/:id/activate',
    requirePermission('training.programs.activate'),
    validate('param', idParam),
    async (c) => c.json(await programs.activateProgram(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.post(
    '/programs/:id/complete',
    requirePermission('training.programs.activate'),
    validate('param', idParam),
    async (c) =>
      c.json(await programs.retireProgram(deps, actorOf(c), c.req.valid('param').id, 'COMPLETED')),
  );
  r.post(
    '/programs/:id/archive',
    requirePermission('training.programs.activate'),
    validate('param', idParam),
    async (c) =>
      c.json(await programs.retireProgram(deps, actorOf(c), c.req.valid('param').id, 'ARCHIVED')),
  );

  // ---- weeks
  r.post(
    '/programs/:id/weeks',
    update,
    validate('param', idParam),
    validate('json', weekInputSchema),
    async (c) =>
      c.json(
        await programs.addWeek(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json')),
        201,
      ),
  );
  r.post(
    '/programs/:id/weeks/reorder',
    update,
    validate('param', idParam),
    validate('json', reorderRequestSchema),
    async (c) =>
      c.json(
        await programs.reorderWeeks(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').ids,
        ),
      ),
  );
  r.patch(
    '/weeks/:id',
    update,
    validate('param', idParam),
    validate('json', updateWeekRequestSchema),
    async (c) =>
      c.json(
        await programs.updateWeek(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json')),
      ),
  );
  r.delete('/weeks/:id', update, validate('param', idParam), async (c) =>
    c.json(await programs.deleteWeek(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.post('/weeks/:id/duplicate', update, validate('param', idParam), async (c) =>
    c.json(await programs.duplicateWeek(deps, actorOf(c), c.req.valid('param').id), 201),
  );

  // ---- days
  r.post(
    '/weeks/:id/days',
    update,
    validate('param', idParam),
    validate('json', createDayRequestSchema),
    async (c) =>
      c.json(
        await programs.addDay(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json')),
        201,
      ),
  );
  r.post(
    '/weeks/:id/days/reorder',
    update,
    validate('param', idParam),
    validate('json', reorderRequestSchema),
    async (c) =>
      c.json(
        await programs.reorderDays(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').ids,
        ),
      ),
  );
  r.patch(
    '/days/:id',
    update,
    validate('param', idParam),
    validate('json', updateDayRequestSchema),
    async (c) =>
      c.json(
        await programs.updateDay(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json')),
      ),
  );
  r.delete('/days/:id', update, validate('param', idParam), async (c) =>
    c.json(await programs.deleteDay(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.post('/days/:id/duplicate', update, validate('param', idParam), async (c) =>
    c.json(await programs.duplicateDay(deps, actorOf(c), c.req.valid('param').id), 201),
  );

  // ---- sections
  r.post(
    '/days/:id/sections',
    update,
    validate('param', idParam),
    validate('json', createSectionRequestSchema),
    async (c) =>
      c.json(
        await programs.addSection(deps, actorOf(c), c.req.valid('param').id, c.req.valid('json')),
        201,
      ),
  );
  r.post(
    '/days/:id/sections/reorder',
    update,
    validate('param', idParam),
    validate('json', reorderRequestSchema),
    async (c) =>
      c.json(
        await programs.reorderSections(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').ids,
        ),
      ),
  );
  r.patch(
    '/sections/:id',
    update,
    validate('param', idParam),
    validate('json', updateSectionRequestSchema),
    async (c) =>
      c.json(
        await programs.updateSection(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  );
  r.delete('/sections/:id', update, validate('param', idParam), async (c) =>
    c.json(await programs.deleteSection(deps, actorOf(c), c.req.valid('param').id)),
  );

  // ---- assignments
  r.post(
    '/sections/:id/assignments',
    update,
    validate('param', idParam),
    validate('json', createAssignmentRequestSchema),
    async (c) =>
      c.json(
        await programs.addAssignment(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
        201,
      ),
  );
  r.post(
    '/sections/:id/assignments/reorder',
    update,
    validate('param', idParam),
    validate('json', reorderRequestSchema),
    async (c) =>
      c.json(
        await programs.reorderAssignments(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json').ids,
        ),
      ),
  );
  r.patch(
    '/assignments/:id',
    update,
    validate('param', idParam),
    validate('json', updateAssignmentRequestSchema),
    async (c) =>
      c.json(
        await programs.updateAssignment(
          deps,
          actorOf(c),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  );
  r.delete('/assignments/:id', update, validate('param', idParam), async (c) =>
    c.json(await programs.deleteAssignment(deps, actorOf(c), c.req.valid('param').id)),
  );

  return r;
}

/** /v1/client/training — self context only (no client id parameter exists). */
export function clientTrainingRoutes(deps: TrainingDeps) {
  const r = new Hono<AppEnv>();
  r.get('/active', requirePermission('training.self.read'), async (c) =>
    c.json(await programs.clientActiveProgram(deps, actorOf(c))),
  );
  r.get('/plan', requirePermission('training.self.read'), async (c) =>
    c.json(await plan.ownPlan(deps, actorOf(c))),
  );
  return r;
}
