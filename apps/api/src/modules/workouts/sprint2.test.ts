import { randomUUID } from 'node:crypto';
import {
  createAssignmentRequestSchema,
  recordWorkoutSetRequestSchema,
  workoutSessionSchema,
} from '@vitruv/contracts';
import { schema } from '@vitruv/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { FakeStore, type FakeTables } from '../../../test/fake-pg';
import { buildTestApp, principalResolver, silentLogger, testUrls } from '../../../test/helpers';
import type { Principal } from '../../auth/principal';
import { clientAccessible } from '../management/management.service';
import { storagePrescription } from '../training/prescription-storage';
import { copyTemplateForDay, type TemplateSource } from '../training/template-copy';
import { decideRecordedSet, legacyTotalCarryOver, sameRecordedValues } from './set-recording';
import * as workouts from './workouts.service';

/**
 * Sprint 2 — the 14 required scenarios (docs/ios-training-sprint2-implementation.md §Tests).
 * No database: the service code runs against test/fake-pg.ts (in-memory, fictional data). The
 * real constraints/locks are additionally exercised by test/*.int.test.ts once an ISOLATED test
 * database exists — those are deliberately not run here (the local env points at production).
 */

const CLIENT_A = '00000000-0000-4000-8000-00000000000a';
const CLIENT_B = '00000000-0000-4000-8000-00000000000b';
const COACH = '00000000-0000-4000-8000-0000000000c0';
const SESSION_A = '00000000-0000-4000-8000-0000000005a1';
const SESSION_B = '00000000-0000-4000-8000-0000000005b1';
const DONE_A = '00000000-0000-4000-8000-0000000005a2';
const EX_TOTAL = '00000000-0000-4000-8000-0000000000e1';
const EX_STRENGTH = '00000000-0000-4000-8000-0000000000e2';
const EX_WARMUP = '00000000-0000-4000-8000-0000000000e3';
const EX_CORE = '00000000-0000-4000-8000-0000000000e4';
const EX_LEGACY = '00000000-0000-4000-8000-0000000000e5';
const EX_B = '00000000-0000-4000-8000-0000000000e6';
const EX_DONE = '00000000-0000-4000-8000-0000000000e7';
const LIB = '00000000-0000-4000-8000-0000000000f1';
const PROGRAM = '00000000-0000-4000-8000-0000000000d1';

const actorA: Principal = { userId: CLIENT_A, role: 'CLIENT' };
const actorB: Principal = { userId: CLIENT_B, role: 'CLIENT' };
const T0 = new Date('2026-11-20T08:00:00.000Z');

function session(id: string, client: string, status = 'IN_PROGRESS') {
  return {
    id,
    client_user_id: client,
    training_program_id: PROGRAM,
    training_day_id: null,
    program_title_snapshot: 'Testplan',
    day_title_snapshot: 'Tag 1',
    week_order_snapshot: 0,
    day_order_snapshot: 0,
    status,
    started_at: T0,
    completed_at: status === 'COMPLETED' ? new Date('2026-11-20T09:00:00.000Z') : null,
    abandoned_at: null,
    client_note: null,
    client_note_updated_at: null,
    source_template_id: null,
    source_template_version: null,
    created_at: T0,
    updated_at: T0,
  };
}

function exercise(
  id: string,
  sessionId: string,
  sortOrder: number,
  mode: string,
  target: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    session_id: sessionId,
    training_exercise_assignment_id: null,
    exercise_id: LIB,
    sort_order: sortOrder,
    section_type: mode === 'CHECKLIST' ? 'WARMUP' : 'MAIN',
    section_title_snapshot: null,
    section_order: 0,
    exercise_name_snapshot: `Übung ${sortOrder + 1}`,
    instructions_snapshot: null,
    sets: null,
    reps: null,
    total_reps: null,
    duration_seconds: null,
    rest_seconds: null,
    target_weight: null,
    weight_unit: null,
    prescription_text: null,
    execution_mode: mode,
    reps_max: false,
    status: 'PENDING',
    completed_at: null,
    actual_reps: null,
    actual_duration_seconds: null,
    actual_weight: null,
    client_note: null,
    client_note_updated_at: null,
    created_at: T0,
    updated_at: T0,
    ...target,
  };
}

function plannedSet(exerciseId: string, n: number, target: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    session_exercise_id: exerciseId,
    set_number: n,
    target_reps: null,
    target_duration_seconds: null,
    target_weight: null,
    actual_reps: null,
    actual_weight: null,
    completed_at: null,
    client_set_id: null,
    actual_duration_seconds: null,
    client_recorded_at: null,
    created_at: T0,
    updated_at: T0,
    ...target,
  };
}

function fixture(): FakeTables {
  return {
    users: [
      { id: CLIENT_A, role: 'CLIENT' },
      { id: CLIENT_B, role: 'CLIENT' },
      { id: COACH, role: 'COACH' },
    ],
    workout_sessions: [
      session(SESSION_A, CLIENT_A),
      session(SESSION_B, CLIENT_B),
      session(DONE_A, CLIENT_A, 'COMPLETED'),
    ],
    workout_session_exercises: [
      exercise(EX_WARMUP, SESSION_A, 0, 'CHECKLIST', { prescription_text: 'Abhaken' }),
      exercise(EX_STRENGTH, SESSION_A, 1, 'SETS_REPS', {
        sets: 3,
        reps: null,
        reps_max: true,
        rest_seconds: 90,
      }),
      exercise(EX_TOTAL, SESSION_A, 2, 'TOTAL_REPS', { total_reps: 60, rest_seconds: 60 }),
      exercise(EX_CORE, SESSION_A, 3, 'INTERVAL', {
        sets: 5,
        duration_seconds: 40,
        rest_seconds: 20,
      }),
      exercise(EX_LEGACY, SESSION_A, 4, 'TOTAL_REPS', { total_reps: 70, actual_reps: 30 }),
      exercise(EX_B, SESSION_B, 0, 'TOTAL_REPS', { total_reps: 60, rest_seconds: 60 }),
      exercise(EX_DONE, DONE_A, 0, 'TOTAL_REPS', { total_reps: 20, rest_seconds: 60 }),
    ],
    workout_exercise_sets: [
      ...[1, 2, 3].map((n) => plannedSet(EX_STRENGTH, n)),
      ...[1, 2, 3, 4, 5].map((n) => plannedSet(EX_CORE, n, { target_duration_seconds: 40 })),
    ],
  };
}

function setup(options: { ignoreLocks?: boolean } = {}) {
  const store = new FakeStore(fixture(), options);
  const deps = (db = store.connect()) => ({
    db,
    logger: silentLogger,
    urls: testUrls,
    now: () => new Date('2026-11-20T08:30:00.000Z'),
  });
  return { store, deps };
}

/** Non-null access without `!` (lint): fails the test with a clear message instead. */
function must<T>(value: T | undefined, what = 'value'): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const rows = (store: FakeStore, exerciseId: string) =>
  (store.tables.workout_exercise_sets ?? []).filter(
    (row) => row.session_exercise_id === exerciseId,
  );

describe('Sprint 2 — security and object scope', () => {
  it('1. a client gets the own workout (snapshot DTO, valid against the contract)', async () => {
    const { deps } = setup();
    const workout = await workouts.getWorkout(deps(), actorA, SESSION_A);
    expect(workoutSessionSchema.safeParse(workout).success).toBe(true);
    expect(workout.exercises.map((e) => e.executionMode)).toEqual([
      'CHECKLIST',
      'SETS_REPS',
      'TOTAL_REPS',
      'INTERVAL',
      'TOTAL_REPS',
    ]);
  });

  it('2. a client can not read or write another client`s workout (IDOR → 404, scoped in SQL)', async () => {
    const { store, deps } = setup();
    await expect(workouts.getWorkout(deps(), actorA, SESSION_B)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      workouts.recordWorkoutSet(deps(), actorA, SESSION_B, EX_B, {
        clientSetId: randomUUID(),
        actualReps: 5,
      }),
    ).rejects.toMatchObject({ status: 404 });
    // Session id of B + exercise id of B, but the session query is bound to the caller's id.
    for (const entry of store.statementsOn('workout_sessions')) {
      expect(entry.text).toContain('"client_user_id" = $');
      expect(entry.params).toContain(CLIENT_A);
      expect(entry.params).not.toContain(CLIENT_B);
    }
    expect(rows(store, EX_B)).toHaveLength(0);
    // An exercise id of another session is a 404 too, even inside the own session.
    await expect(
      workouts.recordWorkoutSet(deps(), actorB, SESSION_B, EX_TOTAL, {
        clientSetId: randomUUID(),
        actualReps: 5,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('3. COACH: no client workout routes at all; coach summaries are scoped to assigned clients', async () => {
    const coachApp = buildTestApp({ auth: principalResolver('COACH', COACH) });
    const post = await coachApp.request(
      `/v1/client/workouts/${SESSION_A}/exercises/${EX_TOTAL}/sets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSetId: randomUUID(), actualReps: 5 }),
      },
    );
    expect(post.status).toBe(403);
    const dialect = new PgDialect();
    const coachScope = dialect.sqlToQuery(
      clientAccessible({ userId: COACH, role: 'COACH' }, schema.users.id),
    );
    expect(coachScope.sql).toContain('coach_client_assignments');
    expect(coachScope.sql).toContain('ended_at is null');
    expect(coachScope.params).toContain(COACH);
    const adminScope = dialect.sqlToQuery(
      clientAccessible({ userId: COACH, role: 'ADMIN' }, schema.users.id),
    );
    expect(adminScope.sql).not.toContain('coach_client_assignments');
  });

  it('the new set endpoint validates before any lookup (no client id, no target fields)', async () => {
    const app = buildTestApp({ auth: principalResolver('CLIENT', CLIENT_A) });
    const url = `/v1/client/workouts/${SESSION_A}/exercises/${EX_TOTAL}/sets`;
    for (const body of [
      {},
      { clientSetId: 'x', actualReps: 5 },
      { clientSetId: randomUUID() },
      { clientSetId: randomUUID(), actualReps: 0 },
      { clientSetId: randomUUID(), actualReps: 5, clientId: CLIENT_B },
      { clientSetId: randomUUID(), actualReps: 5, totalReps: 10 },
    ]) {
      const res = await app.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const anonymous = await buildTestApp().request(url, { method: 'POST' });
    expect(anonymous.status).toBe(401);
  });
});

describe('Sprint 2 — snapshot and history', () => {
  it('4. reading a session never touches the live plan; plan edits do not change it', async () => {
    const { store, deps } = setup();
    const before = await workouts.getWorkout(deps(), actorA, SESSION_A);
    expect(store.statementsOn('training_exercise_assignments')).toHaveLength(0);
    expect(store.statementsOn('training_days')).toHaveLength(0);
    // A coach editing the plan would change training_* rows — never the session's own rows.
    const after = await workouts.getWorkout(deps(), actorA, SESSION_A);
    expect(after.exercises.map((e) => e.target)).toEqual(before.exercises.map((e) => e.target));
  });

  it('completed sessions are immutable (409), also for the new set endpoint', async () => {
    const { store, deps } = setup();
    await expect(
      workouts.recordWorkoutSet(deps(), actorA, DONE_A, EX_DONE, {
        clientSetId: randomUUID(),
        actualReps: 10,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(rows(store, EX_DONE)).toHaveLength(0);
  });

  it('12. template A → client A and client B copies are isolated; template edits never reach them', () => {
    const template: TemplateSource = {
      id: '00000000-0000-4000-8000-0000000007e1',
      version: 3,
      title: 'Oberkörper',
      sections: [
        {
          type: 'MAIN',
          title: null,
          sortOrder: 1,
          exercises: [
            {
              exerciseId: LIB,
              sortOrder: 4,
              executionType: 'TOTAL_REPS',
              sets: null,
              reps: null,
              repsMax: false,
              totalReps: 60,
              durationSeconds: null,
              restSeconds: 60,
              targetWeight: null,
              weightUnit: null,
              prescriptionText: null,
              instructionsOverride: null,
            },
          ],
        },
        {
          type: 'WARMUP',
          title: null,
          sortOrder: 0,
          exercises: [
            {
              exerciseId: LIB,
              sortOrder: 0,
              executionType: 'CHECKLIST',
              sets: null,
              reps: null,
              repsMax: false,
              totalReps: null,
              durationSeconds: null,
              restSeconds: null,
              targetWeight: null,
              weightUnit: null,
              prescriptionText: null,
              instructionsOverride: null,
            },
          ],
        },
      ],
    };
    const forA = copyTemplateForDay(template);
    const forB = copyTemplateForDay(template, 'Tag 2');
    expect(forA.day).toEqual({
      title: 'Oberkörper',
      sourceTemplateId: template.id,
      sourceTemplateVersion: 3,
    });
    expect(forA.sections.map((s) => s.type)).toEqual(['WARMUP', 'MAIN']);
    expect(must(must(forA.sections[0]).assignments[0]).prescriptionText).toBe('Abhaken');
    // Independent objects: editing one copy or the template changes nothing else.
    must(must(forA.sections[1]).assignments[0]).totalReps = 80;
    must(must(template.sections[0]).exercises[0]).totalReps = 100;
    template.version = 4;
    expect(must(must(forB.sections[1]).assignments[0]).totalReps).toBe(60);
    expect(forB.day.sourceTemplateVersion).toBe(3);
    expect(must(forA.sections[1]).assignments).not.toBe(must(forB.sections[1]).assignments);
  });
});

describe('Sprint 2 — set persistence (client_set_id)', () => {
  it('5. the same client_set_id twice stores ONE row and answers the same set', async () => {
    const { store, deps } = setup();
    const clientSetId = randomUUID();
    const first = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId,
      actualReps: 12,
    });
    const retry = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId,
      actualReps: 12,
    });
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.set).toEqual(first.set);
    expect(retry.restSeconds).toBe(first.restSeconds);
    expect(rows(store, EX_TOTAL)).toHaveLength(1);
  });

  it('6a. concurrent retries (two connections, row lock) store ONE row', async () => {
    const { store, deps } = setup();
    const clientSetId = randomUUID();
    const body = { clientSetId, actualReps: 15 };
    const results = await Promise.all([
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(rows(store, EX_TOTAL)).toHaveLength(1);
  });

  it('6b. even WITHOUT the lock the unique index + ON CONFLICT DO NOTHING prevents a duplicate', async () => {
    const { store, deps } = setup({ ignoreLocks: true });
    const clientSetId = randomUUID();
    const body = { clientSetId, actualReps: 15 };
    const results = await Promise.all([
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
    ]);
    expect(results.map((r) => r.created).sort()).toEqual([false, true]);
    expect(rows(store, EX_TOTAL)).toHaveLength(1);
    expect(must(results[0]).set.clientSetId).toBe(clientSetId);
    expect(must(results[1]).set.clientSetId).toBe(clientSetId);
    const insert = store.log.find((entry) => entry.text.startsWith('insert into'));
    expect(insert?.text).toContain('on conflict do nothing');
  });

  it('2.5: the same client_set_id with OTHER values is refused (409), the stored set stays', async () => {
    const { store, deps } = setup();
    const clientSetId = randomUUID();
    await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId,
      actualReps: 12,
    });
    for (const body of [
      { clientSetId, actualReps: 13 },
      { clientSetId, actualReps: 12, actualWeight: 10 },
    ]) {
      await expect(
        workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, body),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(rows(store, EX_TOTAL)).toHaveLength(1);
    expect(
      sameRecordedValues(
        { actualReps: 12, actualWeight: 62.5 },
        { actualReps: 12, actualWeight: 62.5 },
      ),
    ).toBe(true);
    expect(sameRecordedValues({ actualReps: 12, actualWeight: null }, { actualReps: 12 })).toBe(
      true,
    );
    expect(
      sameRecordedValues(
        { actualReps: 12, actualWeight: null },
        { actualReps: 12, actualWeight: 0 },
      ),
    ).toBe(false);
    expect(
      sameRecordedValues(
        { actualReps: 12, actualWeight: 0.1 },
        { actualReps: 12, actualWeight: 0.1 },
      ),
    ).toBe(true);
  });

  it('2.5: a legacy exercise-level total is carried over as set 1 (never overwritten)', () => {
    const legacy = { executionMode: 'TOTAL_REPS' as const, actualReps: 30 };
    expect(legacyTotalCarryOver(legacy, [])).toBe(30);
    expect(
      legacyTotalCarryOver(legacy, [{ setNumber: 1, clientSetId: 'x', actualReps: 5 }]),
    ).toBeNull();
    expect(legacyTotalCarryOver({ ...legacy, actualReps: null }, [])).toBeNull();
    expect(legacyTotalCarryOver({ ...legacy, actualReps: 0 }, [])).toBeNull();
    expect(legacyTotalCarryOver({ ...legacy, executionMode: 'SETS_REPS' }, [])).toBeNull();
  });

  it('client_set_id is scoped to the exercise of the own session (other ids never replay)', () => {
    const stored = [{ setNumber: 1, clientSetId: 'a', actualReps: 5 }];
    expect(decideRecordedSet({ executionMode: 'TOTAL_REPS', totalReps: 60 }, stored, 'b')).toEqual({
      kind: 'insert',
      setNumber: 2,
    });
    expect(decideRecordedSet({ executionMode: 'SETS_REPS', totalReps: null }, [], 'b')).toEqual({
      kind: 'reject',
      reason: 'NOT_TOTAL_REPS',
    });
  });
});

describe('Sprint 2 — workout types', () => {
  it('7. Warm-up is valid without reps: contract, storage shim, tick-off only', async () => {
    const parsed = createAssignmentRequestSchema.safeParse({
      exerciseId: LIB,
      executionType: 'CHECKLIST',
    });
    expect(parsed.success).toBe(true);
    expect(storagePrescription({ executionType: 'CHECKLIST' })).toEqual({
      prescriptionText: 'Abhaken',
    });
    expect(
      createAssignmentRequestSchema.safeParse({
        exerciseId: LIB,
        executionType: 'CHECKLIST',
        reps: 10,
      }).success,
    ).toBe(false);

    const { deps } = setup();
    const done = await workouts.updateWorkoutExercise(deps(), actorA, SESSION_A, EX_WARMUP, {
      status: 'COMPLETED',
    });
    expect(done.exercise.status).toBe('COMPLETED');
    expect(done.exercise.timer).toEqual({ mode: 'NONE', restSeconds: null, interval: null });
    // The compatibility text is never shown to the client.
    expect(done.exercise.target.prescriptionText).toBeNull();
    await expect(
      workouts.updateWorkoutExercise(deps(), actorA, SESSION_A, EX_WARMUP, { actualReps: 10 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('8. Strength MAX is accepted: contract, snapshot flag, actual reps per set', async () => {
    expect(
      createAssignmentRequestSchema.safeParse({
        exerciseId: LIB,
        executionType: 'STRENGTH',
        sets: 3,
        repsMax: true,
        restSeconds: 90,
      }).success,
    ).toBe(true);
    expect(
      createAssignmentRequestSchema.safeParse({
        exerciseId: LIB,
        executionType: 'STRENGTH',
        sets: 3,
        reps: 8,
        repsMax: true,
      }).success,
    ).toBe(false);
    const { deps } = setup();
    const result = await workouts.updateWorkoutSet(deps(), actorA, SESSION_A, EX_STRENGTH, 1, {
      completed: true,
      actualReps: 17,
    });
    expect(result.exercise.target.repsMax).toBe(true);
    expect(result.exercise.sets[0]).toMatchObject({
      setNumber: 1,
      actualReps: 17,
      completed: true,
    });
    expect(result.exercise.status).toBe('PENDING');
    expect(result.exercise.timer).toEqual({ mode: 'AUTO_REST', restSeconds: 90, interval: null });
  });

  it('9. total reps: remaining is computed from the recorded sets', async () => {
    const { deps } = setup();
    await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId: randomUUID(),
      actualReps: 12,
    });
    const second = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId: randomUUID(),
      actualReps: 10,
    });
    expect(second.set.setNumber).toBe(2);
    expect(second.exercise.totalReps).toEqual({
      target: 60,
      done: 22,
      remaining: 38,
      reached: false,
      setCount: 2,
    });
    expect(second.exercise.actualReps).toBe(22);
    expect(second.restSeconds).toBe(60);
  });

  it('10. no rest once the total is reached; the exercise completes; further sets are refused', async () => {
    const { store, deps } = setup();
    for (const reps of [20, 20]) {
      const r = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
        clientSetId: randomUUID(),
        actualReps: reps,
      });
      expect(r.restSeconds).toBe(60);
    }
    const lastId = randomUUID();
    const last = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId: lastId,
      actualReps: 25,
    });
    expect(last.restSeconds).toBeNull();
    expect(last.exercise.status).toBe('COMPLETED');
    expect(last.exercise.totalReps).toMatchObject({ done: 65, remaining: 0, reached: true });
    // Retry of the final set: same answer, still no rest, still one row.
    const retry = await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId: lastId,
      actualReps: 25,
    });
    expect(retry).toMatchObject({ created: false, restSeconds: null });
    await expect(
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
        clientSetId: randomUUID(),
        actualReps: 5,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(rows(store, EX_TOTAL)).toHaveLength(3);
  });

  it('11. Core 5 × 40 / 20 is read as an interval config with one row per round', async () => {
    expect(storagePrescription({ executionType: 'INTERVAL' })).toEqual({
      sets: 5,
      durationSeconds: 40,
      restSeconds: 20,
    });
    const { deps } = setup();
    const workout = await workouts.getWorkout(deps(), actorA, SESSION_A);
    const core = must(workout.exercises.find((e) => e.id === EX_CORE));
    expect(core.timer).toEqual({
      mode: 'INTERVAL',
      restSeconds: null,
      interval: { rounds: 5, workSeconds: 40, restSeconds: 20 },
    });
    expect(core.sets.map((s) => s.targetDurationSeconds)).toEqual([40, 40, 40, 40, 40]);
    const round = await workouts.updateWorkoutSet(deps(), actorA, SESSION_A, EX_CORE, 1, {
      completed: true,
      actualDurationSeconds: 40,
    });
    expect(round.exercise.sets[0]).toMatchObject({ completed: true, actualDurationSeconds: 40 });
    await expect(
      workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_CORE, {
        clientSetId: randomUUID(),
        actualReps: 5,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('Sprint 2 — backward compatibility', () => {
  it('13. old request bodies still validate; the old response shape still parses', () => {
    expect(
      createAssignmentRequestSchema.safeParse({
        exerciseId: LIB,
        sets: 4,
        reps: 10,
        restSeconds: 60,
      }).success,
    ).toBe(true);
    expect(createAssignmentRequestSchema.safeParse({ exerciseId: LIB }).success).toBe(false);
    expect(
      recordWorkoutSetRequestSchema.safeParse({ clientSetId: randomUUID(), actualReps: 8 }).success,
    ).toBe(true);
    const oldShape = {
      id: SESSION_A,
      status: 'COMPLETED',
      programTitle: 'Plan',
      dayTitle: 'Tag',
      weekOrder: 0,
      dayOrder: 0,
      startedAt: T0.toISOString(),
      completedAt: T0.toISOString(),
      abandonedAt: null,
      durationSeconds: 0,
      programId: PROGRAM,
      dayId: null,
      progress: { total: 0, completed: 0, skipped: 0, currentExerciseId: null },
      exercises: [],
      clientNote: null,
      clientNoteUpdatedAt: null,
    };
    expect(workoutSessionSchema.safeParse(oldShape).success).toBe(true);
  });

  it('14. existing (pre-Sprint-2) records stay readable and writable as before', async () => {
    const { deps } = setup();
    const workout = await workouts.getWorkout(deps(), actorA, SESSION_A);
    const legacy = must(workout.exercises.find((e) => e.id === EX_LEGACY));
    expect(legacy.sets).toEqual([]);
    expect(legacy.actualReps).toBe(30);
    expect(legacy.totalReps).toMatchObject({ target: 70, done: 30, remaining: 40 });
    // The pre-Sprint-2 way of recording a total (exercise-level actualReps) still works.
    const updated = await workouts.updateWorkoutExercise(deps(), actorA, SESSION_A, EX_LEGACY, {
      actualReps: 70,
      status: 'COMPLETED',
    });
    expect(updated.exercise).toMatchObject({ actualReps: 70, status: 'COMPLETED' });
  });

  it('a TOTAL_REPS exercise with recorded sets refuses the old exercise-level total (no double count)', async () => {
    const { deps } = setup();
    await workouts.recordWorkoutSet(deps(), actorA, SESSION_A, EX_TOTAL, {
      clientSetId: randomUUID(),
      actualReps: 10,
    });
    await expect(
      workouts.updateWorkoutExercise(deps(), actorA, SESSION_A, EX_TOTAL, { actualReps: 60 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
