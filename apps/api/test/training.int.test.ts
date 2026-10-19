import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  adminProgramSchema,
  authSessionResponseSchema,
  clientActiveTrainingResponseSchema,
  clientTrainingProgramSchema,
  type AdminProgram,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { pgErrorCode } from '../src/lib/errors';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits } from './helpers';
import { png } from './media-fixtures';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Sprint 6 Training Engine against the real schema. Every test: ONE rolled-back transaction —
 * no exercise, program, structure, media row or audit event survives. Fictional content only.
 */
const PASSWORD = 'ein sicheres Test-Passwort';
const T = '/v1/admin/training';

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
  const user = async (role: UserRole) => {
    const email = `it-train-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const [row] = await tx
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) })
      .returning();
    const login = await call('POST', '/v1/auth/login', undefined, {
      email,
      password: PASSWORD,
      clientType: role === 'CLIENT' ? 'MOBILE' : 'WEB',
    });
    return {
      id: must(row).id,
      token: authSessionResponseSchema.parse(login.body).tokens.accessToken,
    };
  };
  const coach = async (name: string) => {
    const u = await user('COACH');
    await tx.insert(schema.coachProfiles).values({ userId: u.id, displayName: name });
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
  const exercise = async (
    token: string,
    name = `Übung ${randomUUID().slice(0, 6)}`,
    extra = {},
  ) => {
    const res = await call('POST', `${T}/exercises`, token, { name, ...extra });
    expect(res.status).toBe(201);
    return adminExerciseSchema.parse(res.body);
  };
  const program = (res: { status: number; body: Record<string, unknown> }) => {
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return adminProgramSchema.parse(res.body);
  };
  /** A complete small program: 1 week, 1 day with the 3 default sections, one exercise in MAIN. */
  const fullProgram = async (
    token: string,
    clientId: string,
    exerciseId: string,
    title = 'Plan A',
  ) => {
    let p = program(await call('POST', `${T}/clients/${clientId}/programs`, token, { title }));
    p = program(await call('POST', `${T}/programs/${p.id}/weeks`, token, {}));
    const week = must(p.weeks[0]);
    p = program(await call('POST', `${T}/weeks/${week.id}/days`, token, { title: 'Oberkörper A' }));
    const main = must(must(must(p.weeks[0]).days[0]).sections.find((s) => s.type === 'MAIN'));
    p = program(
      await call('POST', `${T}/sections/${main.id}/assignments`, token, {
        exerciseId,
        sets: 4,
        reps: 12,
        restSeconds: 60,
      }),
    );
    return p;
  };
  return { app, call, user, coach, client, exercise, program, fullProgram };
}

const firstAssignment = (p: AdminProgram) =>
  must(p.weeks[0]?.days[0]?.sections.find((s) => s.assignments.length > 0)?.assignments[0]);

describe.skipIf(!databaseUrl)('training engine (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  beforeAll(async () => {
    handle = openTestDatabase();
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-training-it-'));
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  describe('exercise library', () => {
    it('creates, searches, edits, deactivates; names are unique; referenced exercises can not be deleted', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.user('ADMIN');
        const coach = await t.coach('Coach Lib');
        const marker = randomUUID().slice(0, 6);
        const pull = await t.exercise(coach.token, `Klimmzüge ${marker}`, {
          description: 'Schulterblätter aktiv.',
        });
        await t.exercise(admin.token, `Goblet Squat ${marker}`);
        const dup = await t.call('POST', `${T}/exercises`, coach.token, {
          name: `klimmzüge ${marker}`,
        });
        expect(dup.status).toBe(409);

        const search = await t.call(
          'GET',
          `${T}/exercises?q=${encodeURIComponent(`klimm`)}`,
          coach.token,
        );
        expect((search.body.items as { id: string }[]).map((e) => e.id)).toContain(pull.id);

        const edited = await t.call('PATCH', `${T}/exercises/${pull.id}`, admin.token, {
          name: `Klimmzüge eng ${marker}`,
        });
        expect(edited.status).toBe(200);
        const off = adminExerciseSchema.parse(
          (await t.call('POST', `${T}/exercises/${pull.id}/deactivate`, coach.token)).body,
        );
        expect(off.active).toBe(false);
        const active = await t.call('GET', `${T}/exercises?q=${marker}`, coach.token);
        expect((active.body.items as { id: string }[]).map((e) => e.id)).not.toContain(pull.id);
        const all = await t.call('GET', `${T}/exercises?q=${marker}&status=all`, coach.token);
        expect((all.body.items as { id: string }[]).map((e) => e.id)).toContain(pull.id);
        await t.call('POST', `${T}/exercises/${pull.id}/reactivate`, coach.token);

        // referenced → the DB refuses a hard delete
        const client = await t.client(coach.id);
        await t.fullProgram(coach.token, client.id, pull.id);
        let code: string | undefined;
        try {
          await tx.transaction(async (inner) => {
            await inner.delete(schema.exercises).where(eq(schema.exercises.id, pull.id));
          });
        } catch (error) {
          code = pgErrorCode(error);
        }
        expect(code).toBe('23001');
        const events = await tx
          .select({ type: schema.authEvents.type })
          .from(schema.authEvents)
          .where(eq(schema.authEvents.entityId, pull.id));
        expect(events.map((e) => e.type)).toEqual(
          expect.arrayContaining([
            'EXERCISE_CREATED',
            'EXERCISE_DEACTIVATED',
            'EXERCISE_REACTIVATED',
          ]),
        );
      });
    });

    it('a deactivated exercise stays valid where used but can not be newly assigned', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Inaktiv');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token);
        const p = await t.fullProgram(coach.token, client.id, ex.id);
        await t.call('POST', `${T}/exercises/${ex.id}/deactivate`, coach.token);
        const reloaded = adminProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${p.id}`, coach.token)).body,
        );
        expect(firstAssignment(reloaded).exercise.active).toBe(false);
        const section = must(reloaded.weeks[0]?.days[0]?.sections[0]);
        const add = await t.call('POST', `${T}/sections/${section.id}/assignments`, coach.token, {
          exerciseId: ex.id,
          sets: 3,
          reps: 10,
        });
        expect(add.status).toBe(400);
      });
    });
  });

  describe('object-level authorization (nested id guessing)', () => {
    it('COACH A manages Client A; every Client B resource by id is 404 for A — read and write', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach('Coach A');
        const coachB = await t.coach('Coach B');
        const clientA = await t.client(coachA.id);
        const clientB = await t.client(coachB.id);
        const ex = await t.exercise(coachA.token);

        const own = await t.fullProgram(coachA.token, clientA.id, ex.id, 'Plan A');
        expect(own.clientId).toBe(clientA.id);
        const theirs = await t.fullProgram(coachB.token, clientB.id, ex.id, 'Plan B');
        const week = must(theirs.weeks[0]);
        const day = must(week.days[0]);
        const section = must(day.sections[0]);
        const assignment = firstAssignment(theirs);

        const attempts: [string, string, unknown?][] = [
          ['GET', `${T}/clients/${clientB.id}/programs`],
          ['POST', `${T}/clients/${clientB.id}/programs`, { title: 'Übernahme' }],
          ['GET', `${T}/programs/${theirs.id}`],
          ['GET', `${T}/programs/${theirs.id}/preview`],
          ['PATCH', `${T}/programs/${theirs.id}`, { title: 'Gekapert' }],
          ['DELETE', `${T}/programs/${theirs.id}`],
          ['POST', `${T}/programs/${theirs.id}/activate`],
          ['POST', `${T}/programs/${theirs.id}/archive`],
          ['POST', `${T}/programs/${theirs.id}/weeks`, {}],
          ['POST', `${T}/programs/${theirs.id}/weeks/reorder`, { ids: [week.id] }],
          ['PATCH', `${T}/weeks/${week.id}`, { title: 'X' }],
          ['DELETE', `${T}/weeks/${week.id}`],
          ['POST', `${T}/weeks/${week.id}/duplicate`],
          ['POST', `${T}/weeks/${week.id}/days`, { title: 'X' }],
          ['POST', `${T}/weeks/${week.id}/days/reorder`, { ids: [day.id] }],
          ['PATCH', `${T}/days/${day.id}`, { title: 'X' }],
          ['DELETE', `${T}/days/${day.id}`],
          ['POST', `${T}/days/${day.id}/duplicate`],
          ['POST', `${T}/days/${day.id}/sections`, { type: 'MAIN' }],
          ['POST', `${T}/days/${day.id}/sections/reorder`, { ids: day.sections.map((s) => s.id) }],
          ['PATCH', `${T}/sections/${section.id}`, { title: 'X' }],
          ['DELETE', `${T}/sections/${section.id}`],
          [
            'POST',
            `${T}/sections/${section.id}/assignments`,
            { exerciseId: ex.id, sets: 1, reps: 1 },
          ],
          ['POST', `${T}/sections/${section.id}/assignments/reorder`, { ids: [] }],
          ['PATCH', `${T}/assignments/${assignment.id}`, { sets: 9 }],
          ['DELETE', `${T}/assignments/${assignment.id}`],
        ];
        for (const [method, path, body] of attempts) {
          const res = await t.call(method, path, coachA.token, body);
          // 404 — indistinguishable from a missing id (the reorder with [] fails validation first)
          expect([404, 400], `${method} ${path}`).toContain(res.status);
          if (res.status === 400) expect(path).toMatch(/reorder/);
          expect(JSON.stringify(res.body)).not.toContain('Plan B');
        }
        // nothing changed
        const untouched = adminProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${theirs.id}`, coachB.token)).body,
        );
        expect(untouched).toMatchObject({
          title: 'Plan B',
          status: 'DRAFT',
          weekCount: 1,
          assignmentCount: 1,
        });
        expect(firstAssignment(untouched).sets).toBe(4);
        // the same nested ids are reachable for coach B and ADMIN
        const admin = await t.user('ADMIN');
        expect((await t.call('GET', `${T}/programs/${theirs.id}`, admin.token)).status).toBe(200);
        expect(
          (await t.call('PATCH', `${T}/assignments/${assignment.id}`, coachB.token, { sets: 5 }))
            .status,
        ).toBe(200);
        // an ADMIN sees every client's programs; a forged client id is still 404
        expect(
          (await t.call('GET', `${T}/clients/${clientA.id}/programs`, admin.token)).status,
        ).toBe(200);
        expect(
          (await t.call('GET', `${T}/clients/${randomUUID()}/programs`, admin.token)).status,
        ).toBe(404);
        // reassignment moves training access with the client
        await tx
          .update(schema.coachClientAssignments)
          .set({ endedAt: new Date() })
          .where(eq(schema.coachClientAssignments.clientUserId, clientA.id));
        expect((await t.call('GET', `${T}/programs/${own.id}`, coachA.token)).status).toBe(404);
      });
    });

    it('CLIENT and anonymous callers never reach the admin training API', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach C');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token);
        const p = await t.fullProgram(coach.token, client.id, ex.id);
        for (const [method, path] of [
          ['GET', `${T}/exercises`],
          ['GET', `${T}/clients/${client.id}/programs`],
          ['GET', `${T}/programs/${p.id}`],
          ['POST', `${T}/programs/${p.id}/activate`],
        ] as const) {
          expect((await t.call(method, path, client.token)).status).toBe(403);
          expect((await t.call(method, path)).status).toBe(401);
        }
      });
    });
  });

  describe('client visibility + activation lifecycle', () => {
    it('draft hidden → activate → exact program → second activation retires the first atomically', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Life');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token, `Plank ${randomUUID().slice(0, 4)}`, {
          description: 'Körper gerade halten.',
        });
        const active = () => t.call('GET', '/v1/client/training/active', client.token);

        expect((await active()).body).toEqual({ program: null });
        const first = await t.fullProgram(coach.token, client.id, ex.id, 'Erster Plan');
        expect((await active()).body).toEqual({ program: null }); // DRAFT invisible

        const activated = await t.call('POST', `${T}/programs/${first.id}/activate`, coach.token);
        expect(activated.status).toBe(200);
        expect(activated.body.retiredProgramId).toBeNull();
        const seen = clientActiveTrainingResponseSchema.parse((await active()).body);
        const program = must(seen.program);
        expect(program).toMatchObject({ id: first.id, title: 'Erster Plan' });
        const exercise = must(
          program.weeks[0]?.days[0]?.sections.find((s) => s.type === 'MAIN')?.exercises[0],
        );
        expect(exercise).toMatchObject({
          assignmentId: firstAssignment(first).id,
          sets: 4,
          reps: 12,
          restSeconds: 60,
          instructions: 'Körper gerade halten.',
        });
        expect(program.weeks[0]?.days[0]?.sections.map((s) => s.type)).toEqual([
          'WARMUP',
          'MAIN',
          'FINISHER',
        ]);
        const raw = JSON.stringify(seen);
        for (const secret of [
          'createdBy',
          'storageKey',
          'internalNotes',
          'clientId',
          'status',
          'DRAFT',
        ]) {
          expect(raw).not.toContain(secret);
        }

        const second = await t.fullProgram(coach.token, client.id, ex.id, 'Zweiter Plan');
        expect(
          must(clientActiveTrainingResponseSchema.parse((await active()).body).program).id,
        ).toBe(first.id);
        const swap = await t.call('POST', `${T}/programs/${second.id}/activate`, coach.token);
        expect(swap.body.retiredProgramId).toBe(first.id);
        expect(
          must(clientActiveTrainingResponseSchema.parse((await active()).body).program).id,
        ).toBe(second.id);
        const states = await tx
          .select({ id: schema.trainingPrograms.id, status: schema.trainingPrograms.status })
          .from(schema.trainingPrograms)
          .where(eq(schema.trainingPrograms.clientUserId, client.id));
        expect(Object.fromEntries(states.map((s) => [s.id, s.status]))).toEqual({
          [first.id]: 'ARCHIVED',
          [second.id]: 'ACTIVE',
        });
        // archived programs are read-only; only drafts can be deleted
        expect(
          (await t.call('POST', `${T}/programs/${first.id}/weeks`, coach.token, {})).status,
        ).toBe(409);
        expect((await t.call('DELETE', `${T}/programs/${second.id}`, coach.token)).status).toBe(
          409,
        );
        // complete → client sees nothing again
        expect(
          (await t.call('POST', `${T}/programs/${second.id}/complete`, coach.token)).status,
        ).toBe(200);
        expect((await active()).body).toEqual({ program: null });
        const events = await tx
          .select({ type: schema.authEvents.type })
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, client.id));
        expect(events.map((e) => e.type)).toEqual(
          expect.arrayContaining([
            'PROGRAM_CREATED',
            'PROGRAM_ACTIVATED',
            'PROGRAM_ARCHIVED',
            'PROGRAM_COMPLETED',
          ]),
        );
        // the client endpoint takes no client id and admin/coach accounts have no "own" program
        expect((await t.call('GET', '/v1/client/training/active', coach.token)).status).toBe(403);
      });
    });

    it('rejects activation without week, day or exercise; the DB forbids two ACTIVE programs', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Val');
        const client = await t.client(coach.id);
        const empty = t.program(
          await t.call('POST', `${T}/clients/${client.id}/programs`, coach.token, {
            title: 'Leer',
          }),
        );
        const noWeek = await t.call('POST', `${T}/programs/${empty.id}/activate`, coach.token);
        expect(noWeek.status).toBe(400);
        expect(JSON.stringify(noWeek.body)).toContain('Woche');
        let p = t.program(await t.call('POST', `${T}/programs/${empty.id}/weeks`, coach.token, {}));
        const noDay = await t.call('POST', `${T}/programs/${empty.id}/activate`, coach.token);
        expect(JSON.stringify(noDay.body)).toContain('Trainingstag');
        p = t.program(
          await t.call('POST', `${T}/weeks/${must(p.weeks[0]).id}/days`, coach.token, {
            title: 'Tag',
            withDefaultSections: false,
          }),
        );
        const noExercise = await t.call('POST', `${T}/programs/${empty.id}/activate`, coach.token);
        expect(noExercise.status).toBe(400);
        expect(JSON.stringify(noExercise.body)).toContain('Übung');
        expect(p.status).toBe('DRAFT');

        const ex = await t.exercise(coach.token);
        const a = await t.fullProgram(coach.token, client.id, ex.id, 'A');
        await t.call('POST', `${T}/programs/${a.id}/activate`, coach.token);
        let code: string | undefined;
        try {
          await tx.transaction(async (inner) => {
            await inner
              .update(schema.trainingPrograms)
              .set({ status: 'ACTIVE' })
              .where(eq(schema.trainingPrograms.id, empty.id));
          });
        } catch (error) {
          code = pgErrorCode(error);
        }
        expect(code).toBe('23505');
      });
    });
  });

  describe('flexible prescriptions', () => {
    it('stores sets/reps, total reps, duration, custom text and optional weight; rejects meaningless or invalid values', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Rx');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token);
        let p = t.program(
          await t.call('POST', `${T}/clients/${client.id}/programs`, coach.token, { title: 'Rx' }),
        );
        p = t.program(await t.call('POST', `${T}/programs/${p.id}/weeks`, coach.token, {}));
        p = t.program(
          await t.call('POST', `${T}/weeks/${must(p.weeks[0]).id}/days`, coach.token, {
            title: 'Ganzkörper',
          }),
        );
        const main = must(must(p.weeks[0]?.days[0]).sections.find((s) => s.type === 'MAIN'));
        const add = (body: Record<string, unknown>) =>
          t.call('POST', `${T}/sections/${main.id}/assignments`, coach.token, {
            exerciseId: ex.id,
            ...body,
          });

        const valid = [
          { sets: 4, reps: 12, restSeconds: 60 },
          { totalReps: 70, restSeconds: 60 },
          { durationSeconds: 45, restSeconds: 30 },
          { durationSeconds: 300 },
          { prescriptionText: 'AMRAP' },
          { prescriptionText: 'bis technisches Versagen', restSeconds: 150 },
          { sets: 3, reps: 10, targetWeight: 22.5, weightUnit: 'KG', restSeconds: 90 },
          { sets: 3, reps: 15, prescriptionText: 'Bodyweight' },
          { sets: 2, reps: 8, restSeconds: 0 },
        ];
        for (const body of valid) expect((await add(body)).status, JSON.stringify(body)).toBe(201);

        const invalid = [
          {},
          { restSeconds: 60 },
          { sets: 0, reps: 10 },
          { reps: -1 },
          { totalReps: 0 },
          { durationSeconds: 0 },
          { sets: 3, reps: 10, restSeconds: -5 },
          { sets: 3, reps: 10, targetWeight: -1, weightUnit: 'KG' },
          { sets: 3, reps: 10, targetWeight: 20 },
          { sets: 3, reps: 10, weightUnit: 'KG' },
          { sets: 3.5, reps: 10 },
          { prescriptionText: '' },
        ];
        for (const body of invalid)
          expect((await add(body)).status, JSON.stringify(body)).toBe(400);

        const stored = adminProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${p.id}`, coach.token)).body,
        );
        const rows = must(
          stored.weeks[0]?.days[0]?.sections.find((s) => s.type === 'MAIN'),
        ).assignments;
        expect(rows).toHaveLength(valid.length);
        expect(rows[1]).toMatchObject({ totalReps: 70, sets: null, reps: null });
        expect(rows[2]).toMatchObject({ durationSeconds: 45, restSeconds: 30 });
        expect(rows[4]).toMatchObject({ prescriptionText: 'AMRAP', restSeconds: null });
        expect(rows[6]).toMatchObject({ targetWeight: 22.5, weightUnit: 'KG' });
        expect(rows[7]).toMatchObject({ targetWeight: null, weightUnit: null });
        expect(rows.map((r) => r.order)).toEqual(valid.map((_, i) => i));

        // a partial update is re-checked against the merged result
        const target = must(rows[4]);
        expect(
          (
            await t.call('PATCH', `${T}/assignments/${target.id}`, coach.token, {
              prescriptionText: null,
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await t.call('PATCH', `${T}/assignments/${target.id}`, coach.token, {
              prescriptionText: null,
              sets: 5,
              reps: 5,
            })
          ).status,
        ).toBe(200);
      });
    });
  });

  describe('ordering', () => {
    it('reorders and persists weeks, days, sections and assignments; rejects incomplete orders; duplicates stay dense', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Order');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token);
        let p = t.program(
          await t.call('POST', `${T}/clients/${client.id}/programs`, coach.token, {
            title: 'Order',
          }),
        );
        for (let i = 0; i < 3; i++)
          p = t.program(
            await t.call('POST', `${T}/programs/${p.id}/weeks`, coach.token, { title: `W${i}` }),
          );
        const weekIds = p.weeks.map((w) => w.id);
        p = t.program(
          await t.call('POST', `${T}/programs/${p.id}/weeks/reorder`, coach.token, {
            ids: [weekIds[2], weekIds[0], weekIds[1]],
          }),
        );
        expect(p.weeks.map((w) => w.title)).toEqual(['W2', 'W0', 'W1']);
        expect(p.weeks.map((w) => w.order)).toEqual([0, 1, 2]);
        expect(
          (
            await t.call('POST', `${T}/programs/${p.id}/weeks/reorder`, coach.token, {
              ids: [weekIds[0]],
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await t.call('POST', `${T}/programs/${p.id}/weeks/reorder`, coach.token, {
              ids: [weekIds[0], weekIds[0], weekIds[1]],
            })
          ).status,
        ).toBe(400);

        const week = must(p.weeks[0]);
        for (const title of ['Tag 1', 'Tag 2']) {
          p = t.program(await t.call('POST', `${T}/weeks/${week.id}/days`, coach.token, { title }));
        }
        let days = must(p.weeks[0]).days;
        p = t.program(
          await t.call('POST', `${T}/weeks/${week.id}/days/reorder`, coach.token, {
            ids: [must(days[1]).id, must(days[0]).id],
          }),
        );
        days = must(p.weeks[0]).days;
        expect(days.map((d) => d.title)).toEqual(['Tag 2', 'Tag 1']);

        const day = must(days[0]);
        const sectionIds = day.sections.map((s) => s.id).reverse();
        p = t.program(
          await t.call('POST', `${T}/days/${day.id}/sections/reorder`, coach.token, {
            ids: sectionIds,
          }),
        );
        expect(must(must(p.weeks[0]).days[0]).sections.map((s) => s.type)).toEqual([
          'FINISHER',
          'MAIN',
          'WARMUP',
        ]);

        const section = must(must(must(p.weeks[0]).days[0]).sections[1]);
        for (const reps of [1, 2, 3]) {
          p = t.program(
            await t.call('POST', `${T}/sections/${section.id}/assignments`, coach.token, {
              exerciseId: ex.id,
              sets: 1,
              reps,
            }),
          );
        }
        const assignments = must(must(must(p.weeks[0]).days[0]).sections[1]).assignments;
        await t.call('POST', `${T}/sections/${section.id}/assignments/reorder`, coach.token, {
          ids: [must(assignments[2]).id, must(assignments[0]).id, must(assignments[1]).id],
        });
        // reload from the API (fresh read) and from the DB
        const reloaded = adminProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${p.id}`, coach.token)).body,
        );
        expect(
          must(must(must(reloaded.weeks[0]).days[0]).sections[1]).assignments.map((a) => a.reps),
        ).toEqual([3, 1, 2]);
        const dbOrder = await tx
          .select({
            reps: schema.trainingExerciseAssignments.reps,
            order: schema.trainingExerciseAssignments.sortOrder,
          })
          .from(schema.trainingExerciseAssignments)
          .where(eq(schema.trainingExerciseAssignments.sectionId, section.id))
          .orderBy(schema.trainingExerciseAssignments.sortOrder);
        expect(dbOrder).toEqual([
          { reps: 3, order: 0 },
          { reps: 1, order: 1 },
          { reps: 2, order: 2 },
        ]);

        // delete keeps the sequence dense
        p = t.program(
          await t.call('DELETE', `${T}/assignments/${must(assignments[0]).id}`, coach.token),
        );
        expect(
          must(must(must(p.weeks[0]).days[0]).sections[1]).assignments.map((a) => a.order),
        ).toEqual([0, 1]);

        // duplicate day/week: new ids, copied structure, placed right after the original
        const originalIds = must(must(must(p.weeks[0]).days[0]).sections[1]).assignments.map(
          (a) => a.id,
        );
        p = t.program(await t.call('POST', `${T}/days/${day.id}/duplicate`, coach.token));
        const w0 = must(p.weeks[0]);
        expect(w0.days.map((d) => d.title)).toEqual(['Tag 2', 'Tag 2 (Kopie)', 'Tag 1']);
        const copy = must(w0.days[1]);
        expect(copy.id).not.toBe(day.id);
        expect(copy.sections.map((s) => s.type)).toEqual(['FINISHER', 'MAIN', 'WARMUP']);
        // after the delete above the original holds reps [3, 2]; the copy mirrors it with new ids
        expect(must(copy.sections[1]).assignments.map((a) => a.reps)).toEqual([3, 2]);
        for (const assignment of must(copy.sections[1]).assignments) {
          expect(originalIds).not.toContain(assignment.id);
        }
        p = t.program(await t.call('POST', `${T}/weeks/${w0.id}/duplicate`, coach.token));
        expect(p.weeks.map((w) => w.title)).toEqual(['W2', 'W2', 'W0', 'W1']);
        expect(p.weeks.map((w) => w.order)).toEqual([0, 1, 2, 3]);
        expect(must(p.weeks[1]).days).toHaveLength(3);
        expect(p.assignmentCount).toBe(8);
        // deleting a section removes its assignments in one transaction
        p = t.program(
          await t.call('DELETE', `${T}/sections/${must(copy.sections[1]).id}`, coach.token),
        );
        expect(must(p.weeks[0]).days[1]?.sections.map((s) => s.order)).toEqual([0, 1]);
        expect(p.assignmentCount).toBe(6);
      });
    });
  });

  describe('exercise media', () => {
    it('training media: attach → client DTO resolves it → delete blocked while referenced → allowed after removal', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.user('ADMIN');
        const coach = await t.coach('Coach Media');
        const client = await t.client(coach.id);
        const form = new FormData();
        form.append('file', new File([png(320, 240)], 'demo.png', { type: 'image/png' }));
        const upload = await t.app.request('/v1/admin/training/media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${coach.token}` },
          body: form,
        });
        expect(upload.status).toBe(201);
        const asset = (await upload.json()) as { id: string; url: string };
        const [row] = await tx
          .select()
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, asset.id));
        expect(must(row)).toMatchObject({ purpose: 'TRAINING_VIDEO', visibility: 'PUBLIC' });
        expect(must(row).storageKey).toMatch(/^public\/training-video\//);

        // a website asset can not be used for exercises; coaches can't see the website library
        expect((await t.call('GET', '/v1/admin/media', coach.token)).status).toBe(403);
        const ex = await t.exercise(coach.token, `Mit Medium ${randomUUID().slice(0, 4)}`, {
          mediaAssetId: asset.id,
        });
        expect(ex.media).toMatchObject({ assetId: asset.id, kind: 'IMAGE' });
        const p = await t.fullProgram(coach.token, client.id, ex.id);
        await t.call('POST', `${T}/programs/${p.id}/activate`, coach.token);
        const seen = clientActiveTrainingResponseSchema.parse(
          (await t.call('GET', '/v1/client/training/active', client.token)).body,
        );
        const media = must(
          must(seen.program).weeks[0]?.days[0]?.sections.find((s) => s.type === 'MAIN')
            ?.exercises[0],
        ).media;
        expect(media).toMatchObject({
          assetId: asset.id,
          kind: 'IMAGE',
          url: asset.url,
          width: 320,
        });
        // exactly the resolved-media shape: a delivery URL, never storage internals
        expect(Object.keys(must(media)).sort()).toEqual(
          ['altText', 'assetId', 'height', 'kind', 'mimeType', 'url', 'width'].sort(),
        );
        expect(JSON.stringify(seen)).not.toContain('storageKey');
        expect(JSON.stringify(seen)).not.toContain('"public/'); // no raw key string

        // coaches can not delete media at all; ADMIN is refused while referenced, with the usage
        expect(
          (await t.call('DELETE', `/v1/admin/training/media/${asset.id}`, coach.token)).status,
        ).toBe(403);
        const blocked = await t.call('DELETE', `/v1/admin/training/media/${asset.id}`, admin.token);
        expect(blocked.status).toBe(409);
        expect(JSON.stringify(blocked.body)).toContain(`exercise/${ex.id}`);
        const detail = await t.call('GET', `/v1/admin/training/media/${asset.id}`, admin.token);
        expect(detail.body).toMatchObject({
          usageCount: 1,
          exerciseUsages: [{ exerciseId: ex.id }],
        });
        // the website library endpoint does not even see training assets
        expect((await t.call('DELETE', `/v1/admin/media/${asset.id}`, admin.token)).status).toBe(
          404,
        );

        await t.call('PATCH', `${T}/exercises/${ex.id}`, coach.token, { mediaAssetId: null });
        expect(
          (await t.call('DELETE', `/v1/admin/training/media/${asset.id}`, admin.token)).status,
        ).toBe(204);
        const left = await tx
          .select()
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, asset.id));
        expect(left).toHaveLength(0);
      });
    });

    it('rejects website media and unknown assets on exercises', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.user('ADMIN');
        const form = new FormData();
        form.append('file', new File([png(64, 64)], 'web.png', { type: 'image/png' }));
        const web = await t.app.request('/v1/admin/media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${admin.token}` },
          body: form,
        });
        const webAsset = (await web.json()) as { id: string };
        const res = await t.call('POST', `${T}/exercises`, admin.token, {
          name: `X ${randomUUID().slice(0, 4)}`,
          mediaAssetId: webAsset.id,
        });
        expect(res.status).toBe(400);
        const unknown = await t.call('POST', `${T}/exercises`, admin.token, {
          name: `Y ${randomUUID().slice(0, 4)}`,
          mediaAssetId: randomUUID(),
        });
        expect(unknown.status).toBe(400);
      });
    });
  });

  describe('preview + current week', () => {
    it('preview returns the client shape for a draft; currentWeekId follows startsOn', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach('Coach Prev');
        const client = await t.client(coach.id);
        const ex = await t.exercise(coach.token);
        let p = await t.fullProgram(coach.token, client.id, ex.id);
        p = t.program(
          await t.call('POST', `${T}/programs/${p.id}/weeks`, coach.token, { title: 'W2' }),
        );
        const preview = clientTrainingProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${p.id}/preview`, coach.token)).body,
        );
        expect(preview.id).toBe(p.id);
        expect(preview.currentWeekId).toBeNull();
        const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
        p = t.program(
          await t.call('PATCH', `${T}/programs/${p.id}`, coach.token, { startsOn: eightDaysAgo }),
        );
        const withStart = clientTrainingProgramSchema.parse(
          (await t.call('GET', `${T}/programs/${p.id}/preview`, coach.token)).body,
        );
        expect(withStart.currentWeekId).toBe(must(p.weeks[1]).id);
        const bad = await t.call('PATCH', `${T}/programs/${p.id}`, coach.token, {
          endsOn: '2000-01-01',
        });
        expect(bad.status).toBe(400);
        // the client still sees nothing (draft)
        expect((await t.call('GET', '/v1/client/training/active', client.token)).body).toEqual({
          program: null,
        });
        expect(await tx.execute(sql`select 1`)).toBeTruthy();
      });
    });
  });
});
