import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  adminProgramSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  clientPlanSchema,
  clientTrainingWeekSchema,
  clientWorkoutSchema,
  startWorkoutResponseSchema,
  trainingCapabilitiesSchema,
  workoutSessionSchema,
  workoutTemplateListSchema,
  workoutTemplateSchema,
  type ClientWorkout,
  type UpdateClientWorkoutRequest,
  type WorkoutSection,
  type WorkoutTemplate,
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
 * Sprint 3 — Workout-Bibliothek, duplicate, client assignment (copy), client-copy editing,
 * Trainingswoche and the TRAINING_EXTENDED_TYPES flag, end-to-end on a REAL, ISOLATED PostgreSQL
 * (HTTP → services → SQL, real pool, real locks; never production). Fictional people and values.
 * Numbers in the test names refer to the 25 Sprint 3 scenarios
 * (docs/ios-training-sprint3-test-results.md).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const DATE = '2027-03-03'; // a Wednesday → program starts Monday 2027-03-01, weekday 3
type Res = { status: number; body: Record<string, unknown> };
type Call = (method: string, path: string, body?: unknown) => Promise<Res>;

let storageDir: string;
let handle: DatabaseHandle;

function must<V>(value: V | null | undefined, what = 'value'): V {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}
const ok = (res: Res, status = 200) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
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
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  };
}

async function user(role: UserRole, name: string) {
  const [row] = await handle.db
    .insert(schema.users)
    .values({
      email: `it-s3-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
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

/** Copy content without ids/order numbers — to compare template vs. copy vs. duplicate. */
const content = (sections: WorkoutSection[]) =>
  sections.map((s) => ({
    type: s.type,
    title: s.title,
    exercises: s.exercises.map(({ id: _id, order: _o, ...rest }) => rest),
  }));

/** The editor payload for a client copy (ids kept → rows updated in place). */
const toUpdate = (
  workout: ClientWorkout,
  change: (sections: UpdateClientWorkoutRequest['sections']) => void = () => undefined,
): UpdateClientWorkoutRequest => {
  const sections: UpdateClientWorkoutRequest['sections'] = workout.sections.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    exercises: s.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exercise.id,
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
  }));
  change(sections);
  return { expectedVersion: workout.version, title: workout.title, sections };
};
const mainOf = <S extends { type: string }>(sections: S[]) =>
  must(
    sections.find((s) => s.type === 'MAIN'),
    'MAIN',
  );
const finisherOf = <S extends { type: string }>(sections: S[]) =>
  must(
    sections.find((s) => s.type === 'FINISHER'),
    'FINISHER',
  );

describe('Sprint 3 — Workout-Bibliothek on an isolated PostgreSQL', () => {
  let coachId: string;
  let otherCoachId: string;
  let adminId: string;
  let clientA: string;
  let clientB: string;
  let foreignClient: string;
  let coach: Call;
  let coachFlagOff: Call;
  let otherCoach: Call;
  let admin: Call;
  let asClientA: Call;
  const ex: Record<'warm' | 'bench' | 'pushups' | 'plank' | 'squat', string> = {
    warm: '',
    bench: '',
    pushups: '',
    plank: '',
    squat: '',
  };
  let template: WorkoutTemplate;
  let duplicate: WorkoutTemplate;
  let assignedA: ReturnType<typeof assignTemplateResponseSchema.parse>;
  let assignedB: ReturnType<typeof assignTemplateResponseSchema.parse>;

  const templateBody = (title = 'Oberkörper A') => ({
    title,
    category: 'UPPER_BODY',
    description: 'Fiktive Vorlage für Tests.',
    sections: [
      {
        type: 'WARMUP',
        title: 'Warm-up',
        exercises: [{ exerciseId: ex.warm, executionType: 'CHECKLIST' }],
      },
      {
        type: 'MAIN',
        exercises: [
          { exerciseId: ex.bench, executionType: 'STRENGTH', sets: 3, reps: 10, restSeconds: 90 },
          { exerciseId: ex.pushups, executionType: 'STRENGTH', sets: 3, repsMax: true },
        ],
      },
      {
        type: 'FINISHER',
        exercises: [
          { exerciseId: ex.squat, executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 60 },
          { exerciseId: ex.plank, executionType: 'INTERVAL' },
        ],
      },
    ],
  });
  const workoutOf = async (call: Call, dayId: string) =>
    clientWorkoutSchema.parse(ok(await call('GET', `${T}/days/${dayId}/workout`)));
  const dayCount = async () =>
    Number(must((await handle.db.select({ n: count() }).from(schema.trainingDays))[0]).n);

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s3-'));
    handle = await freshDatabase('vitruv_it_s3');
    adminId = await user('ADMIN', 'Admin');
    coachId = await user('COACH', 'Coach');
    otherCoachId = await user('COACH', 'Coach-Zwei');
    await handle.db.insert(schema.coachProfiles).values([
      { userId: coachId, displayName: 'Coach Eins' },
      { userId: otherCoachId, displayName: 'Coach Zwei' },
    ]);
    clientA = await clientOf(coachId, 'Anna');
    clientB = await clientOf(coachId, 'Bert');
    foreignClient = await clientOf(otherCoachId, 'Cora');
    coach = api('COACH', coachId);
    coachFlagOff = api('COACH', coachId, false);
    otherCoach = api('COACH', otherCoachId);
    admin = api('ADMIN', adminId);
    asClientA = api('CLIENT', clientA);
    for (const key of Object.keys(ex) as (keyof typeof ex)[]) {
      ex[key] = adminExerciseSchema.parse(
        ok(
          await coach('POST', `${T}/exercises`, {
            name: `S3 ${key} ${randomUUID().slice(0, 4)}`,
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

  it('1 + 22. creates a template with all four types; fields per type are validated server-side', async () => {
    template = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates`, templateBody()), 201),
    );
    expect(template).toMatchObject({
      version: 1,
      category: 'UPPER_BODY',
      ownedByMe: true,
      exerciseCount: 5,
    });
    expect(template.executionTypes).toEqual(['STRENGTH', 'TOTAL_REPS', 'INTERVAL', 'CHECKLIST']);
    const [bench, pushups] = mainOf(template.sections).exercises;
    expect(bench).toMatchObject({ sets: 3, reps: 10, restSeconds: 90, repsMax: false });
    expect(pushups).toMatchObject({ sets: 3, reps: null, repsMax: true });
    const [total, core] = finisherOf(template.sections).exercises;
    expect(total).toMatchObject({ totalReps: 60, restSeconds: 60, sets: null, reps: null });
    // Core defaults are stored explicitly: 5 rounds × 40 s work / 20 s rest.
    expect(core).toMatchObject({ sets: 5, durationSeconds: 40, restSeconds: 20 });

    const invalid = async (exercise: Record<string, unknown>) =>
      coach('POST', `${T}/templates`, {
        title: 'Ungültig',
        sections: [{ type: 'MAIN', exercises: [{ exerciseId: ex.bench, ...exercise }] }],
      });
    expect((await invalid({ executionType: 'STRENGTH', reps: 10 })).status).toBe(400); // no sets
    expect(
      (await invalid({ executionType: 'STRENGTH', sets: 3, reps: 10, repsMax: true })).status,
    ).toBe(400);
    expect((await invalid({ executionType: 'TOTAL_REPS', totalReps: 60, sets: 3 })).status).toBe(
      400,
    );
    expect((await invalid({ executionType: 'CHECKLIST', restSeconds: 30 })).status).toBe(400);
    expect((await invalid({ sets: 3, reps: 10 })).status).toBe(400); // type is required in templates
    expect(
      (
        await coach('POST', `${T}/templates`, {
          title: 'Leer',
          sections: [{ type: 'MAIN', exercises: [] }],
        })
      ).status,
    ).toBe(400);
  });

  it('2 + 25. edits a template (version +1); a stale version answers 409 and changes nothing', async () => {
    const body = { ...templateBody('Oberkörper A'), expectedVersion: 1 };
    const updated = workoutTemplateSchema.parse(
      ok(await coach('PUT', `${T}/templates/${template.id}`, body)),
    );
    expect(updated.version).toBe(2);
    expect(updated.id).toBe(template.id);
    const stale = await coach('PUT', `${T}/templates/${template.id}`, {
      ...body,
      title: 'Überschrieben',
    });
    expect(stale.status).toBe(409);
    const reread = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${template.id}`)),
    );
    expect(reread).toMatchObject({ version: 2, title: 'Oberkörper A' });
    template = reread;
  });

  it('3 + 4. duplicates into a new, editable template; the original stays unchanged', async () => {
    duplicate = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates/${template.id}/duplicate`), 201),
    );
    expect(duplicate.id).not.toBe(template.id);
    expect(duplicate).toMatchObject({
      title: 'Oberkörper A (Kopie)',
      version: 1,
      category: 'UPPER_BODY',
    });
    expect(content(duplicate.sections)).toEqual(content(template.sections));
    const duplicateIds = duplicate.sections.flatMap((s) => [s.id, ...s.exercises.map((e) => e.id)]);
    const originalIds = template.sections.flatMap((s) => [s.id, ...s.exercises.map((e) => e.id)]);
    expect(duplicateIds.some((id) => originalIds.includes(id))).toBe(false);

    const body = templateBody('Oberkörper B');
    must(body.sections[1]).exercises[0] = {
      exerciseId: ex.bench,
      executionType: 'STRENGTH',
      sets: 5,
      reps: 5,
      restSeconds: 120,
    };
    ok(await coach('PUT', `${T}/templates/${duplicate.id}`, { ...body, expectedVersion: 1 }));
    const original = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${template.id}`)),
    );
    expect(original).toEqual(template);
  });

  it('5 + 6 + 22 + 21. assigns to client A and B as independent copies with every config and the warm-up', async () => {
    const requestA = randomUUID();
    assignedA = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientA,
          requestId: requestA,
          date: DATE,
        }),
        201,
      ),
    );
    expect(assignedA).toMatchObject({
      created: true,
      clientId: clientA,
      programCreated: true,
      programStatus: 'DRAFT',
      date: DATE,
      scheduledWeekday: 3,
      sourceTemplateId: template.id,
      sourceTemplateVersion: 2,
      title: 'Oberkörper A',
    });
    // Idempotent retry of the same click: no second copy.
    const before = await dayCount();
    const retry = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientA,
          requestId: requestA,
          date: DATE,
        }),
        200,
      ),
    );
    expect(retry).toMatchObject({ created: false, dayId: assignedA.dayId });
    expect(await dayCount()).toBe(before);
    // Same request id for another client/template → 409, nothing written.
    expect(
      (
        await coach('POST', `${T}/templates/${duplicate.id}/assign`, {
          clientId: clientA,
          requestId: requestA,
          date: DATE,
        })
      ).status,
    ).toBe(409);

    assignedB = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientB,
          requestId: randomUUID(),
          date: DATE,
          title: 'Oberkörper A – Bert',
        }),
        201,
      ),
    );
    expect(assignedB.dayId).not.toBe(assignedA.dayId);
    expect(assignedB.programId).not.toBe(assignedA.programId);

    const copyA = await workoutOf(coach, assignedA.dayId);
    const copyB = await workoutOf(coach, assignedB.dayId);
    expect(content(copyA.sections)).toEqual(content(template.sections));
    expect(content(copyB.sections)).toEqual(content(template.sections));
    expect(copyB.title).toBe('Oberkörper A – Bert');
    expect(copyA.sourceTemplate).toEqual({ id: template.id, version: 2, title: 'Oberkörper A' });
    // Warm-up: own section, CHECKLIST, no numbers; the storage-only text is never shown.
    const warm = must(copyA.sections.find((s) => s.type === 'WARMUP')).exercises[0];
    expect(warm).toMatchObject({
      executionType: 'CHECKLIST',
      sets: null,
      reps: null,
      restSeconds: null,
      prescriptionText: null,
    });
    // Same client, another date → another independent copy.
    const again = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientA,
          requestId: randomUUID(),
          date: '2027-03-12',
        }),
        201,
      ),
    );
    expect(again).toMatchObject({
      programId: assignedA.programId,
      programCreated: false,
      date: '2027-03-12',
      scheduledWeekday: 5,
    });
    expect(again.weekId).not.toBe(assignedA.weekId);
  });

  it('7. editing client A’s copy changes neither client B nor the template', async () => {
    const copyA = await workoutOf(coach, assignedA.dayId);
    const saved = clientWorkoutSchema.parse(
      ok(
        await coach(
          'PUT',
          `${T}/days/${assignedA.dayId}/workout`,
          toUpdate(copyA, (sections) => {
            must(mainOf(sections).exercises[0]).reps = 12;
          }),
        ),
      ),
    );
    expect(mainOf(saved.sections).exercises[0]).toMatchObject({ sets: 3, reps: 12 });
    // Stable ids: the edited row is the same row.
    expect(must(mainOf(saved.sections).exercises[0]).id).toBe(
      must(mainOf(copyA.sections).exercises[0]).id,
    );

    const copyB = await workoutOf(coach, assignedB.dayId);
    clientWorkoutSchema.parse(
      ok(
        await coach(
          'PUT',
          `${T}/days/${assignedB.dayId}/workout`,
          toUpdate(copyB, (sections) => {
            Object.assign(must(mainOf(sections).exercises[0]), { sets: 4, reps: 8 });
          }),
        ),
      ),
    );
    expect(mainOf((await workoutOf(coach, assignedA.dayId)).sections).exercises[0]).toMatchObject({
      sets: 3,
      reps: 12,
    });
    expect(mainOf((await workoutOf(coach, assignedB.dayId)).sections).exercises[0]).toMatchObject({
      sets: 4,
      reps: 8,
    });
    const tpl = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${template.id}`)),
    );
    expect(mainOf(tpl.sections).exercises[0]).toMatchObject({ sets: 3, reps: 10 });
    expect(tpl.version).toBe(2);
  });

  it('8. a later template change never reaches existing copies', async () => {
    const body = templateBody('Oberkörper A');
    must(body.sections[1]).exercises[0] = {
      exerciseId: ex.bench,
      executionType: 'STRENGTH',
      sets: 3,
      reps: 15,
      restSeconds: 90,
    };
    const v3 = workoutTemplateSchema.parse(
      ok(await coach('PUT', `${T}/templates/${template.id}`, { ...body, expectedVersion: 2 })),
    );
    expect(v3.version).toBe(3);
    const a = await workoutOf(coach, assignedA.dayId);
    const b = await workoutOf(coach, assignedB.dayId);
    expect(mainOf(a.sections).exercises[0]).toMatchObject({ reps: 12 });
    expect(mainOf(b.sections).exercises[0]).toMatchObject({ sets: 4, reps: 8 });
    expect(a.sourceTemplate?.version).toBe(2); // lineage = version at assignment time
    template = v3;
  });

  it('10 + 11 + 12. a started session keeps its snapshot; finished results never change', async () => {
    ok(await coach('POST', `${T}/programs/${assignedA.programId}/activate`));
    const started = startWorkoutResponseSchema.parse(
      ok(await asClientA('POST', W, { trainingDayId: assignedA.dayId }), 201),
    );
    const session = started.session;
    const bench = must(
      session.exercises.find((e) => e.target.reps === 12),
      'bench in snapshot',
    );
    expect(bench.target).toMatchObject({ sets: 3, reps: 12 });

    // Coach edits the ACTIVE copy while the client trains → snapshot untouched.
    let copy = await workoutOf(coach, assignedA.dayId);
    expect(copy.sessions).toEqual({ inProgress: 1, completed: 0 });
    copy = clientWorkoutSchema.parse(
      ok(
        await coach(
          'PUT',
          `${T}/days/${assignedA.dayId}/workout`,
          toUpdate(copy, (s) => {
            must(mainOf(s).exercises[0]).reps = 20;
          }),
        ),
      ),
    );
    const during = workoutSessionSchema.parse(ok(await asClientA('GET', `${W}/${session.id}`)));
    expect(must(during.exercises.find((e) => e.id === bench.id)).target).toMatchObject({
      sets: 3,
      reps: 12,
    });

    // Record a result and finish.
    ok(
      await asClientA('PATCH', `${W}/${session.id}/exercises/${bench.id}/sets/1`, {
        completed: true,
        actualReps: 11,
      }),
    );
    ok(await asClientA('POST', `${W}/${session.id}/complete`));
    const finished = workoutSessionSchema.parse(ok(await asClientA('GET', `${W}/${session.id}`)));

    // Coach removes the exercise from the copy entirely → the finished session is unchanged.
    copy = await workoutOf(coach, assignedA.dayId);
    expect(copy.sessions).toEqual({ inProgress: 0, completed: 1 });
    ok(
      await coach(
        'PUT',
        `${T}/days/${assignedA.dayId}/workout`,
        toUpdate(copy, (s) => {
          mainOf(s).exercises.shift();
        }),
      ),
    );
    const after = workoutSessionSchema.parse(ok(await asClientA('GET', `${W}/${session.id}`)));
    expect(after.exercises).toHaveLength(finished.exercises.length);
    expect(after.status).toBe('COMPLETED');
    const benchAfter = must(after.exercises.find((e) => e.id === bench.id));
    expect(benchAfter.target).toMatchObject({ sets: 3, reps: 12 });
    expect(benchAfter.sets[0]).toMatchObject({ actualReps: 11 });
  });

  it('9. archiving a template keeps every assigned copy; archived templates are not assignable', async () => {
    const archived = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates/${template.id}/archive`)),
    );
    expect(archived.archivedAt).not.toBeNull();
    expect((await workoutOf(coach, assignedB.dayId)).sourceTemplate?.id).toBe(template.id);
    ok(await coach('GET', `${T}/days/${assignedA.dayId}/workout`));
    const active = workoutTemplateListSchema.parse(ok(await coach('GET', `${T}/templates`)));
    expect(active.items.map((t) => t.id)).not.toContain(template.id);
    const archivedList = workoutTemplateListSchema.parse(
      ok(await coach('GET', `${T}/templates?status=archived`)),
    );
    expect(archivedList.items.map((t) => t.id)).toContain(template.id);
    const before = await dayCount();
    expect(
      (
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientB,
          requestId: randomUUID(),
          date: DATE,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await coach('PUT', `${T}/templates/${template.id}`, {
          ...templateBody(),
          expectedVersion: 3,
        })
      ).status,
    ).toBe(409);
    expect(await dayCount()).toBe(before);
    ok(await coach('POST', `${T}/templates/${template.id}/restore`));
  });

  it('13 + 15. other coaches see nothing; cross-client ids are rejected', async () => {
    for (const [method, path, body] of [
      ['GET', `${T}/templates/${template.id}`],
      ['PUT', `${T}/templates/${template.id}`, { ...templateBody(), expectedVersion: 3 }],
      ['POST', `${T}/templates/${template.id}/duplicate`],
      ['POST', `${T}/templates/${template.id}/archive`],
      [
        'POST',
        `${T}/templates/${template.id}/assign`,
        { clientId: foreignClient, requestId: randomUUID(), date: DATE },
      ],
      ['GET', `${T}/days/${assignedA.dayId}/workout`],
      ['GET', `${T}/clients/${clientA}/week`],
    ] as const) {
      expect((await otherCoach(method, path, body)).status, `${method} ${path}`).toBe(404);
    }
    const copy = await workoutOf(coach, assignedA.dayId);
    expect(
      (await otherCoach('PUT', `${T}/days/${assignedA.dayId}/workout`, toUpdate(copy))).status,
    ).toBe(404);
    const theirs = workoutTemplateListSchema.parse(ok(await otherCoach('GET', `${T}/templates`)));
    expect(theirs.total).toBe(0);
    // Own template, but a client of another coach → 404.
    expect(
      (
        await coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: foreignClient,
          requestId: randomUUID(),
          date: DATE,
        })
      ).status,
    ).toBe(404);
    // Rows of client B's day can not be moved into client A's day.
    const copyB = await workoutOf(coach, assignedB.dayId);
    const hijack = toUpdate(copy, (sections) => {
      mainOf(sections).exercises.push({
        ...must(mainOf(copyB.sections).exercises[0]),
        id: must(mainOf(copyB.sections).exercises[0]).id,
        exerciseId: ex.bench,
      } as never);
    });
    expect((await coach('PUT', `${T}/days/${assignedA.dayId}/workout`, hijack)).status).toBe(400);
    expect(mainOf((await workoutOf(coach, assignedB.dayId)).sections).exercises[0]).toMatchObject({
      sets: 4,
      reps: 8,
    });
    // ADMIN sees every template (owner name shown).
    const all = workoutTemplateListSchema.parse(
      ok(await admin('GET', `${T}/templates?pageSize=100`)),
    );
    expect(all.items.find((t) => t.id === template.id)).toMatchObject({
      ownedByMe: false,
      ownerName: 'Coach',
    });
  });

  it('14. a client can neither read nor write templates', async () => {
    expect((await asClientA('GET', `${T}/templates`)).status).toBe(403);
    expect((await asClientA('POST', `${T}/templates`, templateBody())).status).toBe(403);
    expect(
      (
        await asClientA('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientA,
          requestId: randomUUID(),
          date: DATE,
        })
      ).status,
    ).toBe(403);
    expect((await asClientA('PUT', `${T}/days/${assignedA.dayId}/workout`, {})).status).toBe(403);
  });

  it('16. concurrent assignment: one request id → one copy; parallel first assignments → one program', async () => {
    const fresh = await clientOf(coachId, 'Dora');
    const requestId = randomUUID();
    const before = await dayCount();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: fresh,
          requestId,
          date: DATE,
        }),
      ),
    );
    for (const res of results) expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(new Set(results.map((r) => r.body.dayId)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await dayCount()).toBe(before + 1);

    const another = await clientOf(coachId, 'Emil');
    const parallel = await Promise.all(
      ['2027-03-02', '2027-03-04', '2027-03-05', '2027-03-06'].map((date) =>
        coach('POST', `${T}/templates/${template.id}/assign`, {
          clientId: another,
          requestId: randomUUID(),
          date,
        }),
      ),
    );
    for (const res of parallel) expect(res.status, JSON.stringify(res.body)).toBe(201);
    const programs = await handle.db
      .select({ id: schema.trainingPrograms.id })
      .from(schema.trainingPrograms)
      .where(eq(schema.trainingPrograms.clientUserId, another));
    expect(programs).toHaveLength(1);
  });

  it('17 + 18. Trainingswoche shows the right workout on the right date; the legacy list stays as it is', async () => {
    const legacy = clientPlanSchema.parse(
      ok(
        await coach('PUT', `${T}/clients/${clientB}/plan`, {
          startsOn: '2027-01-01',
          endsOn: null,
          items: [{ exerciseId: ex.squat, note: 'Alte Liste' }],
        }),
      ),
    );
    const week = clientTrainingWeekSchema.parse(
      ok(await coach('GET', `${T}/clients/${clientB}/week?date=${DATE}`)),
    );
    expect(week).toMatchObject({
      weekStart: '2027-03-01',
      weekEnd: '2027-03-07',
      weekIndex: 0,
      weekId: assignedB.weekId,
    });
    const wednesday = must(week.days.find((d) => d.date === DATE));
    expect(wednesday.weekday).toBe(3);
    expect(wednesday.workouts).toEqual([
      expect.objectContaining({
        dayId: assignedB.dayId,
        title: 'Oberkörper A – Bert',
        sourceTemplateId: template.id,
        workoutStatus: 'NOT_STARTED',
      }),
    ]);
    expect(week.days.filter((d) => d.date !== DATE).every((d) => d.workouts.length === 0)).toBe(
      true,
    );
    expect(week.legacyPlan).toMatchObject({ itemCount: 1, startsOn: '2027-01-01' });
    // The legacy plan itself is unchanged and still served.
    expect(clientPlanSchema.parse(ok(await coach('GET', `${T}/clients/${clientB}/plan`)))).toEqual(
      legacy,
    );
    // Next week: the client-A copy assigned for Friday 2027-03-12.
    const next = clientTrainingWeekSchema.parse(
      ok(await coach('GET', `${T}/clients/${clientA}/week?date=2027-03-10`)),
    );
    expect(must(next.days.find((d) => d.date === '2027-03-12')).workouts).toHaveLength(1);
    expect(next.weekIndex).toBe(1);
  });

  it('19. old mobile/API contracts still parse (client active program, admin program tree)', async () => {
    const active = clientActiveTrainingResponseSchema.parse(
      ok(await asClientA('GET', '/v1/client/training/active')),
    );
    const day = must(must(active.program).weeks[0]).days.find((d) => d.id === assignedA.dayId);
    expect(day).toMatchObject({ scheduledWeekday: 3, workoutStatus: 'COMPLETED' });
    const warm = must(must(day).sections.find((s) => s.type === 'WARMUP')).exercises[0];
    expect(warm).toMatchObject({ executionType: 'CHECKLIST', prescriptionText: null });
    const tree = adminProgramSchema.parse(
      ok(await coach('GET', `${T}/programs/${assignedA.programId}`)),
    );
    expect(must(tree.weeks[0]).days[0]).toMatchObject({
      sourceTemplateId: template.id,
      sourceTemplateVersion: 2,
    });
  });

  it('20. flag OFF (production default): extended types can not be created or assigned anywhere', async () => {
    expect(
      trainingCapabilitiesSchema.parse(ok(await coachFlagOff('GET', `${T}/capabilities`))),
    ).toEqual({
      extendedExecutionTypes: false,
      requiredAppCapabilityLevel: 2,
    });
    expect(
      trainingCapabilitiesSchema.parse(ok(await coach('GET', `${T}/capabilities`)))
        .extendedExecutionTypes,
    ).toBe(true);
    expect((await coachFlagOff('POST', `${T}/templates`, templateBody('Gesperrt'))).status).toBe(
      409,
    );
    const strengthOnly = {
      title: 'Nur Kraft',
      category: 'LOWER_BODY',
      sections: [
        {
          type: 'MAIN',
          exercises: [
            { exerciseId: ex.squat, executionType: 'STRENGTH', sets: 3, reps: 10 },
            { exerciseId: ex.squat, executionType: 'TOTAL_REPS', totalReps: 50 },
          ],
        },
      ],
    };
    ok(await coachFlagOff('POST', `${T}/templates`, strengthOnly), 201);
    const maxOnly = {
      ...strengthOnly,
      sections: [
        {
          type: 'MAIN',
          exercises: [{ exerciseId: ex.squat, executionType: 'STRENGTH', sets: 3, repsMax: true }],
        },
      ],
    };
    expect((await coachFlagOff('POST', `${T}/templates`, maxOnly)).status).toBe(409);
    const before = await dayCount();
    expect(
      (
        await coachFlagOff('POST', `${T}/templates/${template.id}/assign`, {
          clientId: clientB,
          requestId: randomUUID(),
          date: DATE,
        })
      ).status,
    ).toBe(409);
    expect((await coachFlagOff('POST', `${T}/templates/${template.id}/duplicate`)).status).toBe(
      409,
    );
    expect(await dayCount()).toBe(before);
    // The existing Sprint 6 assignment endpoint is gated too (not only the new library).
    const copyB = await workoutOf(coach, assignedB.dayId);
    const section = mainOf(copyB.sections);
    expect(
      (
        await coachFlagOff('POST', `${T}/sections/${section.id}/assignments`, {
          exerciseId: ex.plank,
          executionType: 'INTERVAL',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await coachFlagOff('POST', `${T}/sections/${section.id}/assignments`, {
          exerciseId: ex.plank,
          sets: 3,
          reps: 10,
        })
      ).status,
    ).toBeLessThan(300);
    // Client-copy editor: introducing CHECKLIST is refused; unchanged existing rows may stay.
    const fresh = await workoutOf(coachFlagOff, assignedB.dayId);
    ok(await coachFlagOff('PUT', `${T}/days/${assignedB.dayId}/workout`, toUpdate(fresh)));
    const reloaded = await workoutOf(coachFlagOff, assignedB.dayId);
    expect(
      (
        await coachFlagOff(
          'PUT',
          `${T}/days/${assignedB.dayId}/workout`,
          toUpdate(reloaded, (s) => {
            mainOf(s).exercises.push({ exerciseId: ex.warm, executionType: 'CHECKLIST' });
          }),
        )
      ).status,
    ).toBe(409);
  });

  it('23. library: server-side pagination, search and type filter without an artificial limit', async () => {
    const lowerCoach = await user('COACH', 'Coach-Drei');
    const call = api('COACH', lowerCoach);
    for (let i = 0; i < 27; i++) {
      ok(
        await call('POST', `${T}/templates`, {
          title: `${i % 3 === 0 ? 'Beine' : 'Rücken'} ${String(i).padStart(2, '0')}`,
          category: i % 3 === 0 ? 'LOWER_BODY' : 'UPPER_BODY',
          sections: [
            {
              type: 'MAIN',
              exercises: [{ exerciseId: ex.squat, executionType: 'STRENGTH', sets: 3, reps: 8 }],
            },
          ],
        }),
        201,
      );
    }
    const page3 = workoutTemplateListSchema.parse(
      ok(await call('GET', `${T}/templates?pageSize=10&page=3`)),
    );
    expect(page3).toMatchObject({ total: 27, page: 3, pageSize: 10 });
    expect(page3.items).toHaveLength(7);
    const lower = workoutTemplateListSchema.parse(
      ok(await call('GET', `${T}/templates?category=LOWER_BODY&pageSize=100`)),
    );
    expect(lower.total).toBe(9);
    expect(lower.items.every((t) => t.category === 'LOWER_BODY')).toBe(true);
    const search = workoutTemplateListSchema.parse(
      ok(await call('GET', `${T}/templates?q=${encodeURIComponent('rücken 1')}`)),
    );
    expect(search.items.map((t) => t.title).sort()).toEqual([
      'Rücken 10',
      'Rücken 11',
      'Rücken 13',
      'Rücken 14',
      'Rücken 16',
      'Rücken 17',
      'Rücken 19',
    ]);
    // LIKE wildcards are literal.
    expect(
      workoutTemplateListSchema.parse(ok(await call('GET', `${T}/templates?q=%25`))).total,
    ).toBe(0);
    expect((await call('GET', `${T}/templates?pageSize=101`)).status).toBe(400);
  });

  it('24. a failing save leaves no partial copy and no half-updated template', async () => {
    const tpl = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Wird deaktiviert',
          sections: [
            {
              type: 'MAIN',
              exercises: [{ exerciseId: ex.squat, executionType: 'STRENGTH', sets: 3, reps: 8 }],
            },
          ],
        }),
        201,
      ),
    );
    const fresh = await clientOf(coachId, 'Fritz');
    const countRows = async (
      table:
        typeof schema.trainingWeeks | typeof schema.trainingPrograms | typeof schema.trainingDays,
    ) => Number(must((await handle.db.select({ n: count() }).from(table))[0]).n);
    const before = [
      await countRows(schema.trainingPrograms),
      await countRows(schema.trainingWeeks),
      await countRows(schema.trainingDays),
    ];
    ok(await coach('POST', `${T}/exercises/${ex.squat}/deactivate`));
    try {
      const failed = await coach('POST', `${T}/templates/${tpl.id}/assign`, {
        clientId: fresh,
        requestId: randomUUID(),
        date: DATE,
      });
      expect(failed.status).toBe(409);
      expect([
        await countRows(schema.trainingPrograms),
        await countRows(schema.trainingWeeks),
        await countRows(schema.trainingDays),
      ]).toEqual(before);
    } finally {
      ok(await coach('POST', `${T}/exercises/${ex.squat}/reactivate`));
    }
    // Template update failing mid-way (unknown exercise in the 2nd section) → nothing changed.
    const bad = await coach('PUT', `${T}/templates/${tpl.id}`, {
      expectedVersion: 1,
      title: 'Halb gespeichert?',
      sections: [
        {
          type: 'MAIN',
          exercises: [{ exerciseId: ex.bench, executionType: 'STRENGTH', sets: 1, reps: 1 }],
        },
        {
          type: 'FINISHER',
          exercises: [{ exerciseId: randomUUID(), executionType: 'STRENGTH', sets: 1, reps: 1 }],
        },
      ],
    });
    expect(bad.status).toBe(400);
    const reread = workoutTemplateSchema.parse(ok(await coach('GET', `${T}/templates/${tpl.id}`)));
    expect(reread).toEqual(tpl);
  });

  it('25. concurrent edits of one client copy: exactly one wins, the other gets 409', async () => {
    const copy = await workoutOf(coach, assignedB.dayId);
    const edit = (reps: number) =>
      coach(
        'PUT',
        `${T}/days/${assignedB.dayId}/workout`,
        toUpdate(copy, (s) => {
          Object.assign(must(mainOf(s).exercises[0]), { sets: 4, reps });
        }),
      );
    const results = await Promise.all([edit(6), edit(7)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200);
    const stored = await workoutOf(coach, assignedB.dayId);
    expect(must(mainOf(stored.sections).exercises[0]).reps).toBe(
      must(mainOf(clientWorkoutSchema.parse(must(winner).body).sections).exercises[0]).reps,
    );
    // The loser can not overwrite later with its stale version either.
    expect((await edit(9)).status).toBe(409);
  });
});
