import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  clientPlanSchema,
  clientWorkoutSchema,
  currentWorkoutResponseSchema,
  startWorkoutResponseSchema,
  workoutExecutionUpdateResponseSchema,
  workoutSessionSchema,
  workoutTemplateSchema,
  type ClientTrainingProgram,
  type UpdateClientWorkoutRequest,
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
import type { UserRole } from '@vitruv/shared';
import { count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from './helpers';

/**
 * Sprint 4 — what the iPhone app reads and writes, end-to-end on a REAL, ISOLATED PostgreSQL
 * (never production): the client's weekly plan from coach assignments, the workout overview data,
 * session start/resume, the Warm-up checklist (tick off → stored, idempotent, survives an app
 * restart, then the next section), the TRAINING_EXTENDED_TYPES flag ON/OFF, client isolation,
 * no COACH/ADMIN access to the client endpoints, legacy client_plans kept apart and old contracts.
 * Fictional people and values. Numbers refer to the 28 Sprint 4 scenarios
 * (docs/ios-training-sprint4-test-results.md).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const ACTIVE = '/v1/client/training/active';
const DATE = '2027-03-03'; // Wednesday → program starts Monday 2027-03-01, weekday 3
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
      email: `it-s4-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
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

const daysOf = (program: ClientTrainingProgram) =>
  program.weeks.flatMap((w) => w.days.map((d) => ({ week: w, day: d })));

describe('Sprint 4 — client weekly plan, workout overview and Warm-up on an isolated PostgreSQL', () => {
  let coachId: string;
  let adminId: string;
  let clientA: string;
  let clientB: string;
  let coach: Call;
  let coachFlagOff: Call;
  let admin: Call;
  let asA: Call;
  let asB: Call;
  const ex: Record<'shoulder' | 'arms' | 'hip' | 'bench' | 'rows', string> = {
    shoulder: '',
    arms: '',
    hip: '',
    bench: '',
    rows: '',
  };
  let warmupDayId = '';
  let secondDayId = '';
  let sessionId = '';

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s4-'));
    handle = await freshDatabase('vitruv_it_s4');
    adminId = await user('ADMIN', 'Admin');
    coachId = await user('COACH', 'Coach');
    await handle.db
      .insert(schema.coachProfiles)
      .values([{ userId: coachId, displayName: 'Coach' }]);
    clientA = await clientOf(coachId, 'Anna');
    clientB = await clientOf(coachId, 'Bert');
    coach = api('COACH', coachId);
    coachFlagOff = api('COACH', coachId, false);
    admin = api('ADMIN', adminId);
    asA = api('CLIENT', clientA);
    asB = api('CLIENT', clientB);
    const names = {
      shoulder: 'Schulterkreisen',
      arms: 'Armkreisen',
      hip: 'Hüftmobilisation',
      bench: 'Bankdrücken',
      rows: 'Rudern',
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

  it('25. flag OFF: a Warm-up checklist can not be created — the extended types stay closed', async () => {
    const res = await coachFlagOff('POST', `${T}/templates`, {
      title: 'Warm-up gesperrt',
      sections: [
        {
          type: 'WARMUP',
          exercises: [{ exerciseId: ex.shoulder, executionType: 'CHECKLIST' }],
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.text).toContain('executionType');
  });

  it('1 + 3 + 26. coach assignments reach the client plan (dated, two workouts on one day); drafts stay invisible', async () => {
    const warmupTemplate = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Oberkörper mit Aufwärmen',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'WARMUP',
              title: 'Aufwärmen',
              exercises: [
                { exerciseId: ex.shoulder, executionType: 'CHECKLIST' },
                { exerciseId: ex.arms, executionType: 'CHECKLIST' },
                { exerciseId: ex.hip, executionType: 'CHECKLIST' },
              ],
            },
            {
              type: 'MAIN',
              exercises: [
                {
                  exerciseId: ex.bench,
                  executionType: 'STRENGTH',
                  sets: 3,
                  reps: 10,
                  restSeconds: 90,
                },
              ],
            },
          ],
        }),
        201,
      ),
    );
    const second = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Rücken kurz',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'MAIN',
              exercises: [
                {
                  exerciseId: ex.rows,
                  executionType: 'TOTAL_REPS',
                  totalReps: 60,
                  restSeconds: 60,
                },
              ],
            },
          ],
        }),
        201,
      ),
    );
    const first = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${warmupTemplate.id}/assign`, {
          clientId: clientA,
          requestId: randomUUID(),
          date: DATE,
        }),
        201,
      ),
    );
    const other = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${second.id}/assign`, {
          clientId: clientA,
          requestId: randomUUID(),
          date: DATE,
        }),
        201,
      ),
    );
    warmupDayId = first.dayId;
    secondDayId = other.dayId;
    expect(first.programStatus).toBe('DRAFT');

    // DRAFT → the client sees nothing yet (no half-finished plan on the phone).
    expect(clientActiveTrainingResponseSchema.parse(ok(await asA('GET', ACTIVE))).program).toBe(
      null,
    );
    ok(await coach('POST', `${T}/programs/${first.programId}/activate`));

    const raw = await asA('GET', ACTIVE);
    const program = must(clientActiveTrainingResponseSchema.parse(ok(raw)).program);
    expect(program.startsOn).toBe('2027-03-01');
    const days = daysOf(program);
    expect(days).toHaveLength(2);
    // Both on Wednesday of week 1 → same calendar date in the app.
    expect(days.map((d) => [d.week.order, d.day.scheduledWeekday])).toEqual([
      [0, 3],
      [0, 3],
    ]);
    const warmDay = must(days.find((d) => d.day.id === warmupDayId)).day;
    expect(warmDay.workoutStatus).toBe('NOT_STARTED');
    const warmup = must(warmDay.sections.find((s) => s.type === 'WARMUP'));
    // Coach order is kept; no reps / timer / rest; the storage text never reaches the app.
    expect(warmup.exercises.map((e) => e.exerciseId)).toEqual([ex.shoulder, ex.arms, ex.hip]);
    for (const e of warmup.exercises) {
      expect(e).toMatchObject({
        executionType: 'CHECKLIST',
        sets: null,
        reps: null,
        totalReps: null,
        durationSeconds: null,
        restSeconds: null,
        prescriptionText: null,
        media: null,
      });
    }
    expect(raw.text).not.toContain('Abhaken');
  });

  it('coach edits the client copy → the app shows the new configuration; the template stays out', async () => {
    const copy = clientWorkoutSchema.parse(
      ok(await coach('GET', `${T}/days/${warmupDayId}/workout`)),
    );
    const body: UpdateClientWorkoutRequest = {
      expectedVersion: copy.version,
      title: copy.title,
      sections: copy.sections.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        exercises: s.exercises.map((e) => ({
          id: e.id,
          exerciseId: e.exercise.id,
          executionType: e.executionType,
          sets: e.sets,
          reps: e.reps === 10 ? 12 : e.reps,
          repsMax: e.repsMax,
          totalReps: e.totalReps,
          durationSeconds: e.durationSeconds,
          restSeconds: e.restSeconds,
          targetWeight: e.targetWeight,
          weightUnit: e.weightUnit,
          prescriptionText: e.prescriptionText,
          instructionsOverride: e.instructionsOverride,
        })),
      })),
    };
    ok(await coach('PUT', `${T}/days/${warmupDayId}/workout`, body));
    const program = must(
      clientActiveTrainingResponseSchema.parse(ok(await asA('GET', ACTIVE))).program,
    );
    const day = must(daysOf(program).find((d) => d.day.id === warmupDayId)).day;
    const bench = must(day.sections.find((s) => s.type === 'MAIN')?.exercises[0]);
    expect(bench).toMatchObject({ sets: 3, reps: 12, executionType: 'STRENGTH' });
  });

  it('10 + 13 + 14 + 15. starting gives the Warm-up as checklist items in coach order, without reps or timer', async () => {
    const started = startWorkoutResponseSchema.parse(
      ok(await asA('POST', W, { trainingDayId: warmupDayId }), 201),
    );
    sessionId = started.session.id;
    const warm = started.session.exercises.filter((e) => e.sectionType === 'WARMUP');
    expect(warm).toHaveLength(3);
    expect(warm.map((e) => e.exerciseId)).toEqual([ex.shoulder, ex.arms, ex.hip]);
    for (const e of warm) {
      expect(e.executionMode).toBe('CHECKLIST');
      expect(e.target).toMatchObject({
        sets: null,
        reps: null,
        totalReps: null,
        durationSeconds: null,
        restSeconds: null,
        prescriptionText: null,
      });
      expect(e.sets).toEqual([]);
      expect(e.timer?.mode ?? 'NONE').toBe('NONE');
    }
    expect(started.session.progress.currentExerciseId).toBe(must(warm[0]).id);
  });

  it('16 + 18. a tick is stored once — a repeated tick keeps the same record (idempotent)', async () => {
    const session = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${sessionId}`)));
    const first = must(session.exercises[0]);
    const tick = async () =>
      workoutExecutionUpdateResponseSchema.parse(
        ok(await asA('PATCH', `${W}/${sessionId}/exercises/${first.id}`, { status: 'COMPLETED' })),
      );
    const once = await tick();
    const again = await tick();
    expect(once.exercise.status).toBe('COMPLETED');
    expect(again.exercise.completedAt).toBe(once.exercise.completedAt);
    const rows = await handle.db
      .select({ n: count() })
      .from(schema.workoutSessionExercises)
      .where(eq(schema.workoutSessionExercises.sessionId, sessionId));
    expect(Number(must(rows[0]).n)).toBe(session.exercises.length);
    // Values are not accepted for a checklist item, and targets are never writable.
    expect(
      (await asA('PATCH', `${W}/${sessionId}/exercises/${first.id}`, { actualReps: 10 })).status,
    ).toBe(400);
    expect(
      (
        await asA('PATCH', `${W}/${sessionId}/exercises/${first.id}`, {
          sets: 9,
          status: 'COMPLETED',
        })
      ).status,
    ).toBe(400);
  });

  it('11 + 17 + 19. after an app restart the ticks are still there; the last tick leads to the next section', async () => {
    // "Restart": the app only knows the server — GET /current.
    const current = must(
      currentWorkoutResponseSchema.parse(ok(await asA('GET', `${W}/current`))).session,
    );
    expect(current.id).toBe(sessionId);
    const warm = current.exercises.filter((e) => e.sectionType === 'WARMUP');
    expect(warm.map((e) => e.status)).toEqual(['COMPLETED', 'PENDING', 'PENDING']);
    expect(current.progress.currentExerciseId).toBe(must(warm[1]).id);
    // Starting the same day again resumes the same session (no second session).
    const resumed = startWorkoutResponseSchema.parse(
      ok(await asA('POST', W, { trainingDayId: warmupDayId }), 200),
    );
    expect(resumed).toMatchObject({ resumed: true, session: { id: sessionId } });
    // Untick + tick again still works.
    for (const e of warm.slice(1)) {
      ok(await asA('PATCH', `${W}/${sessionId}/exercises/${e.id}`, { status: 'COMPLETED' }));
    }
    const after = must(
      currentWorkoutResponseSchema.parse(ok(await asA('GET', `${W}/current`))).session,
    );
    const main = must(after.exercises.find((e) => e.sectionType === 'MAIN'));
    expect(after.progress.currentExerciseId).toBe(main.id);
    expect(main.target).toMatchObject({ sets: 3, reps: 12 });
    // Plan status for the day: in progress.
    const program = must(
      clientActiveTrainingResponseSchema.parse(ok(await asA('GET', ACTIVE))).program,
    );
    expect(must(daysOf(program).find((d) => d.day.id === warmupDayId)).day.workoutStatus).toBe(
      'IN_PROGRESS',
    );
  });

  it('23. client B sees neither A’s plan nor A’s session and can not tick A’s Warm-up', async () => {
    expect(clientActiveTrainingResponseSchema.parse(ok(await asB('GET', ACTIVE))).program).toBe(
      null,
    );
    expect((await asB('GET', `${W}/${sessionId}`)).status).toBe(404);
    const current = currentWorkoutResponseSchema.parse(ok(await asB('GET', `${W}/current`)));
    expect(current.session).toBe(null);
    const session = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${sessionId}`)));
    const res = await asB('PATCH', `${W}/${sessionId}/exercises/${must(session.exercises[0]).id}`, {
      status: 'PENDING',
    });
    expect(res.status).toBe(404);
    expect((await asB('POST', W, { trainingDayId: warmupDayId })).status).toBe(404);
  });

  it('24. COACH and ADMIN have no access to the client (participant) endpoints', async () => {
    // COACH lacks the training.self.* permissions → 403.
    expect((await coach('GET', ACTIVE)).status).toBe(403);
    expect((await coach('GET', `${W}/current`)).status).toBe(403);
    expect((await coach('POST', W, { trainingDayId: warmupDayId })).status).toBe(403);
    // ADMIN holds every permission, but the self endpoints require a CLIENT account → 404,
    // nothing of A's plan or session is returned. (The app itself rejects non-CLIENT logins.)
    for (const res of [
      await admin('GET', ACTIVE),
      await admin('GET', `${W}/current`),
      await admin('POST', W, { trainingDayId: warmupDayId }),
      await admin('GET', `${W}/${sessionId}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.text).not.toContain(warmupDayId);
    }
  });

  it('12. a completed workout shows as completed; another day stays startable', async () => {
    ok(await asA('POST', `${W}/${sessionId}/complete`));
    const program = must(
      clientActiveTrainingResponseSchema.parse(ok(await asA('GET', ACTIVE))).program,
    );
    const status = (id: string) =>
      must(daysOf(program).find((d) => d.day.id === id)).day.workoutStatus;
    expect(status(warmupDayId)).toBe('COMPLETED');
    expect(status(secondDayId)).toBe('NOT_STARTED');
    // The finished session keeps its ticks.
    const done = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${sessionId}`)));
    expect(done.status).toBe('COMPLETED');
    expect(
      done.exercises
        .filter((e) => e.sectionType === 'WARMUP')
        .every((e) => e.status === 'COMPLETED'),
    ).toBe(true);
    // Ticking after the end is refused (nothing changes silently).
    expect(
      (
        await asA('PATCH', `${W}/${sessionId}/exercises/${must(done.exercises[0]).id}`, {
          status: 'PENDING',
        })
      ).status,
    ).toBe(409);
  });

  it('27. legacy client_plans are a separate list — never part of the executable plan', async () => {
    const legacy = clientPlanSchema.parse(
      ok(
        await coach('PUT', `${T}/clients/${clientA}/plan`, {
          startsOn: '2027-01-01',
          endsOn: null,
          items: [{ exerciseId: ex.hip, note: 'Alte Liste' }],
        }),
      ),
    );
    expect(legacy.items).toHaveLength(1);
    const program = must(
      clientActiveTrainingResponseSchema.parse(ok(await asA('GET', ACTIVE))).program,
    );
    expect(daysOf(program)).toHaveLength(2);
    expect(JSON.stringify(program)).not.toContain('Alte Liste');
    // Served separately (web portal); unchanged.
    expect(clientPlanSchema.parse(ok(await asA('GET', '/v1/client/training/plan')))).toMatchObject({
      items: [expect.objectContaining({ note: 'Alte Liste' })],
    });
  });

  it('28. old mobile contract: every new field is optional — a pre-Sprint-2 reader still parses', async () => {
    const raw = await asA('GET', ACTIVE);
    const program = must(clientActiveTrainingResponseSchema.parse(ok(raw)).program);
    // Strip the additive fields → the old shape must still be valid.
    const old = JSON.parse(raw.text) as { program: ClientTrainingProgram };
    for (const week of old.program.weeks) {
      for (const day of week.days) {
        delete (day as { workoutStatus?: unknown }).workoutStatus;
        for (const section of day.sections) {
          for (const e of section.exercises) {
            delete (e as { executionType?: unknown }).executionType;
            delete (e as { repsMax?: unknown }).repsMax;
          }
        }
      }
    }
    expect(clientActiveTrainingResponseSchema.safeParse(old).success).toBe(true);
    expect(program.weeks.length).toBeGreaterThan(0);
  });
});
