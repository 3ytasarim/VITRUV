import { randomUUID } from 'node:crypto';
import {
  adminExerciseListSchema,
  adminExerciseSchema,
  authSessionResponseSchema,
  clientPlanSchema,
  exerciseCategoryListSchema,
  exerciseCategorySchema,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Client training plan + exercise catalogue against the real schema. Every test: ONE rolled-back transaction.
 * Fictional people and exercises only.
 */
const PASSWORD = 'ein sicheres Test-Passwort';

function setup(tx: DbExecutor) {
  const app = buildTestApp({
    db: tx,
    auth: createSessionResolver((token) => resolveAccessToken({ db: tx }, token)),
    sessions: { db: tx, limits: testAuthLimits() },
  });
  const call = (method: string, path: string, token: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const user = async (role: UserRole) => {
    const email = `it-plan-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const [row] = await tx
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) })
      .returning();
    const login = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        clientType: role === 'CLIENT' ? 'MOBILE' : 'WEB',
      }),
    });
    return {
      id: must(row).id,
      token: authSessionResponseSchema.parse(await login.json()).tokens.accessToken,
    };
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
  const exercise = async (name: string, active = true) => {
    const [row] = await tx
      .insert(schema.exercises)
      .values({ name: `${name} ${randomUUID().slice(0, 6)}`, active })
      .returning();
    return must(row);
  };
  return { call, user, coach, client, exercise };
}

describe.skipIf(!databaseUrl)(
  'client training plan + exercise catalogue (integration, rolled back)',
  { timeout: 90_000 },
  () => {
    let handle: DatabaseHandle;
    beforeAll(() => {
      handle = openTestDatabase();
    });
    afterAll(async () => {
      await handle?.close();
    });

    it('catalogue: categories, codes and catalogue fields; code and name stay unique', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const tag = randomUUID()
          .slice(0, 6)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, 'X');
        const cat = await t.call('POST', '/v1/admin/training/exercise-categories', coach.token, {
          name: `Warm-up Test ${tag}`,
        });
        expect(cat.status).toBe(201);
        const category = exerciseCategorySchema.parse(await cat.json());
        expect(
          (
            await t.call('POST', '/v1/admin/training/exercise-categories', coach.token, {
              name: `warm-up test ${tag}`,
            })
          ).status,
        ).toBe(409);

        const created = await t.call('POST', '/v1/admin/training/exercises', coach.token, {
          name: `Schulterrotation ${tag}`,
          description: '10 Kreise, beide Arme gleichzeitig.',
          categoryId: category.id,
          code: ` t${tag}-01 `,
          captureType: 'Wdh.',
          standard: '1 Durchgang',
          usage: 'Warm-up OK · Mobility',
        });
        expect(created.status, await created.clone().text()).toBe(201);
        const exercise = adminExerciseSchema.parse(await created.json());
        expect(exercise).toMatchObject({
          code: `T${tag}-01`,
          category: { id: category.id },
          captureType: 'Wdh.',
          standard: '1 Durchgang',
          usage: 'Warm-up OK · Mobility',
        });

        const dupCode = await t.call('POST', '/v1/admin/training/exercises', coach.token, {
          name: `Andere ${tag}`,
          code: `T${tag}-01`,
        });
        expect(dupCode.status).toBe(409);
        expect(await dupCode.text()).toContain('Code ist bereits vergeben');
        expect(
          (
            await t.call('POST', '/v1/admin/training/exercises', coach.token, {
              name: `Falsch ${tag}`,
              code: 'Ü 1',
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await t.call('POST', '/v1/admin/training/exercises', coach.token, {
              name: `Ohne Kategorie ${tag}`,
              categoryId: randomUUID(),
            })
          ).status,
        ).toBe(400);

        // search finds by code; the category counts the exercise
        const list = adminExerciseListSchema.parse(
          await (
            await t.call('GET', `/v1/admin/training/exercises?q=T${tag}-01`, coach.token)
          ).json(),
        );
        expect(list.items.map((e) => e.id)).toEqual([exercise.id]);
        const categories = exerciseCategoryListSchema.parse(
          await (await t.call('GET', '/v1/admin/training/exercise-categories', coach.token)).json(),
        );
        expect(categories.items.find((c) => c.id === category.id)?.exerciseCount).toBe(1);

        // a client has no access to the library
        const client = await t.client(coach.id);
        expect(
          (await t.call('GET', '/v1/admin/training/exercise-categories', client.token)).status,
        ).toBe(403);
      });
    });

    it('plan: period on the plan, exercises with coach notes in order; save replaces everything', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const squat = await t.exercise('Kniebeuge');
        const plank = await t.exercise('Unterarmstütz');
        const path = `/v1/admin/training/clients/${client.id}/plan`;

        const empty = clientPlanSchema.parse(await (await t.call('GET', path, coach.token)).json());
        expect(empty).toEqual({ startsOn: null, endsOn: null, items: [], updatedAt: null });

        const saved = await t.call('PUT', path, coach.token, {
          startsOn: '2026-11-02',
          endsOn: '2026-12-13',
          items: [
            { exerciseId: plank.id, note: '3 × 45 s' },
            { exerciseId: squat.id, note: '  Langsam runter  ' },
            { exerciseId: squat.id, note: '' },
          ],
        });
        expect(saved.status, await saved.clone().text()).toBe(200);
        const plan = clientPlanSchema.parse(await saved.json());
        expect(plan).toMatchObject({ startsOn: '2026-11-02', endsOn: '2026-12-13' });
        expect(plan.items.map((i) => [i.exercise.id, i.note])).toEqual([
          [plank.id, '3 × 45 s'],
          [squat.id, 'Langsam runter'],
          [squat.id, null],
        ]);
        expect(plan.updatedAt).not.toBeNull();

        const own = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', client.token)).json(),
        );
        expect(own).toEqual(plan);

        await t.call('PUT', path, coach.token, {
          startsOn: null,
          endsOn: null,
          items: [{ exerciseId: squat.id }],
        });
        const replaced = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', client.token)).json(),
        );
        expect(replaced).toMatchObject({ startsOn: null, endsOn: null });
        expect(replaced.items.map((i) => i.exercise.id)).toEqual([squat.id]);
      });
    });

    it('delete: unused or plan-only exercises go (and leave the plans); history blocks it', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const demo = await t.exercise('DEMO');
        const used = await t.exercise('Kniebeuge');
        await t.call('PUT', `/v1/admin/training/clients/${client.id}/plan`, coach.token, {
          startsOn: null,
          endsOn: null,
          items: [{ exerciseId: demo.id }, { exerciseId: used.id }],
        });
        const detail = adminExerciseSchema.parse(
          await (
            await t.call('GET', `/v1/admin/training/exercises/${demo.id}`, coach.token)
          ).json(),
        );
        expect(detail.planCount).toBe(1);

        // used in a program → 409, nothing deleted
        const [program] = await tx
          .insert(schema.trainingPrograms)
          .values({ clientUserId: client.id, title: 'Test' })
          .returning();
        const [week] = await tx
          .insert(schema.trainingWeeks)
          .values({ programId: must(program).id, sortOrder: 0 })
          .returning();
        const [day] = await tx
          .insert(schema.trainingDays)
          .values({ weekId: must(week).id, sortOrder: 0, title: 'Tag' })
          .returning();
        const [section] = await tx
          .insert(schema.trainingSections)
          .values({ dayId: must(day).id, type: 'MAIN', sortOrder: 0 })
          .returning();
        await tx.insert(schema.trainingExerciseAssignments).values({
          sectionId: must(section).id,
          exerciseId: used.id,
          sortOrder: 0,
          sets: 3,
        });
        const blocked = await t.call(
          'DELETE',
          `/v1/admin/training/exercises/${used.id}`,
          coach.token,
        );
        expect(blocked.status).toBe(409);
        expect(await blocked.text()).toContain('deaktivieren');

        // plan-only → deleted and removed from the plan
        const gone = await t.call('DELETE', `/v1/admin/training/exercises/${demo.id}`, coach.token);
        expect(gone.status).toBe(200);
        expect(await gone.json()).toEqual({ removedFromPlans: 1 });
        expect(
          (await t.call('GET', `/v1/admin/training/exercises/${demo.id}`, coach.token)).status,
        ).toBe(404);
        const plan = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', client.token)).json(),
        );
        expect(plan.items.map((i) => i.exercise.id)).toEqual([used.id]);
        // a client can not delete library exercises
        expect(
          (await t.call('DELETE', `/v1/admin/training/exercises/${used.id}`, client.token)).status,
        ).toBe(403);
      });
    });

    it('scope: other coach and other client get 404/403; invalid input is rejected', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const client = await t.client(coachA.id);
        const other = await t.client(coachB.id);
        const admin = await t.user('ADMIN');
        const squat = await t.exercise('Kniebeuge');
        const retired = await t.exercise('Alt', false);
        const path = `/v1/admin/training/clients/${client.id}/plan`;
        const body = { startsOn: null, endsOn: null, items: [{ exerciseId: squat.id }] };

        expect((await t.call('GET', path, coachB.token)).status).toBe(404);
        expect((await t.call('PUT', path, coachB.token, body)).status).toBe(404);
        expect((await t.call('PUT', path, admin.token, body)).status).toBe(200);
        // a client never reaches the admin plan (not even their own)
        expect((await t.call('GET', path, client.token)).status).toBe(403);
        // the client endpoint is self-only — the other client's plan stays empty
        const otherPlan = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', other.token)).json(),
        );
        expect(otherPlan.items).toEqual([]);

        const put = async (payload: unknown) =>
          (await t.call('PUT', path, coachA.token, payload)).status;
        // a period that ends before it starts / an invalid date
        expect(await put({ ...body, startsOn: '2026-11-05', endsOn: '2026-11-01' })).toBe(400);
        expect(await put({ ...body, startsOn: '2026-13-40' })).toBe(400);
        // unknown exercise; a deactivated exercise cannot be newly planned
        expect(await put({ ...body, items: [{ exerciseId: randomUUID() }] })).toBe(400);
        expect(await put({ ...body, items: [{ exerciseId: retired.id }] })).toBe(400);
        // a coach's id for a non-client user is a 404, too
        expect(
          (await t.call('GET', `/v1/admin/training/clients/${coachB.id}/plan`, coachA.token))
            .status,
        ).toBe(404);
      });
    });
  },
);
