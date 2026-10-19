import {
  startWorkoutRequestSchema,
  updateWorkoutExerciseRequestSchema,
  updateWorkoutNoteRequestSchema,
  updateWorkoutSetRequestSchema,
  workoutHistoryQuerySchema,
} from '@vitruv/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import type { TrainingDeps } from '../training/exercises.service';
import * as workouts from './workouts.service';

const sessionParam = z.object({ sessionId: z.uuid() });
const exerciseParam = sessionParam.extend({ exerciseId: z.uuid() });
const setParam = exerciseParam.extend({ setNumber: z.coerce.number().int().min(1).max(50) });
const clientParam = z.object({ clientId: z.uuid() });
const clientSessionParam = clientParam.extend({ sessionId: z.uuid() });

function actorOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

/**
 * /v1/client/workouts — the signed-in CLIENT's own workouts (self context: no client id exists
 * in any path or body). Out-of-scope ids answer 404 like missing ones.
 */
export function clientWorkoutRoutes(deps: TrainingDeps) {
  const r = new Hono<AppEnv>();
  const self = requirePermission('training.self.workout');
  r.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
    }),
  );

  r.get('/', self, validate('query', workoutHistoryQuerySchema), async (c) =>
    c.json(await workouts.workoutHistory(deps, actorOf(c), c.req.valid('query').limit)),
  );
  r.post('/', self, validate('json', startWorkoutRequestSchema), async (c) => {
    const result = await workouts.startWorkout(deps, actorOf(c), c.req.valid('json').trainingDayId);
    return c.json(result, result.resumed ? 200 : 201);
  });
  r.get('/current', self, async (c) => c.json(await workouts.currentWorkout(deps, actorOf(c))));
  r.get('/:sessionId', self, validate('param', sessionParam), async (c) =>
    c.json(await workouts.getWorkout(deps, actorOf(c), c.req.valid('param').sessionId)),
  );
  r.patch(
    '/:sessionId/exercises/:exerciseId',
    self,
    validate('param', exerciseParam),
    validate('json', updateWorkoutExerciseRequestSchema),
    async (c) => {
      const { sessionId, exerciseId } = c.req.valid('param');
      return c.json(
        await workouts.updateWorkoutExercise(
          deps,
          actorOf(c),
          sessionId,
          exerciseId,
          c.req.valid('json'),
        ),
      );
    },
  );
  r.patch(
    '/:sessionId/exercises/:exerciseId/sets/:setNumber',
    self,
    validate('param', setParam),
    validate('json', updateWorkoutSetRequestSchema),
    async (c) => {
      const { sessionId, exerciseId, setNumber } = c.req.valid('param');
      return c.json(
        await workouts.updateWorkoutSet(
          deps,
          actorOf(c),
          sessionId,
          exerciseId,
          setNumber,
          c.req.valid('json'),
        ),
      );
    },
  );
  r.put(
    '/:sessionId/note',
    self,
    validate('param', sessionParam),
    validate('json', updateWorkoutNoteRequestSchema),
    async (c) =>
      c.json(
        await workouts.setSessionNote(
          deps,
          actorOf(c),
          c.req.valid('param').sessionId,
          c.req.valid('json'),
        ),
      ),
  );
  r.put(
    '/:sessionId/exercises/:exerciseId/note',
    self,
    validate('param', exerciseParam),
    validate('json', updateWorkoutNoteRequestSchema),
    async (c) => {
      const { sessionId, exerciseId } = c.req.valid('param');
      return c.json(
        await workouts.setExerciseNote(
          deps,
          actorOf(c),
          sessionId,
          exerciseId,
          c.req.valid('json'),
        ),
      );
    },
  );
  r.post('/:sessionId/complete', self, validate('param', sessionParam), async (c) =>
    c.json(
      await workouts.finishWorkout(deps, actorOf(c), c.req.valid('param').sessionId, 'COMPLETED'),
    ),
  );
  r.post('/:sessionId/abandon', self, validate('param', sessionParam), async (c) =>
    c.json(
      await workouts.finishWorkout(deps, actorOf(c), c.req.valid('param').sessionId, 'ABANDONED'),
    ),
  );
  return r;
}

/** Read-only workout summaries for Coach/Admin, mounted under /v1/admin/training. */
export function adminWorkoutRoutes(deps: TrainingDeps) {
  const r = new Hono<AppEnv>();
  r.get(
    '/clients/:clientId/workouts',
    requirePermission('training.sessions.read'),
    validate('param', clientParam),
    validate('query', workoutHistoryQuerySchema),
    async (c) =>
      c.json(
        await workouts.clientWorkoutSummaries(
          deps,
          actorOf(c),
          c.req.valid('param').clientId,
          c.req.valid('query').limit,
        ),
      ),
  );
  r.get(
    '/clients/:clientId/workouts/:sessionId',
    requirePermission('training.sessions.read'),
    validate('param', clientSessionParam),
    async (c) => {
      const { clientId, sessionId } = c.req.valid('param');
      return c.json(await workouts.clientWorkoutDetail(deps, actorOf(c), clientId, sessionId));
    },
  );
  return r;
}
