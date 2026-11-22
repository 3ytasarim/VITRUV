import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  assignTemplateResponseSchema,
  recordWorkoutSetResponseSchema,
  startWorkoutResponseSchema,
  workoutExecutionUpdateResponseSchema,
  workoutSessionSchema,
  workoutTemplateSchema,
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
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from './helpers';

/**
 * Sprint 6 — Gesamt-Wiederholungsziel (TOTAL_REPS) and Core (INTERVAL) as the iPhone app uses
 * them, end-to-end on a REAL, ISOLATED PostgreSQL (never production): one coach workout with
 * Warm-up + Total reps + Strength MAX + Core, the flag OFF/ON, unclipped overshoot, idempotent
 * round completion that survives an app restart, client isolation, the completed-day lock.
 * Fictional people and values. Numbers refer to the Sprint 6 test list
 * (docs/ios-training-sprint6-test-results.md).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const DATE = '2027-04-07'; // a Wednesday
type Res = { status: number; body: Record<string, unknown>; text: string };
type Call = (method: string, path: string, body?: unknown) => Promise<Res>;

let storageDir: string;
let handle: DatabaseHandle;

function must<V>(value: V | null | undefined, what = 'value'): V {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}
const ok = (res: Res, status = 200) => {
  expect(res.status, res.text).toBe(status);
  return res.body;
};

async function freshDatabase(name: string) {
  const base = await verifiedIsolatedBase(process.env);
  const url = await recreateIsolatedDatabase(base, name);
  await migrateIsolated(url);
  const db = createDatabase(url, { maxConnections: 16, connectionTimeoutMs: 15_000 });
  const probe = await db.db.execute(
    sql.raw(
      "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
    ),
  );
  await assertIsolatedServer({ query: async () => ({ rows: probe.rows }) });
  return db;
}

function api(role: UserRole, userId: string, extendedTypes = true): Call {
  const app = buildTestApp({
    db: handle.db,
    storageDir,
    bodyLimitBytes: 1_048_576,
    auth: principalResolver(role, userId),
    extendedTypes,
  });
  return async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: {
        'X-Vitruv-App-Capability': '2',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {
      status: res.status,
      text,
      body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
    };
  };
}

async function user(role: UserRole, name: string) {
  const [row] = await handle.db
    .insert(schema.users)
    .values({
      email: `it-s6-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
      role,
      status: 'ACTIVE',
      displayName: name,
    })
    .returning();
  return must(row).id;
}
async function clientOf(coachId: string, name: string) {
  const id = await user('CLIENT', name);
  await handle.db
    .insert(schema.clientProfiles)
    .values({ userId: id, firstName: 'Fiktiv', lastName: name });
  await handle.db
    .insert(schema.coachClientAssignments)
    .values({ coachUserId: coachId, clientUserId: id });
  return id;
}

const named = (session: WorkoutSession, prefix: string): WorkoutSessionExercise =>
  must(
    session.exercises.find((e) => e.name.startsWith(prefix)),
    prefix,
  );

describe('Sprint 6 — Total reps and Core interval on an isolated PostgreSQL', () => {
  let coachId: string;
  let clientA: string;
  let clientB: string;
  let coach: Call;
  let coachFlagOff: Call;
  let asA: Call;
  let asB: Call;
  const ex: Record<'mobility' | 'pullups' | 'bench' | 'plank', string> = {
    mobility: '',
    pullups: '',
    bench: '',
    plank: '',
  };
  let dayId = '';
  let session: WorkoutSession;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s6-'));
    handle = await freshDatabase('vitruv_it_s6');
    coachId = await user('COACH', 'Coach');
    await handle.db
      .insert(schema.coachProfiles)
      .values([{ userId: coachId, displayName: 'Coach' }]);
    clientA = await clientOf(coachId, 'Clara');
    clientB = await clientOf(coachId, 'David');
    coach = api('COACH', coachId);
    coachFlagOff = api('COACH', coachId, false);
    asA = api('CLIENT', clientA);
    asB = api('CLIENT', clientB);
    const names = {
      mobility: 'Mobilisation',
      pullups: 'Klimmzüge',
      bench: 'Liegestütze',
      plank: 'Core-Routine',
    };
    for (const key of Object.keys(ex) as (keyof typeof ex)[]) {
      ex[key] = adminExerciseSchema.parse(
        ok(
          await coach('POST', `${T}/exercises`, {
            name: `${names[key]} ${randomUUID().slice(0, 4)}`,
            description: `Fiktive Ausführung ${key}.`,
          }),
          201,
        ),
      ).id;
    }
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const template = (title: string) => ({
    title,
    category: 'UPPER_BODY',
    sections: [
      {
        type: 'WARMUP',
        title: 'Aufwärmen',
        exercises: [{ exerciseId: ex.mobility, executionType: 'CHECKLIST' }],
      },
      {
        type: 'MAIN',
        exercises: [
          { exerciseId: ex.pullups, executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 60 },
          {
            exerciseId: ex.bench,
            executionType: 'STRENGTH',
            sets: 2,
            repsMax: true,
            restSeconds: 90,
          },
        ],
      },
      // Core without values → the documented defaults 5 × 40 s / 20 s are stored.
      { type: 'FINISHER', exercises: [{ exerciseId: ex.plank, executionType: 'INTERVAL' }] },
    ],
  });

  it('31. flag OFF: Core (and the Warm-up checklist) can not be created; Total reps stays allowed', async () => {
    const blocked = await coachFlagOff('POST', `${T}/templates`, template('Gesperrt'));
    expect(blocked.status).toBe(409);
    expect(blocked.text).toContain('executionType');
    const totalOnly = await coachFlagOff('POST', `${T}/templates`, {
      title: 'Nur Gesamtziel',
      category: 'UPPER_BODY',
      sections: [
        {
          type: 'MAIN',
          exercises: [
            { exerciseId: ex.pullups, executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 60 },
          ],
        },
      ],
    });
    expect(totalOnly.status, totalOnly.text).toBe(201);
  });

  it('32 + 39 + 13–19. flag ON: Warm-up + Total reps + MAX + Core in coach order, timers from the snapshot', async () => {
    const created = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates`, template('Ganzkörper Sprint 6')), 201),
    );
    const assigned = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${created.id}/assign`, {
          clientId: clientA,
          requestId: randomUUID(),
          date: DATE,
        }),
        201,
      ),
    );
    dayId = assigned.dayId;
    ok(await coach('POST', `${T}/programs/${assigned.programId}/activate`));
    session = startWorkoutResponseSchema.parse(
      ok(await asA('POST', W, { trainingDayId: dayId }), 201),
    ).session;

    expect(session.exercises.map((e) => [e.sectionType, e.executionMode])).toEqual([
      ['WARMUP', 'CHECKLIST'],
      ['MAIN', 'TOTAL_REPS'],
      ['MAIN', 'SETS_REPS'],
      ['FINISHER', 'INTERVAL'],
    ]);
    const total = named(session, 'Klimmzüge');
    expect(total.timer).toMatchObject({ mode: 'AUTO_REST', restSeconds: 60 });
    expect(total.totalReps).toEqual({
      target: 60,
      done: 0,
      remaining: 60,
      reached: false,
      setCount: 0,
    });
    expect(total.sets).toEqual([]); // unlimited: sets are appended, none planned
    expect(named(session, 'Liegestütze').target.repsMax).toBe(true);
    const core = named(session, 'Core-Routine');
    expect(core.timer).toMatchObject({
      mode: 'INTERVAL',
      interval: { rounds: 5, workSeconds: 40, restSeconds: 20 },
    });
    expect(core.sets.map((s) => [s.setNumber, s.targetDurationSeconds, s.completed])).toEqual([
      [1, 40, false],
      [2, 40, false],
      [3, 40, false],
      [4, 40, false],
      [5, 40, false],
    ]);
    const plan = intervalPlan(must(must(core.timer).interval));
    expect(plan.phases[0]?.phase).toBe('WORK');
    expect(plan.phases.at(-1)?.phase).toBe('WORK');
    expect(plan.totalSeconds).toBe(280);
  });

  it('12. overshooting the total is stored as entered (never clipped); the exercise ends, no rest', async () => {
    const total = named(session, 'Klimmzüge');
    const path = `${W}/${session.id}/exercises/${total.id}/sets`;
    const first = recordWorkoutSetResponseSchema.parse(
      ok(await asA('POST', path, { clientSetId: randomUUID(), actualReps: 30 }), 201),
    );
    expect(first.restSeconds).toBe(60);
    expect(first.exercise.totalReps).toMatchObject({ done: 30, remaining: 30, reached: false });
    const last = recordWorkoutSetResponseSchema.parse(
      ok(await asA('POST', path, { clientSetId: randomUUID(), actualReps: 35 }), 201),
    );
    expect(last.restSeconds).toBeNull();
    expect(last.set.actualReps).toBe(35);
    expect(last.exercise).toMatchObject({
      status: 'COMPLETED',
      actualReps: 65,
      totalReps: { target: 60, done: 65, remaining: 0, reached: true, setCount: 2 },
    });
    // 4: reached → no further set
    expect((await asA('POST', path, { clientSetId: randomUUID(), actualReps: 1 })).status).toBe(
      409,
    );
    // 10: an app restart reads the sets back unchanged
    const again = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`)));
    expect(named(again, 'Klimmzüge').sets.map((s) => [s.setNumber, s.actualReps])).toEqual([
      [1, 30],
      [2, 35],
    ]);
  });

  it('23 + 24 + 22. Core rounds: stored per row, a repeated round keeps its first record, a restart reads them back', async () => {
    const core = named(session, 'Core-Routine');
    const round = (n: number) =>
      asA('PATCH', `${W}/${session.id}/exercises/${core.id}/sets/${n}`, {
        completed: true,
        actualDurationSeconds: 40,
      });
    for (const n of [1, 2]) ok(await round(n));
    const firstRecord = await handle.db
      .select({
        n: schema.workoutExerciseSets.setNumber,
        at: schema.workoutExerciseSets.completedAt,
      })
      .from(schema.workoutExerciseSets)
      .where(eq(schema.workoutExerciseSets.sessionExerciseId, core.id))
      .orderBy(asc(schema.workoutExerciseSets.setNumber));
    // the same round reported again (retry after a dropped connection)
    const repeated = workoutExecutionUpdateResponseSchema.parse(ok(await round(2))).exercise;
    expect(repeated.status).toBe('PENDING');
    expect(repeated.sets.filter((s) => s.completed).map((s) => s.setNumber)).toEqual([1, 2]);
    const afterRepeat = await handle.db
      .select({
        n: schema.workoutExerciseSets.setNumber,
        at: schema.workoutExerciseSets.completedAt,
      })
      .from(schema.workoutExerciseSets)
      .where(eq(schema.workoutExerciseSets.sessionExerciseId, core.id))
      .orderBy(asc(schema.workoutExerciseSets.setNumber));
    expect(afterRepeat).toEqual(firstRecord); // still 5 rows, round 2 keeps its first time
    expect(afterRepeat).toHaveLength(5);
    // app restart: the session shows 2 of 5 rounds done
    const reread = named(
      workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`))),
      'Core-Routine',
    );
    expect(reread.sets.map((s) => s.completed)).toEqual([true, true, false, false, false]);
    // there is no 6th round
    expect((await round(6)).status).toBe(404);
    // 25: the last round completes the Core exercise
    let last: WorkoutSessionExercise | undefined;
    for (const n of [3, 4, 5]) {
      last = workoutExecutionUpdateResponseSchema.parse(ok(await round(n))).exercise;
    }
    expect(must(last).status).toBe('COMPLETED');
    expect(must(last).sets.map((s) => s.actualDurationSeconds)).toEqual([40, 40, 40, 40, 40]);
  });

  it('30. client B can neither record a set nor a round in A’s session', async () => {
    const total = named(session, 'Klimmzüge');
    const core = named(session, 'Core-Routine');
    expect(
      (
        await asB('POST', `${W}/${session.id}/exercises/${total.id}/sets`, {
          clientSetId: randomUUID(),
          actualReps: 5,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await asB('PATCH', `${W}/${session.id}/exercises/${core.id}/sets/1`, {
          completed: false,
        })
      ).status,
    ).toBe(404);
    // nothing changed for A
    const mine = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`)));
    expect(named(mine, 'Core-Routine').sets.every((s) => s.completed)).toBe(true);
    expect(named(mine, 'Klimmzüge').sets).toHaveLength(2);
  });

  it('29 + 38. the whole workout completes; the day is locked; the snapshot stays readable', async () => {
    const warm = named(session, 'Mobilisation');
    ok(
      await asA('PATCH', `${W}/${session.id}/exercises/${warm.id}`, {
        status: 'COMPLETED',
      }),
    );
    const bench = named(session, 'Liegestütze');
    for (const [n, reps] of [
      [1, 17],
      [2, 14],
    ] as const) {
      ok(
        await asA('PATCH', `${W}/${session.id}/exercises/${bench.id}/sets/${n}`, {
          completed: true,
          actualReps: reps,
        }),
      );
    }
    ok(await asA('POST', `${W}/${session.id}/complete`));
    const restart = await asA('POST', W, { trainingDayId: dayId });
    expect(restart.status).toBe(409);
    expect(restart.text).toContain('WORKOUT_ALREADY_COMPLETED');
    const total = named(session, 'Klimmzüge');
    expect(
      (
        await asA('POST', `${W}/${session.id}/exercises/${total.id}/sets`, {
          clientSetId: randomUUID(),
          actualReps: 1,
        })
      ).status,
    ).toBe(409);
    const done = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`)));
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toMatchObject({ total: 4, completed: 4, skipped: 0 });
    expect(named(done, 'Core-Routine').timer?.interval).toEqual({
      rounds: 5,
      workSeconds: 40,
      restSeconds: 20,
    });
  });
});
