import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  adminProgramSchema,
  clientActiveTrainingResponseSchema,
  currentWorkoutResponseSchema,
  recordWorkoutSetResponseSchema,
  startWorkoutResponseSchema,
  workoutExecutionUpdateResponseSchema,
  workoutSessionSchema,
  workoutSessionSummaryListSchema,
  type AdminProgram,
  type WorkoutSession,
  type WorkoutSessionExercise,
} from '@vitruv/contracts';
import {
  assertIsolatedServer,
  createDatabase,
  migrateIsolated,
  recreateIsolatedDatabase,
  schema,
  verifiedIsolatedBase,
  type DatabaseHandle,
} from '@vitruv/db';
import { intervalPlan, type UserRole } from '@vitruv/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyTemplateForDay, type TemplateSource } from '../src/modules/training/template-copy';
import { buildTestApp, principalResolver } from './helpers';

/**
 * Sprint 2.5 — Training v2 end-to-end on a REAL, ISOLATED PostgreSQL (never production):
 * HTTP routes → services → SQL, with a real connection pool, so row locks, the partial unique index
 * and concurrent requests are exercised for real (not the in-memory fake). Data here is COMMITTED
 * into throw-away databases (vitruv_it_v2 / vitruv_it_legacy_api) that are recreated per run.
 * Fictional people and values only.
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const LEGACY_FIXTURE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'db',
  'test',
  'fixtures',
  'legacy-0021.sql',
);

type Res = { status: number; body: Record<string, unknown> };
let storageDir: string;

async function freshDatabase(name: string, throughTag?: string, between?: string) {
  const base = await verifiedIsolatedBase(process.env);
  const url = await recreateIsolatedDatabase(base, name);
  await migrateIsolated(url, throughTag);
  if (between !== undefined) {
    const seed = createDatabase(url, { maxConnections: 1 });
    try {
      await seed.db.execute(sql.raw(between));
    } finally {
      await seed.close();
    }
    await migrateIsolated(url);
  }
  const handle = createDatabase(url, { maxConnections: 16, connectionTimeoutMs: 15_000 });
  const probe = await handle.db.execute(
    sql.raw(
      "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
    ),
  );
  await assertIsolatedServer({ query: async () => ({ rows: probe.rows }) });
  return handle;
}

function api(handle: DatabaseHandle, role: UserRole, userId: string) {
  const app = buildTestApp({
    db: handle.db,
    storageDir,
    bodyLimitBytes: 1_048_576,
    auth: principalResolver(role, userId),
    // Sprint 2 types are exercised here as in staging/test (production default stays OFF).
    extendedTypes: true,
  });
  return async (method: string, path: string, body?: unknown): Promise<Res> => {
    const res = await app.request(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  };
}
type Call = ReturnType<typeof api>;

function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}
const ok = (res: Res, status = 200) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  return res.body;
};

async function people(handle: DatabaseHandle) {
  const user = async (role: UserRole, name: string) => {
    const [row] = await handle.db
      .insert(schema.users)
      .values({
        email: `it-v2-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
        role,
        status: 'ACTIVE',
        displayName: name,
      })
      .returning();
    return must(row).id;
  };
  const coach = await user('COACH', 'coach');
  const otherCoach = await user('COACH', 'coach-zwei');
  await handle.db.insert(schema.coachProfiles).values([
    { userId: coach, displayName: 'Coach Eins' },
    { userId: otherCoach, displayName: 'Coach Zwei' },
  ]);
  const client = async (name: string) => {
    const id = await user('CLIENT', name);
    await handle.db
      .insert(schema.clientProfiles)
      .values({ userId: id, firstName: 'Fiktiv', lastName: name });
    await handle.db
      .insert(schema.coachClientAssignments)
      .values({ coachUserId: coach, clientUserId: id });
    return id;
  };
  return { coach, otherCoach, clientA: await client('Anna'), clientB: await client('Bert') };
}

/** Coach builds a plan through the real admin API (validation + storage rules included). */
async function buildPlan(
  coach: Call,
  clientId: string,
  days: { title: string; assignments: { section: string; body: Record<string, unknown> }[] }[],
) {
  const exerciseIds = new Map<string, string>();
  const exercise = async (name: string) => {
    const known = exerciseIds.get(name);
    if (known) return known;
    const created = adminExerciseSchema.parse(
      ok(
        await coach('POST', `${T}/exercises`, {
          name: `${name} ${randomUUID().slice(0, 6)}`,
          description: `Fiktive Ausführung ${name}.`,
        }),
        201,
      ),
    );
    exerciseIds.set(name, created.id);
    return created.id;
  };
  const parse = (res: Res) => {
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return adminProgramSchema.parse(res.body);
  };
  let p = parse(await coach('POST', `${T}/clients/${clientId}/programs`, { title: 'V2 Plan' }));
  p = parse(await coach('POST', `${T}/programs/${p.id}/weeks`, {}));
  const weekId = must(p.weeks[0]).id;
  for (const day of days) {
    p = parse(await coach('POST', `${T}/weeks/${weekId}/days`, { title: day.title }));
  }
  for (const [index, day] of days.entries()) {
    const sections = must(must(p.weeks[0]).days[index]).sections;
    for (const assignment of day.assignments) {
      const section = must(
        sections.find((s) => s.type === assignment.section),
        assignment.section,
      );
      const exerciseId = await exercise(String(assignment.body.name));
      const { name: _name, ...body } = assignment.body;
      p = parse(
        await coach('POST', `${T}/sections/${section.id}/assignments`, { exerciseId, ...body }),
      );
    }
  }
  ok(await coach('POST', `${T}/programs/${p.id}/activate`));
  return parse(await coach('GET', `${T}/programs/${p.id}`));
}

const dayOf = (p: AdminProgram, index = 0) => must(must(p.weeks[0]).days[index]);
const exerciseNamed = (session: WorkoutSession, prefix: string): WorkoutSessionExercise =>
  must(
    session.exercises.find((e) => e.name.startsWith(prefix)),
    prefix,
  );

// =============================================================================================

describe('Training v2 on real PostgreSQL (isolated)', () => {
  let handle: DatabaseHandle;
  let ids: Awaited<ReturnType<typeof people>>;
  let coach: Call;
  let clientA: Call;
  let clientB: Call;
  let otherCoach: Call;
  let plan: AdminProgram;
  let session: WorkoutSession;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-v2-pg-'));
    handle = await freshDatabase('vitruv_it_v2');
    ids = await people(handle);
    coach = api(handle, 'COACH', ids.coach);
    otherCoach = api(handle, 'COACH', ids.otherCoach);
    clientA = api(handle, 'CLIENT', ids.clientA);
    clientB = api(handle, 'CLIENT', ids.clientB);
    plan = await buildPlan(coach, ids.clientA, [
      {
        title: 'Ganzkörper',
        assignments: [
          { section: 'WARMUP', body: { name: 'Mobilisation', executionType: 'CHECKLIST' } },
          {
            section: 'WARMUP',
            body: {
              name: 'Seilspringen',
              executionType: 'CHECKLIST',
              prescriptionText: '2 Runden locker',
            },
          },
          {
            section: 'MAIN',
            body: {
              name: 'Klimmzüge',
              executionType: 'STRENGTH',
              sets: 4,
              reps: 8,
              restSeconds: 90,
            },
          },
          {
            section: 'MAIN',
            body: {
              name: 'Kniebeuge',
              executionType: 'STRENGTH',
              sets: 3,
              repsMax: true,
              restSeconds: 120,
              targetWeight: 60,
              weightUnit: 'KG',
            },
          },
          {
            section: 'MAIN',
            body: {
              name: 'Liegestütze',
              executionType: 'TOTAL_REPS',
              totalReps: 60,
              restSeconds: 60,
            },
          },
          { section: 'FINISHER', body: { name: 'Plank', executionType: 'INTERVAL' } },
        ],
      },
    ]);
  });
  afterAll(async () => {
    await handle?.close();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------------------------
  it('coach storage: interval defaults and the hidden warm-up text are stored in the plan', async () => {
    const rows = await handle.db
      .select({
        executionType: schema.trainingExerciseAssignments.executionType,
        sets: schema.trainingExerciseAssignments.sets,
        reps: schema.trainingExerciseAssignments.reps,
        repsMax: schema.trainingExerciseAssignments.repsMax,
        durationSeconds: schema.trainingExerciseAssignments.durationSeconds,
        restSeconds: schema.trainingExerciseAssignments.restSeconds,
        prescriptionText: schema.trainingExerciseAssignments.prescriptionText,
      })
      .from(schema.trainingExerciseAssignments)
      .innerJoin(
        schema.trainingSections,
        eq(schema.trainingSections.id, schema.trainingExerciseAssignments.sectionId),
      )
      .where(eq(schema.trainingSections.dayId, dayOf(plan).id))
      .orderBy(
        asc(schema.trainingSections.sortOrder),
        asc(schema.trainingExerciseAssignments.sortOrder),
      );
    expect(rows).toEqual([
      {
        executionType: 'CHECKLIST',
        sets: null,
        reps: null,
        repsMax: false,
        durationSeconds: null,
        restSeconds: null,
        prescriptionText: 'Abhaken',
      },
      {
        executionType: 'CHECKLIST',
        sets: null,
        reps: null,
        repsMax: false,
        durationSeconds: null,
        restSeconds: null,
        prescriptionText: '2 Runden locker',
      },
      {
        executionType: 'STRENGTH',
        sets: 4,
        reps: 8,
        repsMax: false,
        durationSeconds: null,
        restSeconds: 90,
        prescriptionText: null,
      },
      {
        executionType: 'STRENGTH',
        sets: 3,
        reps: null,
        repsMax: true,
        durationSeconds: null,
        restSeconds: 120,
        prescriptionText: null,
      },
      {
        executionType: 'TOTAL_REPS',
        sets: null,
        reps: null,
        repsMax: false,
        durationSeconds: null,
        restSeconds: 60,
        prescriptionText: null,
      },
      {
        executionType: 'INTERVAL',
        sets: 5,
        reps: null,
        repsMax: false,
        durationSeconds: 40,
        restSeconds: 20,
        prescriptionText: null,
      },
    ]);
  });

  it('startWorkout: snapshot, owner, modes, planned rows, timers — the shim never leaks', async () => {
    const res = await clientA('POST', W, { trainingDayId: dayOf(plan).id });
    const started = startWorkoutResponseSchema.parse(ok(res, 201));
    expect(started.resumed).toBe(false);
    session = started.session;
    expect(session.exercises.map((e) => [e.sectionType, e.executionMode])).toEqual([
      ['WARMUP', 'CHECKLIST'],
      ['WARMUP', 'CHECKLIST'],
      ['MAIN', 'SETS_REPS'],
      ['MAIN', 'SETS_REPS'],
      ['MAIN', 'TOTAL_REPS'],
      ['FINISHER', 'INTERVAL'],
    ]);
    const [owner] = await handle.db
      .select({
        client: schema.workoutSessions.clientUserId,
        status: schema.workoutSessions.status,
      })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, session.id));
    expect(owner).toEqual({ client: ids.clientA, status: 'IN_PROGRESS' });

    const [mobil, seil, pull, squat, push, plank] = session.exercises.map((e) => must(e));
    expect(must(mobil).target.prescriptionText).toBeNull();
    expect(must(seil).target.prescriptionText).toBe('2 Runden locker');
    expect(JSON.stringify(res.body)).not.toContain('Abhaken');
    expect(must(mobil).timer).toEqual({ mode: 'NONE', restSeconds: null, interval: null });
    expect(must(mobil).sets).toEqual([]);

    expect(must(pull).sets.map((s) => s.targetReps)).toEqual([8, 8, 8, 8]);
    expect(must(pull).timer).toMatchObject({ mode: 'AUTO_REST', restSeconds: 90 });
    expect(must(squat).target).toMatchObject({
      sets: 3,
      reps: null,
      repsMax: true,
      targetWeight: 60,
    });
    expect(must(squat).sets.map((s) => [s.targetReps, s.targetWeight])).toEqual([
      [null, 60],
      [null, 60],
      [null, 60],
    ]);
    expect(must(push).sets).toEqual([]);
    expect(must(push).totalReps).toEqual({
      target: 60,
      done: 0,
      remaining: 60,
      reached: false,
      setCount: 0,
    });
    expect(must(plank).timer).toEqual({
      mode: 'INTERVAL',
      restSeconds: null, // interval rest lives in `interval` (no single rest timer)
      interval: { rounds: 5, workSeconds: 40, restSeconds: 20 },
    });
    expect(must(plank).sets.map((s) => s.targetDurationSeconds)).toEqual([40, 40, 40, 40, 40]);

    // Stored snapshot rows (not only the DTO).
    const stored = await handle.db
      .select({
        mode: schema.workoutSessionExercises.executionMode,
        repsMax: schema.workoutSessionExercises.repsMax,
        text: schema.workoutSessionExercises.prescriptionText,
      })
      .from(schema.workoutSessionExercises)
      .where(eq(schema.workoutSessionExercises.sessionId, session.id))
      .orderBy(asc(schema.workoutSessionExercises.sortOrder));
    expect(stored.map((row) => row.mode)).toEqual([
      'CHECKLIST',
      'CHECKLIST',
      'SETS_REPS',
      'SETS_REPS',
      'TOTAL_REPS',
      'INTERVAL',
    ]);
    expect(stored[0]?.text).toBe('Abhaken');
    expect(stored[3]?.repsMax).toBe(true);
  });

  it('starting again resumes the same session; /current and a refetch return it', async () => {
    const again = startWorkoutResponseSchema.parse(
      ok(await clientA('POST', W, { trainingDayId: dayOf(plan).id })),
    );
    expect(again).toMatchObject({ resumed: true, session: { id: session.id } });
    const current = currentWorkoutResponseSchema.parse(ok(await clientA('GET', `${W}/current`)));
    expect(current.session?.id).toBe(session.id);
    const count = await handle.db.execute(
      sql`select count(*)::int as n from workout_sessions where client_user_id = ${ids.clientA}`,
    );
    expect(count.rows[0]).toEqual({ n: 1 });
  });

  it('warm-up: reps/duration/weight → 400, ticking off works', async () => {
    const mobil = must(session.exercises[0]);
    const path = `${W}/${session.id}/exercises/${mobil.id}`;
    for (const body of [{ actualReps: 5 }, { actualDurationSeconds: 30 }, { actualWeight: 5 }]) {
      expect((await clientA('PATCH', path, body)).status).toBe(400);
    }
    expect(
      (await clientA('POST', `${path}/sets`, { clientSetId: randomUUID(), actualReps: 3 })).status,
    ).toBe(409);
    const done = workoutExecutionUpdateResponseSchema.parse(
      ok(await clientA('PATCH', path, { status: 'COMPLETED' })),
    );
    expect(done.exercise).toMatchObject({ status: 'COMPLETED', actualReps: null });
    ok(
      await clientA('PATCH', `${W}/${session.id}/exercises/${must(session.exercises[1]).id}`, {
        status: 'COMPLETED',
      }),
    );
  });

  it('strength: upper body sets and lower body MAX record per-set actuals (persisted)', async () => {
    const pull = exerciseNamed(session, 'Klimmzüge');
    const squat = exerciseNamed(session, 'Kniebeuge');
    for (const [n, reps] of [
      [1, 8],
      [2, 8],
      [3, 7],
      [4, 6],
    ] as const) {
      ok(
        await clientA('PATCH', `${W}/${session.id}/exercises/${pull.id}/sets/${n}`, {
          completed: true,
          actualReps: reps,
        }),
      );
    }
    for (const [n, reps] of [
      [1, 15],
      [2, 12],
      [3, 11],
    ] as const) {
      ok(
        await clientA('PATCH', `${W}/${session.id}/exercises/${squat.id}/sets/${n}`, {
          completed: true,
          actualReps: reps,
          actualWeight: 62.5,
        }),
      );
    }
    // Planned sets are not appended dynamically.
    expect(
      (
        await clientA('POST', `${W}/${session.id}/exercises/${pull.id}/sets`, {
          clientSetId: randomUUID(),
          actualReps: 8,
        })
      ).status,
    ).toBe(409);
    const refetched = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
    const pullNow = exerciseNamed(refetched, 'Klimmzüge');
    const squatNow = exerciseNamed(refetched, 'Kniebeuge');
    expect(pullNow.status).toBe('COMPLETED');
    expect(pullNow.sets.map((s) => s.actualReps)).toEqual([8, 8, 7, 6]);
    expect(squatNow.status).toBe('COMPLETED');
    expect(squatNow.sets.map((s) => [s.actualReps, s.actualWeight])).toEqual([
      [15, 62.5],
      [12, 62.5],
      [11, 62.5],
    ]);
  });

  it('total reps 60 / rest 60: 12,10,8,10,12,8 → remaining 48,38,30,20,8,0; no rest after the last set', async () => {
    const push = exerciseNamed(session, 'Liegestütze');
    const path = `${W}/${session.id}/exercises/${push.id}/sets`;
    const seen: [number, number | null, boolean, number][] = [];
    const idsUsed: string[] = [];
    for (const reps of [12, 10, 8, 10, 12, 8]) {
      const clientSetId = randomUUID();
      idsUsed.push(clientSetId);
      const r = recordWorkoutSetResponseSchema.parse(
        ok(await clientA('POST', path, { clientSetId, actualReps: reps }), 201),
      );
      seen.push([must(r.exercise.totalReps).remaining, r.restSeconds, r.created, r.set.setNumber]);
    }
    expect(seen).toEqual([
      [48, 60, true, 1],
      [38, 60, true, 2],
      [30, 60, true, 3],
      [20, 60, true, 4],
      [8, 60, true, 5],
      [0, null, true, 6],
    ]);
    // Target reached → exercise completed, no 7th set, actualReps mirrors the sum.
    expect((await clientA('POST', path, { clientSetId: randomUUID(), actualReps: 5 })).status).toBe(
      409,
    );
    // Network retry of the final set → same answer, nothing new.
    const replay = recordWorkoutSetResponseSchema.parse(
      ok(await clientA('POST', path, { clientSetId: idsUsed[5], actualReps: 8 })),
    );
    expect(replay).toMatchObject({
      created: false,
      restSeconds: null,
      set: { setNumber: 6, actualReps: 8 },
    });
    // Retry of an EARLIER set → its own historic rest (60), not the current state.
    const early = recordWorkoutSetResponseSchema.parse(
      ok(await clientA('POST', path, { clientSetId: idsUsed[1], actualReps: 10 })),
    );
    expect(early).toMatchObject({ created: false, restSeconds: 60, set: { setNumber: 2 } });
    const rows = await handle.db
      .select({
        n: schema.workoutExerciseSets.setNumber,
        reps: schema.workoutExerciseSets.actualReps,
      })
      .from(schema.workoutExerciseSets)
      .where(eq(schema.workoutExerciseSets.sessionExerciseId, push.id))
      .orderBy(asc(schema.workoutExerciseSets.setNumber));
    expect(rows.map((row) => row.reps)).toEqual([12, 10, 8, 10, 12, 8]);
    const [exercise] = await handle.db
      .select({
        status: schema.workoutSessionExercises.status,
        actualReps: schema.workoutSessionExercises.actualReps,
      })
      .from(schema.workoutSessionExercises)
      .where(eq(schema.workoutSessionExercises.id, push.id));
    expect(exercise).toEqual({ status: 'COMPLETED', actualReps: 60 });
  });

  it('core interval 5 × 40/20: 280 s plan, no rest after the last round, rounds recorded per row', async () => {
    const plank = exerciseNamed(session, 'Plank');
    const timeline = intervalPlan(must(must(plank.timer).interval));
    expect(timeline.totalSeconds).toBe(280);
    expect(timeline.phases.at(-1)?.phase).toBe('WORK');
    expect(timeline.phases.filter((p) => p.phase === 'REST')).toHaveLength(4);
    const base = `${W}/${session.id}/exercises/${plank.id}`;
    expect((await clientA('PATCH', base, { actualDurationSeconds: 200 })).status).toBe(400);
    let last: WorkoutSessionExercise | undefined;
    for (const n of [1, 2, 3, 4, 5]) {
      last = workoutExecutionUpdateResponseSchema.parse(
        ok(
          await clientA('PATCH', `${base}/sets/${n}`, {
            completed: true,
            actualDurationSeconds: 40,
          }),
        ),
      ).exercise;
    }
    expect(must(last).status).toBe('COMPLETED');
    expect(must(last).sets.map((s) => s.actualDurationSeconds)).toEqual([40, 40, 40, 40, 40]);
  });

  it('coach edits during and after the session never touch its snapshot; a new start uses the new plan', async () => {
    const before = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
    const live = await coach('GET', `${T}/programs/${plan.id}`);
    const program = adminProgramSchema.parse(ok(live));
    const main = must(dayOf(program).sections.find((s) => s.type === 'MAIN'));
    const pullAssignment = must(main.assignments[0]);
    const pushAssignment = must(main.assignments[2]);
    ok(await coach('PATCH', `${T}/assignments/${pullAssignment.id}`, { reps: 5 }));
    ok(await coach('PATCH', `${T}/assignments/${pushAssignment.id}`, { totalReps: 100 }));
    const warm = must(dayOf(program).sections.find((s) => s.type === 'WARMUP'));
    ok(await coach('DELETE', `${T}/assignments/${must(warm.assignments[1]).id}`));
    const during = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
    const strip = (s: WorkoutSession) =>
      s.exercises.map((e) => ({
        name: e.name,
        target: e.target,
        mode: e.executionMode,
        sets: e.sets,
      }));
    expect(strip(during)).toEqual(strip(before));
    // Complete; the completed session stays identical and is immutable.
    ok(await clientA('POST', `${W}/${session.id}/complete`));
    const completed = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
    expect(completed.status).toBe('COMPLETED');
    expect(strip(completed)).toEqual(strip(before));
    const push = exerciseNamed(completed, 'Liegestütze');
    const pull = exerciseNamed(completed, 'Klimmzüge');
    for (const [method, path, body] of [
      [
        'POST',
        `${W}/${session.id}/exercises/${push.id}/sets`,
        { clientSetId: randomUUID(), actualReps: 1 },
      ],
      ['PATCH', `${W}/${session.id}/exercises/${pull.id}/sets/1`, { actualReps: 1 }],
      ['PATCH', `${W}/${session.id}/exercises/${pull.id}`, { status: 'SKIPPED' }],
      ['POST', `${W}/${session.id}/abandon`, undefined],
    ] as const) {
      expect((await clientA(method, path, body)).status, `${method} ${path}`).toBe(409);
    }
    // Even an exact retry of an already stored set is refused once the session is completed.
    const firstPushSet = must(push.sets[0]);
    expect(
      (
        await clientA('POST', `${W}/${session.id}/exercises/${push.id}/sets`, {
          clientSetId: firstPushSet.clientSetId,
          actualReps: firstPushSet.actualReps,
        })
      ).status,
    ).toBe(409);
    const after = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
    expect(strip(after)).toEqual(strip(completed));

    const next = startWorkoutResponseSchema.parse(
      ok(await clientA('POST', W, { trainingDayId: dayOf(plan).id }), 201),
    );
    expect(next.session.id).not.toBe(session.id);
    expect(exerciseNamed(next.session, 'Klimmzüge').target.reps).toBe(5);
    expect(exerciseNamed(next.session, 'Liegestütze').target.totalReps).toBe(100);
    expect(next.session.exercises).toHaveLength(5);
    ok(await clientA('POST', `${W}/${next.session.id}/abandon`));
  });

  it('authorization: other client 404, unassigned coach 404, client on admin routes 403', async () => {
    const pushId = exerciseNamed(session, 'Liegestütze').id;
    for (const [method, path, body] of [
      ['GET', `${W}/${session.id}`, undefined],
      [
        'POST',
        `${W}/${session.id}/exercises/${pushId}/sets`,
        { clientSetId: randomUUID(), actualReps: 1 },
      ],
      ['PATCH', `${W}/${session.id}/exercises/${pushId}`, { status: 'COMPLETED' }],
      ['POST', `${W}/${session.id}/complete`, undefined],
    ] as const) {
      expect((await clientB(method, path, body)).status, `${method} ${path}`).toBe(404);
    }
    const summaries = workoutSessionSummaryListSchema.parse(
      ok(await coach('GET', `${T}/clients/${ids.clientA}/workouts`)),
    );
    expect(summaries.items.map((item) => item.id)).toContain(session.id);
    expect((await coach('GET', `${T}/clients/${ids.clientA}/workouts/${session.id}`)).status).toBe(
      200,
    );
    expect((await otherCoach('GET', `${T}/clients/${ids.clientA}/workouts`)).status).toBe(404);
    expect(
      (await otherCoach('GET', `${T}/clients/${ids.clientA}/workouts/${session.id}`)).status,
    ).toBe(404);
    expect((await clientA('GET', `${T}/clients/${ids.clientA}/workouts`)).status).toBe(403);
    expect((await coach('POST', W, { trainingDayId: dayOf(plan).id })).status).toBe(403);
  });

  // -------------------------------------------------------------------------------------------
  describe('idempotency and concurrency of POST …/sets (real row locks, real unique index)', () => {
    let bSession: WorkoutSession;
    const exPath = (prefix: string) =>
      `${W}/${bSession.id}/exercises/${exerciseNamed(bSession, prefix).id}/sets`;
    const setRows = (prefix: string) =>
      handle.db
        .select({
          n: schema.workoutExerciseSets.setNumber,
          reps: schema.workoutExerciseSets.actualReps,
          weight: schema.workoutExerciseSets.actualWeight,
          id: schema.workoutExerciseSets.clientSetId,
        })
        .from(schema.workoutExerciseSets)
        .where(eq(schema.workoutExerciseSets.sessionExerciseId, exerciseNamed(bSession, prefix).id))
        .orderBy(asc(schema.workoutExerciseSets.setNumber));

    beforeAll(async () => {
      const bPlan = await buildPlan(coach, ids.clientB, [
        {
          title: 'Total',
          assignments: ['Dips', 'Rudern', 'Ausfallschritte', 'Burpees', 'Situps'].map((name) => ({
            section: 'MAIN',
            body: { name, executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 45 },
          })),
        },
      ]);
      bSession = startWorkoutResponseSchema.parse(
        ok(await clientB('POST', W, { trainingDayId: dayOf(bPlan).id }), 201),
      ).session;
    });

    it('same request twice → 201 then 200, one row', async () => {
      const body = { clientSetId: randomUUID(), actualReps: 10, actualWeight: 5 };
      const first = recordWorkoutSetResponseSchema.parse(
        ok(await clientB('POST', exPath('Dips'), body), 201),
      );
      const second = recordWorkoutSetResponseSchema.parse(
        ok(await clientB('POST', exPath('Dips'), body)),
      );
      expect(second.created).toBe(false);
      expect(second.set).toEqual(first.set);
      expect(second.restSeconds).toBe(first.restSeconds);
      expect(await setRows('Dips')).toHaveLength(1);
    });

    it('same clientSetId with a DIFFERENT payload is refused (409), never merged', async () => {
      const clientSetId = randomUUID();
      ok(await clientB('POST', exPath('Dips'), { clientSetId, actualReps: 10 }), 201);
      for (const body of [
        { clientSetId, actualReps: 11 },
        { clientSetId, actualReps: 10, actualWeight: 20 },
      ]) {
        expect((await clientB('POST', exPath('Dips'), body)).status).toBe(409);
      }
      const rows = (await setRows('Dips')).filter((row) => row.id === clientSetId);
      expect(rows).toEqual([{ n: 2, reps: 10, weight: null, id: clientSetId }]);
    });

    it('8 concurrent identical requests → exactly one row, one 201, seven 200', async () => {
      const body = { clientSetId: randomUUID(), actualReps: 7 };
      const results = await Promise.all(
        Array.from({ length: 8 }, () => clientB('POST', exPath('Rudern'), body)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
      const sets = results.map((r) => recordWorkoutSetResponseSchema.parse(r.body).set);
      expect(new Set(sets.map((s) => s.setNumber))).toEqual(new Set([1]));
      expect(await setRows('Rudern')).toEqual([
        { n: 1, reps: 7, weight: null, id: body.clientSetId },
      ]);
    });

    it('10 concurrent different sets of 10 on target 60 → 6 stored (1..6), 4 × 409, never over target', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          clientB('POST', exPath('Ausfallschritte'), { clientSetId: randomUUID(), actualReps: 10 }),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(6);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);
      const rows = await setRows('Ausfallschritte');
      expect(rows.map((row) => row.n)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(rows.reduce((sum, row) => sum + (row.reps ?? 0), 0)).toBe(60);
      const rests = results
        .filter((r) => r.status === 201)
        .map((r) => recordWorkoutSetResponseSchema.parse(r.body))
        .sort((a, b) => a.set.setNumber - b.set.setNumber)
        .map((r) => r.restSeconds);
      expect(rests).toEqual([45, 45, 45, 45, 45, null]);
    });

    it('mixed concurrent writes on several exercises of one session: no deadlock, consistent totals', async () => {
      const deadlocksBefore = await handle.db.execute(
        sql`select deadlocks::int as n from pg_stat_database where datname = current_database()`,
      );
      const jobs = [
        ...Array.from(
          { length: 6 },
          () => () =>
            clientB('POST', exPath('Burpees'), { clientSetId: randomUUID(), actualReps: 5 }),
        ),
        ...Array.from(
          { length: 6 },
          () => () =>
            clientB('POST', exPath('Situps'), { clientSetId: randomUUID(), actualReps: 5 }),
        ),
        () => clientB('GET', `${W}/${bSession.id}`),
        () => clientB('PUT', `${W}/${bSession.id}/note`, { note: 'Fiktive Notiz' }),
      ];
      const results = await Promise.all(jobs.map((job) => job()));
      for (const r of results) expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
      expect(await setRows('Burpees')).toHaveLength(6);
      expect(await setRows('Situps')).toHaveLength(6);
      const after = workoutSessionSchema.parse(ok(await clientB('GET', `${W}/${bSession.id}`)));
      expect(must(exerciseNamed(after, 'Burpees').totalReps).done).toBe(30);
      expect(exerciseNamed(after, 'Burpees').actualReps).toBe(30);
      const deadlocksAfter = await handle.db.execute(
        sql`select deadlocks::int as n from pg_stat_database where datname = current_database()`,
      );
      expect(deadlocksAfter.rows[0]).toEqual(deadlocksBefore.rows[0]);
    });

    it('different owners: a client set id is scoped to its exercise; foreign session → 404', async () => {
      const fresh = workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${session.id}`)));
      const aSet = must(exerciseNamed(fresh, 'Liegestütze').sets[0]);
      // Client B reuses client A's id on B's own exercise → independent new set.
      ok(
        await clientB('POST', exPath('Dips'), { clientSetId: aSet.clientSetId, actualReps: 3 }),
        201,
      );
      // B can neither read nor replay A's set through A's session.
      expect(
        (
          await clientB(
            'POST',
            `${W}/${session.id}/exercises/${exerciseNamed(session, 'Liegestütze').id}/sets`,
            { clientSetId: aSet.clientSetId, actualReps: aSet.actualReps },
          )
        ).status,
      ).toBe(404);
      // B's exercise id through A's own (COMPLETED) session → 409 "already finished", exactly the
      // answer a random id gets: the status check comes first, nothing about B is revealed.
      const bEx = exerciseNamed(bSession, 'Dips').id;
      for (const exerciseId of [bEx, randomUUID()]) {
        expect(
          (
            await clientA('POST', `${W}/${session.id}/exercises/${exerciseId}/sets`, {
              clientSetId: randomUUID(),
              actualReps: 1,
            })
          ).status,
        ).toBe(409);
      }
      // … and B's session addressed by A → 404 (self context).
      expect(
        (
          await clientA('POST', `${W}/${bSession.id}/exercises/${bEx}/sets`, {
            clientSetId: randomUUID(),
            actualReps: 1,
          })
        ).status,
      ).toBe(404);
      const [aRow] = await handle.db
        .select({ reps: schema.workoutExerciseSets.actualReps })
        .from(schema.workoutExerciseSets)
        .where(eq(schema.workoutExerciseSets.clientSetId, must(aSet.clientSetId)))
        .orderBy(asc(schema.workoutExerciseSets.createdAt))
        .limit(1);
      expect(aRow?.reps).toBe(aSet.actualReps);
    });

    it('invalid bodies → 400 (missing id, reps < 1, unknown field)', async () => {
      for (const body of [
        { actualReps: 5 },
        { clientSetId: randomUUID(), actualReps: 0 },
        { clientSetId: 'kein-uuid', actualReps: 5 },
        { clientSetId: randomUUID(), actualReps: 5, totalReps: 100 },
      ]) {
        expect((await clientB('POST', exPath('Dips'), body)).status, JSON.stringify(body)).toBe(
          400,
        );
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('template isolation at database level', () => {
    let templateId: string;
    const exerciseIds: string[] = [];

    async function loadTemplate(id: string): Promise<TemplateSource> {
      const [template] = await handle.db
        .select()
        .from(schema.workoutTemplates)
        .where(eq(schema.workoutTemplates.id, id));
      const sections = await handle.db
        .select()
        .from(schema.workoutTemplateSections)
        .where(eq(schema.workoutTemplateSections.templateId, id));
      const result: TemplateSource = {
        id,
        version: must(template).version,
        title: must(template).title,
        sections: [],
      };
      for (const section of sections) {
        const exercises = await handle.db
          .select()
          .from(schema.workoutTemplateExercises)
          .where(eq(schema.workoutTemplateExercises.sectionId, section.id));
        result.sections.push({
          type: section.type,
          title: section.title,
          sortOrder: section.sortOrder,
          exercises: exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sortOrder: e.sortOrder,
            executionType: e.executionType,
            sets: e.sets,
            reps: e.reps,
            repsMax: e.repsMax,
            totalReps: e.totalReps,
            durationSeconds: e.durationSeconds,
            restSeconds: e.restSeconds,
            targetWeight: e.targetWeight,
            weightUnit: e.weightUnit,
            prescriptionText: e.prescriptionText,
            instructionsOverride: e.instructionsOverride,
          })),
        });
      }
      return result;
    }

    /** What the Sprint 3 endpoint will do: insert the copy as NEW rows of one client's program. */
    async function insertCopy(clientId: string, title: string) {
      const copy = copyTemplateForDay(await loadTemplate(templateId), title);
      return handle.db.transaction(async (tx) => {
        const [program] = await tx
          .insert(schema.trainingPrograms)
          .values({
            clientUserId: clientId,
            title: `Vorlage für ${title}`,
            status: 'DRAFT',
            createdByUserId: ids.coach,
          })
          .returning();
        const [week] = await tx
          .insert(schema.trainingWeeks)
          .values({ programId: must(program).id, sortOrder: 0 })
          .returning();
        const [day] = await tx
          .insert(schema.trainingDays)
          .values({ weekId: must(week).id, sortOrder: 0, ...copy.day })
          .returning();
        for (const section of copy.sections) {
          const [row] = await tx
            .insert(schema.trainingSections)
            .values({
              dayId: must(day).id,
              type: section.type,
              title: section.title,
              sortOrder: section.sortOrder,
            })
            .returning();
          if (section.assignments.length > 0) {
            await tx
              .insert(schema.trainingExerciseAssignments)
              .values(section.assignments.map((a) => ({ ...a, sectionId: must(row).id })));
          }
        }
        return { programId: must(program).id, dayId: must(day).id };
      });
    }
    const assignmentsOf = (dayId: string) =>
      handle.db
        .select({
          id: schema.trainingExerciseAssignments.id,
          sets: schema.trainingExerciseAssignments.sets,
          reps: schema.trainingExerciseAssignments.reps,
          type: schema.trainingExerciseAssignments.executionType,
          text: schema.trainingExerciseAssignments.prescriptionText,
        })
        .from(schema.trainingExerciseAssignments)
        .innerJoin(
          schema.trainingSections,
          eq(schema.trainingSections.id, schema.trainingExerciseAssignments.sectionId),
        )
        .where(eq(schema.trainingSections.dayId, dayId))
        .orderBy(
          asc(schema.trainingSections.sortOrder),
          asc(schema.trainingExerciseAssignments.sortOrder),
        );
    const templateExercises = () =>
      handle.db
        .select({
          sets: schema.workoutTemplateExercises.sets,
          reps: schema.workoutTemplateExercises.reps,
          type: schema.workoutTemplateExercises.executionType,
          text: schema.workoutTemplateExercises.prescriptionText,
        })
        .from(schema.workoutTemplateExercises)
        .innerJoin(
          schema.workoutTemplateSections,
          eq(schema.workoutTemplateSections.id, schema.workoutTemplateExercises.sectionId),
        )
        .where(eq(schema.workoutTemplateSections.templateId, templateId))
        .orderBy(
          asc(schema.workoutTemplateSections.sortOrder),
          asc(schema.workoutTemplateExercises.sortOrder),
        );

    beforeAll(async () => {
      const exercises = await handle.db
        .insert(schema.exercises)
        .values([
          { name: 'Vorlage Mobilisation', code: `TV-${randomUUID().slice(0, 6).toUpperCase()}` },
          { name: 'Vorlage Bankdrücken', code: `TV-${randomUUID().slice(0, 6).toUpperCase()}` },
        ])
        .returning();
      exerciseIds.push(...exercises.map((e) => e.id));
      const [template] = await handle.db
        .insert(schema.workoutTemplates)
        .values({ ownerUserId: ids.coach, title: 'Push Tag' })
        .returning();
      templateId = must(template).id;
      const [warm, main] = await handle.db
        .insert(schema.workoutTemplateSections)
        .values([
          { templateId, type: 'WARMUP', sortOrder: 0 },
          { templateId, type: 'MAIN', sortOrder: 1 },
        ])
        .returning();
      await handle.db.insert(schema.workoutTemplateExercises).values([
        {
          sectionId: must(warm).id,
          exerciseId: must(exerciseIds[0]),
          sortOrder: 0,
          executionType: 'CHECKLIST',
        },
        {
          sectionId: must(main).id,
          exerciseId: must(exerciseIds[1]),
          sortOrder: 0,
          executionType: 'STRENGTH',
          sets: 3,
          reps: 10,
          restSeconds: 90,
        },
      ]);
    });

    it('copies are independent of each other and of the template; template edits never reach copies or completed sessions', async () => {
      const a = await insertCopy(ids.clientA, 'Push A');
      const b = await insertCopy(ids.clientB, 'Push B');
      const expected = [
        { sets: null, reps: null, type: 'CHECKLIST', text: 'Abhaken' },
        { sets: 3, reps: 10, type: 'STRENGTH', text: null },
      ];
      expect((await assignmentsOf(a.dayId)).map(({ id: _id, ...rest }) => rest)).toEqual(expected);
      expect((await assignmentsOf(b.dayId)).map(({ id: _id, ...rest }) => rest)).toEqual(expected);
      const [dayA] = await handle.db
        .select()
        .from(schema.trainingDays)
        .where(eq(schema.trainingDays.id, a.dayId));
      expect(dayA).toMatchObject({ sourceTemplateId: templateId, sourceTemplateVersion: 1 });
      // No row is shared (fresh ids everywhere).
      const aIds = (await assignmentsOf(a.dayId)).map((r) => r.id);
      const bIds = (await assignmentsOf(b.dayId)).map((r) => r.id);
      expect(aIds.filter((id) => bIds.includes(id))).toEqual([]);

      // A runs the copied day to completion (program activated by the coach).
      ok(await coach('POST', `${T}/programs/${a.programId}/activate`));
      const started = startWorkoutResponseSchema.parse(
        ok(await clientA('POST', W, { trainingDayId: a.dayId }), 201),
      ).session;
      expect(started).toMatchObject({ sourceTemplateId: templateId, sourceTemplateVersion: 1 });
      ok(await clientA('POST', `${W}/${started.id}/complete`));
      const completedBefore = workoutSessionSchema.parse(
        ok(await clientA('GET', `${W}/${started.id}`)),
      );

      // 1. change A's copy → B and the template unchanged
      await handle.db
        .update(schema.trainingExerciseAssignments)
        .set({ reps: 6 })
        .where(eq(schema.trainingExerciseAssignments.id, must(aIds[1])));
      expect((await assignmentsOf(b.dayId))[1]).toMatchObject({ sets: 3, reps: 10 });
      expect((await templateExercises())[1]).toMatchObject({ sets: 3, reps: 10 });

      // 2. change the template (new version) → both copies and the completed session unchanged
      await handle.db.transaction(async (tx) => {
        await tx
          .update(schema.workoutTemplateExercises)
          .set({ reps: 12, sets: 5 })
          .where(eq(schema.workoutTemplateExercises.executionType, 'STRENGTH'));
        await tx
          .update(schema.workoutTemplates)
          .set({ version: 2 })
          .where(eq(schema.workoutTemplates.id, templateId));
      });
      expect((await assignmentsOf(a.dayId))[1]).toMatchObject({ sets: 3, reps: 6 });
      expect((await assignmentsOf(b.dayId))[1]).toMatchObject({ sets: 3, reps: 10 });
      const completedAfter = workoutSessionSchema.parse(
        ok(await clientA('GET', `${W}/${started.id}`)),
      );
      expect(completedAfter).toEqual(completedBefore);
      expect(completedAfter.sourceTemplateVersion).toBe(1);

      // 3. deleting the template does not touch the copies (no FK from copies to templates)
      await handle.db
        .delete(schema.workoutTemplates)
        .where(and(eq(schema.workoutTemplates.id, templateId)));
      expect(await assignmentsOf(a.dayId)).toHaveLength(2);
      expect(await assignmentsOf(b.dayId)).toHaveLength(2);
      expect(workoutSessionSchema.parse(ok(await clientA('GET', `${W}/${started.id}`)))).toEqual(
        completedBefore,
      );
    });
  });
});

// =============================================================================================

describe('legacy data on an upgraded database (0000–0021 + legacy rows → 0022–0023)', () => {
  const LEGACY = {
    clientA: '10000000-0000-4000-8000-0000000000a1',
    clientB: '10000000-0000-4000-8000-0000000000b1',
    coach: '10000000-0000-4000-8000-0000000000c1',
    completedSession: '10000000-0000-4000-8000-0000000005a1',
    runningSession: '10000000-0000-4000-8000-0000000005b1',
    runningTotalExercise: '10000000-0000-4000-8000-0000000006b1',
    dayA: '10000000-0000-4000-8000-000000000081',
    program: '10000000-0000-4000-8000-0000000000d1',
  };
  let handle: DatabaseHandle;

  beforeAll(async () => {
    storageDir ??= await mkdtemp(join(tmpdir(), 'vitruv-v2-pg-'));
    handle = await freshDatabase(
      'vitruv_it_legacy_api',
      '0021_welcome_videos',
      readFileSync(LEGACY_FIXTURE, 'utf8'),
    );
  });
  afterAll(async () => handle?.close());

  it('the client reads the legacy program; day status derives from the legacy session', async () => {
    const res = await api(handle, 'CLIENT', LEGACY.clientA)('GET', '/v1/client/training/active');
    const active = clientActiveTrainingResponseSchema.parse(ok(res));
    const days = must(active.program).weeks.flatMap((w) => w.days);
    expect(days.map((d) => [d.title, d.workoutStatus])).toEqual([
      ['Legacy Tag A', 'COMPLETED'],
      ['Legacy Tag B', 'NOT_STARTED'],
    ]);
    const exercises = days.flatMap((d) => d.sections.flatMap((s) => s.exercises));
    expect(exercises.map((e) => [e.executionType ?? null, e.repsMax ?? false])).toEqual(
      Array.from({ length: 5 }, () => [null, false]),
    );
    expect(JSON.stringify(res.body)).toContain('2 Runden locker');
  });

  it('the completed legacy session opens unchanged (old modes, results, legacy total)', async () => {
    const s = workoutSessionSchema.parse(
      ok(await api(handle, 'CLIENT', LEGACY.clientA)('GET', `${W}/${LEGACY.completedSession}`)),
    );
    expect(s.status).toBe('COMPLETED');
    expect(s.exercises.map((e) => [e.executionMode, e.status])).toEqual([
      ['CUSTOM', 'COMPLETED'],
      ['SETS_REPS', 'COMPLETED'],
      ['TOTAL_REPS', 'COMPLETED'],
      ['DURATION', 'SKIPPED'],
    ]);
    expect(must(s.exercises[1]).sets.map((x) => [x.actualReps, x.actualWeight])).toEqual(
      Array.from({ length: 4 }, () => [8, 60.5]),
    );
    expect(must(s.exercises[2]).totalReps).toMatchObject({ target: 50, done: 50, reached: true });
    expect(must(s.exercises[0]).target.prescriptionText).toBe('2 Runden locker');
    expect(must(s.exercises[3]).timer).toMatchObject({ mode: 'MANUAL_REST', restSeconds: 15 });
  });

  it('starting a legacy day snapshots with the old derivation rules', async () => {
    const started = startWorkoutResponseSchema.parse(
      ok(
        await api(handle, 'CLIENT', LEGACY.clientA)('POST', W, { trainingDayId: LEGACY.dayA }),
        201,
      ),
    );
    expect(started.session.exercises.map((e) => e.executionMode)).toEqual([
      'CUSTOM',
      'SETS_REPS',
      'TOTAL_REPS',
      'DURATION',
    ]);
    expect(started.session.sourceTemplateId).toBeNull();
  });

  it('a pre-Sprint-2 IN_PROGRESS total (30 of 70, no set rows) is not lost when the new app records a set', async () => {
    const clientB = api(handle, 'CLIENT', LEGACY.clientB);
    const current = currentWorkoutResponseSchema.parse(ok(await clientB('GET', `${W}/current`)));
    const exercise = must(must(current.session).exercises[0]);
    expect(exercise.totalReps).toMatchObject({ target: 70, done: 30, remaining: 40 });
    const recorded = recordWorkoutSetResponseSchema.parse(
      ok(
        await clientB(
          'POST',
          `${W}/${LEGACY.runningSession}/exercises/${LEGACY.runningTotalExercise}/sets`,
          {
            clientSetId: randomUUID(),
            actualReps: 12,
          },
        ),
        201,
      ),
    );
    expect(recorded.exercise.totalReps).toMatchObject({ target: 70, done: 42, remaining: 28 });
    expect(recorded.exercise.actualReps).toBe(42);
    const [row] = await handle.db
      .select({ actualReps: schema.workoutSessionExercises.actualReps })
      .from(schema.workoutSessionExercises)
      .where(eq(schema.workoutSessionExercises.id, LEGACY.runningTotalExercise));
    expect(row?.actualReps).toBe(42);
  });

  it('the legacy coach still sees the legacy history', async () => {
    const list = workoutSessionSummaryListSchema.parse(
      ok(
        await api(handle, 'COACH', LEGACY.coach)('GET', `${T}/clients/${LEGACY.clientA}/workouts`),
      ),
    );
    expect(list.items.map((i) => i.id)).toContain(LEGACY.completedSession);
  });
});
