import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminDashboardSchema,
  adminExerciseSchema,
  adminProgramSchema,
  authSessionResponseSchema,
  currentWorkoutResponseSchema,
  finishWorkoutResponseSchema,
  startWorkoutResponseSchema,
  workoutExecutionUpdateResponseSchema,
  workoutNoteResponseSchema,
  workoutSessionSchema,
  workoutSessionSummaryListSchema,
  type AdminProgram,
  type WorkoutSession,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Sprint 7 workout sessions against the real schema. Every test: ONE rolled-back transaction.
 * Fictional content only.
 */
const PASSWORD = 'ein sicheres Test-Passwort';
const T = '/v1/admin/training';
const W = '/v1/client/workouts';

let storageDir: string;

function setup(tx: DbExecutor) {
  const app = buildTestApp({
    db: tx,
    storageDir,
    bodyLimitBytes: 1_048_576,
    auth: createSessionResolver((token) => resolveAccessToken({ db: tx }, token)),
    sessions: { db: tx, limits: testAuthLimits() },
  });
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  };
  const login = async (email: string, role: UserRole) => {
    const res = await call('POST', '/v1/auth/login', undefined, {
      email,
      password: PASSWORD,
      clientType: role === 'CLIENT' ? 'MOBILE' : 'WEB',
    });
    return authSessionResponseSchema.parse(res.body).tokens.accessToken;
  };
  const user = async (role: UserRole) => {
    const email = `it-workout-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const [row] = await tx
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) })
      .returning();
    return { id: must(row).id, email, token: await login(email, role) };
  };
  const coach = async () => {
    const u = await user('COACH');
    await tx.insert(schema.coachProfiles).values({ userId: u.id, displayName: 'Coach' });
    return u;
  };
  const client = async (coachId: string) => {
    const u = await user('CLIENT');
    await tx
      .insert(schema.clientProfiles)
      .values({ userId: u.id, firstName: 'Test', lastName: 'Kunde' });
    await tx
      .insert(schema.coachClientAssignments)
      .values({ coachUserId: coachId, clientUserId: u.id });
    return u;
  };
  const program = (res: { status: number; body: Record<string, unknown> }) => {
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return adminProgramSchema.parse(res.body);
  };
  const exercise = async (token: string, name: string) => {
    const res = await call('POST', `${T}/exercises`, token, {
      name: `${name} ${randomUUID().slice(0, 6)}`,
      description: `Standard-Ausführung ${name}.`,
    });
    expect(res.status).toBe(201);
    return adminExerciseSchema.parse(res.body);
  };
  /**
   * An ACTIVE plan with one day "Oberkörper A": MAIN holds the four execution styles
   * (4 × 12 rest 60 · 70 total reps · 45 s · AMRAP) and a second, empty day "Leer".
   */
  const activePlan = async (coachToken: string, clientId: string) => {
    const pull = await exercise(coachToken, 'Klimmzüge');
    const push = await exercise(coachToken, 'Liegestütze');
    const plank = await exercise(coachToken, 'Plank');
    const burpee = await exercise(coachToken, 'Burpees');
    let p = program(
      await call('POST', `${T}/clients/${clientId}/programs`, coachToken, { title: 'Kraftaufbau' }),
    );
    p = program(await call('POST', `${T}/programs/${p.id}/weeks`, coachToken, {}));
    const week = must(p.weeks[0]);
    p = program(
      await call('POST', `${T}/weeks/${week.id}/days`, coachToken, { title: 'Oberkörper A' }),
    );
    p = program(await call('POST', `${T}/weeks/${week.id}/days`, coachToken, { title: 'Leer' }));
    const day = must(must(p.weeks[0]).days[0]);
    const main = must(day.sections.find((s) => s.type === 'MAIN'));
    for (const body of [
      { exerciseId: pull.id, sets: 4, reps: 12, restSeconds: 60 },
      { exerciseId: push.id, totalReps: 70, restSeconds: 60 },
      { exerciseId: plank.id, durationSeconds: 45, restSeconds: 30 },
      { exerciseId: burpee.id, prescriptionText: 'AMRAP', instructionsOverride: 'Sauber bleiben.' },
    ]) {
      p = program(await call('POST', `${T}/sections/${main.id}/assignments`, coachToken, body));
    }
    const activated = await call('POST', `${T}/programs/${p.id}/activate`, coachToken);
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);
    p = program(await call('GET', `${T}/programs/${p.id}`, coachToken));
    const days = must(p.weeks[0]).days;
    return { program: p, day: must(days[0]), emptyDay: must(days[1]), pull, plank };
  };
  const start = async (token: string, trainingDayId: string) => {
    const res = await call('POST', W, token, { trainingDayId });
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return { status: res.status, ...startWorkoutResponseSchema.parse(res.body) };
  };
  return { call, user, coach, client, program, exercise, activePlan, start };
}

const byMode = (session: WorkoutSession, mode: string) =>
  must(
    session.exercises.find((e) => e.executionMode === mode),
    mode,
  );
const firstMainAssignment = (p: AdminProgram) =>
  must(p.weeks[0]?.days[0]?.sections.find((s) => s.type === 'MAIN')?.assignments[0], 'assignment');

// Each test builds whole plans over the network (Neon) — allow more than the default 20 s.
describe.skipIf(!databaseUrl)(
  'workout sessions (integration, rolled back)',
  { timeout: 90_000 },
  () => {
    let handle: DatabaseHandle;
    beforeAll(async () => {
      handle = openTestDatabase();
      storageDir = await mkdtemp(join(tmpdir(), 'vitruv-workout-it-'));
    });
    afterAll(async () => {
      await handle?.close();
      await rm(storageDir, { recursive: true, force: true });
    });

    it('starts the own ACTIVE day with a full snapshot; starting again resumes (no duplicate)', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { day } = await t.activePlan(coach.token, client.id);

        const first = await t.start(client.token, day.id);
        expect(first.status).toBe(201);
        expect(first.resumed).toBe(false);
        const s = first.session;
        expect(s).toMatchObject({
          status: 'IN_PROGRESS',
          programTitle: 'Kraftaufbau',
          dayTitle: 'Oberkörper A',
          weekOrder: 0,
          dayOrder: 0,
          completedAt: null,
          durationSeconds: null,
        });
        expect(s.exercises.map((e) => e.executionMode)).toEqual([
          'SETS_REPS',
          'TOTAL_REPS',
          'DURATION',
          'CUSTOM',
        ]);
        expect(s.exercises.map((e) => e.order)).toEqual([0, 1, 2, 3]);
        const sets = byMode(s, 'SETS_REPS');
        expect(sets.target).toMatchObject({ sets: 4, reps: 12, restSeconds: 60 });
        expect(sets.sets.map((x) => [x.setNumber, x.targetReps, x.completed])).toEqual([
          [1, 12, false],
          [2, 12, false],
          [3, 12, false],
          [4, 12, false],
        ]);
        expect(sets.instructions).toMatch(/^Standard-Ausführung Klimmzüge/);
        expect(byMode(s, 'CUSTOM')).toMatchObject({
          instructions: 'Sauber bleiben.',
          target: { prescriptionText: 'AMRAP' },
          sets: [],
        });
        expect(byMode(s, 'TOTAL_REPS').sets).toEqual([]);
        expect(s.progress).toEqual({
          total: 4,
          completed: 0,
          skipped: 0,
          currentExerciseId: sets.id,
        });

        const again = await t.start(client.token, day.id);
        expect(again.status).toBe(200);
        expect(again.resumed).toBe(true);
        expect(again.session.id).toBe(s.id);
        const rows = await tx
          .select()
          .from(schema.workoutSessions)
          .where(eq(schema.workoutSessions.clientUserId, client.id));
        expect(rows).toHaveLength(1);
      });
    });

    it('MANDATORY: coach edits of the ACTIVE plan never change a running session; a later session gets the new prescription', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { program, day, pull } = await t.activePlan(coach.token, client.id);
        const assignment = firstMainAssignment(program);

        // 1–3: 4 × 12, rest 60 snapshotted
        const { session } = await t.start(client.token, day.id);
        expect(byMode(session, 'SETS_REPS').target).toMatchObject({
          sets: 4,
          reps: 12,
          restSeconds: 60,
        });
        // 4: coach changes the live plan to 5 × 8, rest 90 and renames the exercise
        t.program(
          await t.call('PATCH', `${T}/assignments/${assignment.id}`, coach.token, {
            sets: 5,
            reps: 8,
            restSeconds: 90,
          }),
        );
        await t.call('PATCH', `${T}/exercises/${pull.id}`, coach.token, {
          name: `Umbenannt ${randomUUID().slice(0, 6)}`,
        });
        // 5: the running session is unchanged (DB/API, not UI)
        const current = currentWorkoutResponseSchema.parse(
          (await t.call('GET', `${W}/current`, client.token)).body,
        );
        const running = byMode(must(current.session), 'SETS_REPS');
        expect(running.target).toMatchObject({ sets: 4, reps: 12, restSeconds: 60 });
        expect(running.sets).toHaveLength(4);
        expect(running.name).toBe(byMode(session, 'SETS_REPS').name);
        const [dbRow] = await tx
          .select()
          .from(schema.workoutSessionExercises)
          .where(eq(schema.workoutSessionExercises.id, running.id));
        expect(dbRow).toMatchObject({ sets: 4, reps: 12, restSeconds: 60 });
        // 6: complete
        const done = await t.call('POST', `${W}/${session.id}/complete`, client.token);
        expect(done.status).toBe(200);
        // 7: a new session uses 5 × 8, rest 90 (and the new name)
        const later = await t.start(client.token, day.id);
        expect(later.resumed).toBe(false);
        const next = byMode(later.session, 'SETS_REPS');
        expect(next.target).toMatchObject({ sets: 5, reps: 8, restSeconds: 90 });
        expect(next.sets.map((x) => x.targetReps)).toEqual([8, 8, 8, 8, 8]);
        expect(next.name).toMatch(/^Umbenannt/);
        // the completed one stays 4 × 12 forever
        const history = workoutSessionSchema.parse(
          (await t.call('GET', `${W}/${session.id}`, client.token)).body,
        );
        expect(byMode(history, 'SETS_REPS').target).toMatchObject({ sets: 4, reps: 12 });
      });
    });

    it('history survives removal from the live plan and archiving (SET NULL links, snapshot titles)', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { program, day } = await t.activePlan(coach.token, client.id);
        const { session } = await t.start(client.token, day.id);
        // coach removes one assignment from the ACTIVE plan: only that link becomes null
        const assignment = firstMainAssignment(program);
        expect(
          (await t.call('DELETE', `${T}/assignments/${assignment.id}`, coach.token)).status,
        ).toBeLessThan(300);
        const read = async () =>
          workoutSessionSchema.parse(
            (await t.call('GET', `${W}/${session.id}`, client.token)).body,
          );
        let after = await read();
        expect(after.exercises.map((e) => e.assignmentId === null)).toEqual([
          true,
          false,
          false,
          false,
        ]);
        expect(after.exercises[0]?.target).toMatchObject({ sets: 4, reps: 12, restSeconds: 60 });
        // … then deletes the whole day (cascades to its assignments): the session stays complete
        expect((await t.call('DELETE', `${T}/days/${day.id}`, coach.token)).status).toBeLessThan(
          300,
        );
        after = await read();
        expect(after.dayId).toBeNull();
        expect(after.dayTitle).toBe('Oberkörper A');
        expect(after.exercises).toHaveLength(4);
        expect(after.exercises.every((e) => e.assignmentId === null)).toBe(true);
        expect(after.exercises.map((e) => e.name)).toEqual(session.exercises.map((e) => e.name));
        // the session can still be finished after the plan was archived
        await t.call('POST', `${T}/programs/${program.id}/archive`, coach.token);
        const done = finishWorkoutResponseSchema.parse(
          (await t.call('POST', `${W}/${session.id}/complete`, client.token)).body,
        );
        expect(done.summary.status).toBe('COMPLETED');
      });
    });

    it('start is rejected for drafts, other clients, unknown and empty days; another running day → WORKOUT_IN_PROGRESS', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const other = await t.client(coach.id);
        const { day, emptyDay } = await t.activePlan(coach.token, client.id);
        const otherPlan = await t.activePlan(coach.token, other.id);
        // a DRAFT plan of the client
        let draft = t.program(
          await t.call('POST', `${T}/clients/${client.id}/programs`, coach.token, {
            title: 'Entwurf',
          }),
        );
        draft = t.program(await t.call('POST', `${T}/programs/${draft.id}/weeks`, coach.token, {}));
        draft = t.program(
          await t.call('POST', `${T}/weeks/${must(draft.weeks[0]).id}/days`, coach.token, {
            title: 'Entwurfstag',
          }),
        );
        const draftDay = must(must(draft.weeks[0]).days[0]);

        for (const id of [draftDay.id, otherPlan.day.id, randomUUID()]) {
          const res = await t.call('POST', W, client.token, { trainingDayId: id });
          expect(res.status, id).toBe(404);
        }
        expect((await t.call('POST', W, client.token, { trainingDayId: emptyDay.id })).status).toBe(
          409,
        );
        expect((await t.call('POST', W, client.token, { clientId: other.id })).status).toBe(400);

        const { session } = await t.start(client.token, day.id);
        // a second day while one is running: explicit conflict, pointing at the running session
        t.program(
          await t.call(
            'POST',
            `${T}/sections/${must(emptyDay.sections[1]).id}/assignments`,
            coach.token,
            {
              exerciseId: otherPlan.pull.id,
              reps: 10,
            },
          ),
        );
        const blocked = await t.call('POST', W, client.token, { trainingDayId: emptyDay.id });
        expect(blocked.status).toBe(409);
        expect(blocked.body).toMatchObject({
          error: {
            code: 'WORKOUT_IN_PROGRESS',
            details: [{ path: 'sessionId', message: session.id }],
          },
        });
        // after abandoning, the other day can start; the abandoned row is kept
        const abandoned = finishWorkoutResponseSchema.parse(
          (await t.call('POST', `${W}/${session.id}/abandon`, client.token)).body,
        );
        expect(abandoned.summary).toMatchObject({ status: 'ABANDONED', completedAt: null });
        expect(abandoned.summary.abandonedAt).not.toBeNull();
        const second = await t.start(client.token, emptyDay.id);
        expect(second.status).toBe(201);
        expect(byMode(second.session, 'SETS_REPS').sets).toHaveLength(1);
      });
    });

    it('records sets/reps, total reps, duration and custom; targets are not writable; progress follows stored state', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { day } = await t.activePlan(coach.token, client.id);
        const { session } = await t.start(client.token, day.id);
        const path = (id: string) => `${W}/${session.id}/exercises/${id}`;
        const update = async (url: string, body: unknown) => {
          const res = await t.call('PATCH', url, client.token, body);
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          return workoutExecutionUpdateResponseSchema.parse(res.body);
        };
        const sets = byMode(session, 'SETS_REPS');
        // sets: ticking all four completes the exercise; un-ticking one reopens it
        let r = await update(`${path(sets.id)}/sets/1`, {
          completed: true,
          actualReps: 12,
          actualWeight: 7.5,
        });
        expect(r.exercise.status).toBe('PENDING');
        expect(r.exercise.sets[0]).toMatchObject({
          completed: true,
          actualReps: 12,
          actualWeight: 7.5,
        });
        for (const n of [2, 3, 4])
          r = await update(`${path(sets.id)}/sets/${n}`, { completed: true });
        expect(r.exercise.status).toBe('COMPLETED');
        expect(r.progress.currentExerciseId).toBe(byMode(session, 'TOTAL_REPS').id);
        r = await update(`${path(sets.id)}/sets/4`, { completed: false });
        expect(r.exercise.status).toBe('PENDING');
        r = await update(`${path(sets.id)}/sets/4`, { completed: true, actualReps: 10 });
        expect(r.exercise).toMatchObject({ status: 'COMPLETED' });
        expect(
          (await t.call('PATCH', `${path(sets.id)}/sets/5`, client.token, { completed: true }))
            .status,
        ).toBe(404);
        expect(
          (await t.call('PATCH', path(sets.id), client.token, { actualReps: 40 })).status,
        ).toBe(400);
        // total reps
        const total = byMode(session, 'TOTAL_REPS');
        r = await update(path(total.id), { actualReps: 70, status: 'COMPLETED' });
        expect(r.exercise).toMatchObject({ status: 'COMPLETED', actualReps: 70 });
        expect(r.exercise.completedAt).not.toBeNull();
        // duration
        const timed = byMode(session, 'DURATION');
        r = await update(path(timed.id), { actualDurationSeconds: 45, status: 'COMPLETED' });
        expect(r.exercise).toMatchObject({ status: 'COMPLETED', actualDurationSeconds: 45 });
        // custom: done without numbers; then skipped instead
        const custom = byMode(session, 'CUSTOM');
        r = await update(path(custom.id), { status: 'COMPLETED' });
        expect(r.progress).toMatchObject({ completed: 4, currentExerciseId: null });
        r = await update(path(custom.id), { status: 'SKIPPED' });
        expect(r.exercise.completedAt).toBeNull();
        expect(r.progress).toMatchObject({ completed: 3, skipped: 1 });
        // snapshot targets can never be written; invalid values rejected
        for (const body of [
          { sets: 10 },
          { restSeconds: 5 },
          { name: 'x' },
          {},
          { actualReps: -1 },
          { actualWeight: 1.234 },
          { status: 'DONE' },
        ]) {
          expect(
            (await t.call('PATCH', path(total.id), client.token, body)).status,
            JSON.stringify(body),
          ).toBe(400);
        }
        const after = must(
          currentWorkoutResponseSchema.parse(
            (await t.call('GET', `${W}/current`, client.token)).body,
          ).session,
        );
        expect(byMode(after, 'SETS_REPS').target).toMatchObject({
          sets: 4,
          reps: 12,
          restSeconds: 60,
        });
        expect(after.progress).toMatchObject({ total: 4, completed: 3, skipped: 1 });
      });
    });

    it('completes with skipped/open exercises, returns the summary, is retry-safe and then read-only; history lists it', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { day } = await t.activePlan(coach.token, client.id);
        const { session } = await t.start(client.token, day.id);
        const ex = (mode: string) => `${W}/${session.id}/exercises/${byMode(session, mode).id}`;
        await t.call('PATCH', ex('TOTAL_REPS'), client.token, {
          status: 'COMPLETED',
          actualReps: 70,
        });
        await t.call('PATCH', ex('DURATION'), client.token, { status: 'SKIPPED' });

        const res = await t.call('POST', `${W}/${session.id}/complete`, client.token);
        expect(res.status).toBe(200);
        const { summary } = finishWorkoutResponseSchema.parse(res.body);
        expect(summary).toMatchObject({
          id: session.id,
          status: 'COMPLETED',
          dayTitle: 'Oberkörper A',
          exercisesTotal: 4,
          exercisesCompleted: 1,
          exercisesSkipped: 1,
        });
        expect(summary.durationSeconds).toBeGreaterThanOrEqual(0);
        // retry-safe, then immutable
        const retry = await t.call('POST', `${W}/${session.id}/complete`, client.token);
        expect(retry.status).toBe(200);
        expect(finishWorkoutResponseSchema.parse(retry.body).summary.completedAt).toBe(
          summary.completedAt,
        );
        expect((await t.call('POST', `${W}/${session.id}/abandon`, client.token)).status).toBe(409);
        expect(
          (await t.call('PATCH', ex('CUSTOM'), client.token, { status: 'COMPLETED' })).status,
        ).toBe(409);
        expect(
          currentWorkoutResponseSchema.parse(
            (await t.call('GET', `${W}/current`, client.token)).body,
          ).session,
        ).toBeNull();
        const history = workoutSessionSummaryListSchema.parse(
          (await t.call('GET', W, client.token)).body,
        );
        expect(history.items.map((i) => [i.id, i.status])).toEqual([[session.id, 'COMPLETED']]);
        // stored state matches (status/timestamp constraint)
        const [row] = await tx
          .select()
          .from(schema.workoutSessions)
          .where(eq(schema.workoutSessions.id, session.id));
        expect(row?.completedAt).not.toBeNull();
      });
    });

    it('resume survives a new login (another device) — server state, not app state', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const { day } = await t.activePlan(coach.token, client.id);
        const { session } = await t.start(client.token, day.id);
        const sets = byMode(session, 'SETS_REPS');
        await t.call('PATCH', `${W}/${session.id}/exercises/${sets.id}/sets/1`, client.token, {
          completed: true,
        });
        const res = await t.call('POST', '/v1/auth/login', undefined, {
          email: client.email,
          password: PASSWORD,
          clientType: 'MOBILE',
        });
        const fresh = authSessionResponseSchema.parse(res.body).tokens.accessToken;
        const current = must(
          currentWorkoutResponseSchema.parse((await t.call('GET', `${W}/current`, fresh)).body)
            .session,
        );
        expect(current.id).toBe(session.id);
        expect(byMode(current, 'SETS_REPS').sets[0]?.completed).toBe(true);
      });
    });

    it('object authorization: other clients get 404 for every id; coaches see only their clients; roles are gated', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const clientA = await t.client(coachA.id);
        const clientB = await t.client(coachB.id);
        const admin = await t.user('ADMIN');
        const planA = await t.activePlan(coachA.token, clientA.id);
        const { session } = await t.start(clientA.token, planA.day.id);
        const sets = byMode(session, 'SETS_REPS');
        const base = `${W}/${session.id}`;
        const probes: [string, string, unknown?][] = [
          ['GET', base],
          ['PATCH', `${base}/exercises/${sets.id}`, { status: 'COMPLETED' }],
          ['PATCH', `${base}/exercises/${sets.id}/sets/1`, { completed: true }],
          ['POST', `${base}/complete`],
          ['POST', `${base}/abandon`],
        ];
        for (const [method, path, body] of probes) {
          const res = await t.call(method, path, clientB.token, body);
          expect(res.status, `${method} ${path}`).toBe(404);
        }
        // B can not start A's day; B's own lists stay empty
        expect(
          (await t.call('POST', W, clientB.token, { trainingDayId: planA.day.id })).status,
        ).toBe(404);
        expect(
          currentWorkoutResponseSchema.parse(
            (await t.call('GET', `${W}/current`, clientB.token)).body,
          ).session,
        ).toBeNull();
        expect(
          workoutSessionSummaryListSchema.parse((await t.call('GET', W, clientB.token)).body).items,
        ).toEqual([]);
        // nothing of A changed through B's attempts
        const intact = workoutSessionSchema.parse((await t.call('GET', base, clientA.token)).body);
        expect(intact.status).toBe('IN_PROGRESS');
        expect(byMode(intact, 'SETS_REPS').sets.every((s) => !s.completed)).toBe(true);

        // coach visibility (read-only summaries through the client scope)
        const summaries = `${T}/clients/${clientA.id}/workouts`;
        const forCoachA = workoutSessionSummaryListSchema.parse(
          (await t.call('GET', summaries, coachA.token)).body,
        );
        expect(forCoachA.items.map((i) => i.id)).toEqual([session.id]);
        expect((await t.call('GET', summaries, coachB.token)).status).toBe(404);
        expect((await t.call('GET', summaries, admin.token)).status).toBe(200);
        expect((await t.call('GET', summaries, clientA.token)).status).toBe(403);
        // coaches/admins have no self workouts; coaches lack the client permission entirely
        expect((await t.call('GET', `${W}/current`, coachA.token)).status).toBe(403);
        expect(
          (await t.call('POST', W, coachA.token, { trainingDayId: planA.day.id })).status,
        ).toBe(403);
        expect((await t.call('GET', base, admin.token)).status).toBe(404);
        expect((await t.call('GET', `${W}/current`)).status).toBe(401);
      });
    });
    it('client notes: own session + exercises (also after finishing); coaches/admins read them only, in scope', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const clientA = await t.client(coachA.id);
        const clientB = await t.client(coachB.id);
        const admin = await t.user('ADMIN');
        const plan = await t.activePlan(coachA.token, clientA.id);
        const { session } = await t.start(clientA.token, plan.day.id);
        const sets = byMode(session, 'SETS_REPS');
        const plank = byMode(session, 'DURATION');
        const base = `${W}/${session.id}`;
        expect(session.clientNote).toBeNull();
        expect(sets.clientNote).toBeNull();

        const note = (path: string, token: string, value: string | null) =>
          t.call('PUT', path, token, { note: value });
        const saved = await note(
          `${base}/exercises/${sets.id}/note`,
          clientA.token,
          '  Schulter zwickt ab Satz 3.  ',
        );
        expect(saved.status, JSON.stringify(saved.body)).toBe(200);
        expect(workoutNoteResponseSchema.parse(saved.body).clientNote).toBe(
          'Schulter zwickt ab Satz 3.',
        );
        expect(
          (await note(`${base}/exercises/${plank.id}/note`, clientA.token, 'Leicht.')).status,
        ).toBe(200);
        expect((await note(`${base}/note`, clientA.token, 'Guter Tag, wenig Schlaf.')).status).toBe(
          200,
        );
        // empty note removes it
        const cleared = workoutNoteResponseSchema.parse(
          (await note(`${base}/exercises/${plank.id}/note`, clientA.token, '   ')).body,
        );
        expect(cleared).toEqual({ clientNote: null, clientNoteUpdatedAt: null });
        // other client: same 404 as unknown ids, nothing written
        expect((await note(`${base}/note`, clientB.token, 'fremd')).status).toBe(404);
        expect(
          (await note(`${base}/exercises/${sets.id}/note`, clientB.token, 'fremd')).status,
        ).toBe(404);
        // coaches/admins have no write path
        expect((await note(`${base}/note`, coachA.token, 'Coach')).status).toBe(403);
        expect((await note(`${base}/note`, admin.token, 'Admin')).status).toBe(404);

        // still writable after finishing (a remark, not a recorded result)
        expect((await t.call('POST', `${base}/complete`, clientA.token)).status).toBe(200);
        expect(
          (await note(`${base}/exercises/${plank.id}/note`, clientA.token, 'Danach: Bauch müde.'))
            .status,
        ).toBe(200);

        const own = workoutSessionSchema.parse((await t.call('GET', base, clientA.token)).body);
        expect(own.clientNote).toBe('Guter Tag, wenig Schlaf.');
        expect(byMode(own, 'SETS_REPS').clientNote).toBe('Schulter zwickt ab Satz 3.');
        expect(byMode(own, 'DURATION').clientNote).toBe('Danach: Bauch müde.');

        // coach/admin: summary counts notes; detail shows which note sits under which exercise
        const list = workoutSessionSummaryListSchema.parse(
          (await t.call('GET', `${T}/clients/${clientA.id}/workouts`, coachA.token)).body,
        );
        expect(must(list.items[0]).notesCount).toBe(3);
        const detailPath = `${T}/clients/${clientA.id}/workouts/${session.id}`;
        const detail = workoutSessionSchema.parse(
          (await t.call('GET', detailPath, coachA.token)).body,
        );
        expect(detail.clientNote).toBe('Guter Tag, wenig Schlaf.');
        expect(
          detail.exercises.filter((e) => e.clientNote).map((e) => [e.executionMode, e.clientNote]),
        ).toEqual([
          ['SETS_REPS', 'Schulter zwickt ab Satz 3.'],
          ['DURATION', 'Danach: Bauch müde.'],
        ]);
        expect((await t.call('GET', detailPath, admin.token)).status).toBe(200);
        expect((await t.call('GET', detailPath, coachB.token)).status).toBe(404);
        expect((await t.call('GET', detailPath, clientA.token)).status).toBe(403);
        // a session id under another (accessible) client is not found
        expect(
          (await t.call('GET', `${T}/clients/${clientB.id}/workouts/${session.id}`, admin.token))
            .status,
        ).toBe(404);
      });
    });
    it('dashboard: numbers, notes and sessions are scoped to the coach; clients have no access', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const clientA = await t.client(coachA.id);
        const clientB = await t.client(coachB.id);
        const planA = await t.activePlan(coachA.token, clientA.id);
        const planB = await t.activePlan(coachB.token, clientB.id);
        const a = (await t.start(clientA.token, planA.day.id)).session;
        await t.call('PUT', `${W}/${a.id}/note`, clientA.token, { note: 'Gut geschlafen.' });
        expect((await t.call('POST', `${W}/${a.id}/complete`, clientA.token)).status).toBe(200);
        const b = (await t.start(clientB.token, planB.day.id)).session;
        await t.call('POST', `${W}/${b.id}/complete`, clientB.token);

        const dashA = adminDashboardSchema.parse(
          (await t.call('GET', '/v1/admin/dashboard', coachA.token)).body,
        );
        expect(dashA.kpis).toMatchObject({
          activeClients: 1,
          totalClients: 1,
          activePrograms: 1,
          sessionsThisWeek: 1,
          notesLast7Days: 1,
        });
        expect(dashA.sessionsPerWeek).toHaveLength(8);
        expect(dashA.recentSessions.map((s) => s.sessionId)).toEqual([a.id]);
        expect(dashA.recentNotes.map((n) => [n.sessionId, n.excerpt, n.exerciseName])).toEqual([
          [a.id, 'Gut geschlafen.', null],
        ]);
        const dashB = adminDashboardSchema.parse(
          (await t.call('GET', '/v1/admin/dashboard', coachB.token)).body,
        );
        expect(dashB.recentSessions.map((s) => s.sessionId)).toEqual([b.id]);
        expect(dashB.recentNotes).toEqual([]);
        expect((await t.call('GET', '/v1/admin/dashboard', clientA.token)).status).toBe(403);
        expect((await t.call('GET', '/v1/admin/dashboard')).status).toBe(401);
      });
    });
  },
);
