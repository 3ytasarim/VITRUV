import { randomUUID } from 'node:crypto';
import { authSessionResponseSchema, clientPlanSchema } from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Dated client plan against the real schema. Every test: ONE rolled-back transaction.
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
  'dated client plan (integration, rolled back)',
  { timeout: 90_000 },
  () => {
    let handle: DatabaseHandle;
    beforeAll(() => {
      handle = openTestDatabase();
    });
    afterAll(async () => {
      await handle?.close();
    });

    it('coach saves exercises with date + note; client reads them sorted; save replaces the list', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);
        const squat = await t.exercise('Kniebeuge');
        const plank = await t.exercise('Unterarmstütz');
        const path = `/v1/admin/training/clients/${client.id}/plan`;

        const empty = clientPlanSchema.parse(await (await t.call('GET', path, coach.token)).json());
        expect(empty).toEqual({ items: [], updatedAt: null });

        const saved = await t.call('PUT', path, coach.token, {
          items: [
            {
              exerciseId: plank.id,
              scheduledOn: '2026-11-03',
              endsOn: '2026-11-09',
              note: '3 × 45 s',
            },
            { exerciseId: squat.id, scheduledOn: '2026-11-02', note: '  Langsam runter  ' },
            // a period ending on its first day is stored as a single day
            { exerciseId: squat.id, scheduledOn: '2026-11-03', endsOn: '2026-11-03', note: '' },
          ],
        });
        expect(saved.status, await saved.clone().text()).toBe(200);
        const plan = clientPlanSchema.parse(await saved.json());
        expect(plan.items.map((i) => [i.scheduledOn, i.endsOn, i.exercise.id, i.note])).toEqual([
          ['2026-11-02', null, squat.id, 'Langsam runter'],
          ['2026-11-03', '2026-11-09', plank.id, '3 × 45 s'],
          ['2026-11-03', null, squat.id, null],
        ]);
        expect(plan.updatedAt).not.toBeNull();

        const own = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', client.token)).json(),
        );
        expect(own.items).toEqual(plan.items);

        await t.call('PUT', path, coach.token, {
          items: [{ exerciseId: plank.id, scheduledOn: '2026-11-10' }],
        });
        const replaced = clientPlanSchema.parse(
          await (await t.call('GET', '/v1/client/training/plan', client.token)).json(),
        );
        expect(replaced.items.map((i) => i.scheduledOn)).toEqual(['2026-11-10']);
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
        const body = { items: [{ exerciseId: squat.id, scheduledOn: '2026-11-02' }] };

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

        expect(
          (
            await t.call('PUT', path, coachA.token, {
              items: [{ exerciseId: squat.id, scheduledOn: '2026-13-40' }],
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await t.call('PUT', path, coachA.token, {
              items: [{ exerciseId: randomUUID(), scheduledOn: '2026-11-02' }],
            })
          ).status,
        ).toBe(400);
        // a period that ends before it starts
        expect(
          (
            await t.call('PUT', path, coachA.token, {
              items: [{ exerciseId: squat.id, scheduledOn: '2026-11-05', endsOn: '2026-11-01' }],
            })
          ).status,
        ).toBe(400);
        // a deactivated exercise cannot be newly planned
        expect(
          (
            await t.call('PUT', path, coachA.token, {
              items: [{ exerciseId: retired.id, scheduledOn: '2026-11-02' }],
            })
          ).status,
        ).toBe(400);
        // a coach's id for a non-client user is a 404, too
        expect(
          (await t.call('GET', `/v1/admin/training/clients/${coachB.id}/plan`, coachA.token))
            .status,
        ).toBe(404);
      });
    });
  },
);
