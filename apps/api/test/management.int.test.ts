import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import {
  adminClientDetailSchema,
  adminClientListSchema,
  authSessionResponseSchema,
  clientSelfProfileSchema,
  createClientResponseSchema,
  createCoachResponseSchema,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { pgErrorCode } from '../src/lib/errors';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { hashToken } from '../src/modules/auth/tokens';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Sprint 5 coach & client management against the real schema. Each test: one rolled-back
 * transaction — no user, profile, assignment, token or event survives.
 */
const PASSWORD = 'ein sicheres Test-Passwort';
const NEW_PASSWORD = 'selbst gewähltes Passwort';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { logger: pino({ level: 'debug' }, stream), text: () => lines.join('\n') };
}

function setup(tx: DbExecutor, logger?: pino.Logger) {
  const app = buildTestApp({
    db: tx,
    bodyLimitBytes: 1_048_576,
    ...(logger ? { logger } : {}),
    auth: createSessionResolver((token) => resolveAccessToken({ db: tx }, token)),
    sessions: { db: tx, limits: testAuthLimits() },
  });
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  };
  const login = async (email: string, password: string, clientType = 'WEB') => {
    const res = await call('POST', '/v1/auth/login', undefined, { email, password, clientType });
    expect(res.status).toBe(200);
    return authSessionResponseSchema.parse(res.body).tokens;
  };
  /** A credentialed user created directly (fixture), signed in. */
  const userWithSession = async (role: UserRole) => {
    const email = `it-mgmt-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const [user] = await tx
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) })
      .returning();
    return { id: must(user).id, email, token: (await login(email, PASSWORD)).accessToken };
  };
  /** Admin creates a coach through the API and the coach activates their account. */
  const activatedCoach = async (adminToken: string, name: string) => {
    const email = `it-coach-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const created = await call('POST', '/v1/admin/coaches', adminToken, {
      displayName: name,
      email,
    });
    expect(created.status).toBe(201);
    const { coach, activation } = createCoachResponseSchema.parse(created.body);
    const done = await call('POST', '/v1/auth/activate', undefined, {
      token: activation.token,
      password: NEW_PASSWORD,
    });
    expect(done.body).toEqual({ destination: 'PANEL' });
    return { id: coach.id, email, token: (await login(email, NEW_PASSWORD)).accessToken };
  };
  const createClientAs = async (token: string, extra: Record<string, unknown> = {}) => {
    const res = await call('POST', '/v1/admin/clients', token, {
      firstName: 'Erika',
      lastName: `Muster-${randomUUID().slice(0, 4)}`,
      email: `it-client-${randomUUID().slice(0, 8)}@vitruv.invalid`,
      ...extra,
    });
    expect(res.status).toBe(201);
    return createClientResponseSchema.parse(res.body);
  };
  return { app, call, login, userWithSession, activatedCoach, createClientAs };
}

describe.skipIf(!databaseUrl)('coach & client management (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  beforeAll(() => {
    handle = openTestDatabase();
  });
  afterAll(async () => handle?.close());

  describe('provisioning + activation', () => {
    it('creates a coach with role COACH, a profile and a hashed one-time activation link', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const email = `it-coach-${randomUUID().slice(0, 8)}@vitruv.invalid`;
        // a forged role in the body is ignored — the server decides the role
        const res = await t.call('POST', '/v1/admin/coaches', admin.token, {
          displayName: 'Coach Test',
          email: email.toUpperCase(),
          role: 'ADMIN',
        });
        expect(res.status).toBe(201);
        const { coach, activation } = createCoachResponseSchema.parse(res.body);
        expect(coach.account).toMatchObject({ status: 'ACTIVE', activation: 'PENDING' });
        const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, coach.id));
        expect(must(user)).toMatchObject({ role: 'COACH', email, passwordHash: null });
        const tokens = await tx
          .select()
          .from(schema.accountActivationTokens)
          .where(eq(schema.accountActivationTokens.userId, coach.id));
        expect(tokens).toHaveLength(1);
        expect(must(tokens[0]).tokenHash).toBe(hashToken(activation.token));
        expect(JSON.stringify(tokens)).not.toContain(activation.token);
        // expiry ≈ 72 h
        const ttl = Date.parse(activation.expiresAt) - must(tokens[0]).createdAt.getTime();
        expect(ttl).toBe(72 * 3_600_000);
        // the link is never part of later responses
        const list = await t.call('GET', '/v1/admin/coaches', admin.token);
        expect(JSON.stringify(list.body)).not.toContain(activation.token);
        const events = await tx
          .select({ type: schema.authEvents.type, actor: schema.authEvents.actorUserId })
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, coach.id));
        expect(events).toEqual(
          expect.arrayContaining([
            { type: 'ACCOUNT_CREATED', actor: admin.id },
            { type: 'ACTIVATION_ISSUED', actor: admin.id },
          ]),
        );
      });
    });

    it('activates once: valid → password set → login works; reuse, expiry and regeneration fail safely', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const { client, activation } = await t.createClientAs(admin.token);

        const check = await t.call('POST', '/v1/auth/activation/check', undefined, {
          token: activation.token,
        });
        expect(check.status).toBe(200);
        // no account data in the check response
        expect(Object.keys(check.body).sort()).toEqual(['expiresAt', 'valid']);

        // regenerate → the first link dies, the second works
        const regen = await t.call(
          'POST',
          `/v1/admin/clients/${client.id}/activation`,
          admin.token,
        );
        expect(regen.status).toBe(201);
        const second = (regen.body.activation as { token: string }).token;
        const old = await t.call('POST', '/v1/auth/activation/check', undefined, {
          token: activation.token,
        });
        expect(old.status).toBe(400);
        expect((old.body.error as { code: string }).code).toBe('ACTIVATION_INVALID');

        const weak = await t.call('POST', '/v1/auth/activate', undefined, {
          token: second,
          password: 'kurz',
        });
        expect(weak.status).toBe(400);

        const done = await t.call('POST', '/v1/auth/activate', undefined, {
          token: second,
          password: NEW_PASSWORD,
          role: 'ADMIN',
        });
        expect(done.body).toEqual({ destination: 'APP' });
        const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, client.id));
        expect(must(user).role).toBe('CLIENT');
        expect(must(user).passwordHash).toMatch(/^\$argon2id\$/);

        // replay of the consumed link
        const replay = await t.call('POST', '/v1/auth/activate', undefined, {
          token: second,
          password: 'ein anderes Passwort 99',
        });
        expect(replay.status).toBe(400);
        expect((replay.body.error as { code: string }).code).toBe('ACTIVATION_INVALID');

        // the client can sign in (mobile) with the chosen password only
        await t.login(client.email, NEW_PASSWORD, 'MOBILE');
        const me = await t.call(
          'GET',
          '/v1/auth/me',
          (await t.login(client.email, NEW_PASSWORD)).accessToken,
        );
        expect((me.body.user as { role: string }).role).toBe('CLIENT');

        // an activated account gets no new link
        const again = await t.call(
          'POST',
          `/v1/admin/clients/${client.id}/activation`,
          admin.token,
        );
        expect(again.status).toBe(409);
        const detail = adminClientDetailSchema.parse(
          (await t.call('GET', `/v1/admin/clients/${client.id}`, admin.token)).body,
        );
        expect(detail.account.activation).toBe('ACTIVATED');
      });
    });

    it('rejects expired and unknown links with the same generic error', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const { client, activation } = await t.createClientAs(admin.token);
        await tx
          .update(schema.accountActivationTokens)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.accountActivationTokens.userId, client.id));
        const expired = await t.call('POST', '/v1/auth/activate', undefined, {
          token: activation.token,
          password: NEW_PASSWORD,
        });
        const unknown = await t.call('POST', '/v1/auth/activate', undefined, {
          token: 'Z'.repeat(43),
          password: NEW_PASSWORD,
        });
        expect(expired.status).toBe(400);
        expect(unknown.status).toBe(400);
        expect(expired.body).toMatchObject({ error: { code: 'ACTIVATION_INVALID' } });
        expect((expired.body.error as { message: string }).message).toBe(
          (unknown.body.error as { message: string }).message,
        );
        const detail = adminClientDetailSchema.parse(
          (await t.call('GET', `/v1/admin/clients/${client.id}`, admin.token)).body,
        );
        expect(detail.account).toMatchObject({ activation: 'EXPIRED', activationExpiresAt: null });
      });
    });

    it('refuses an e-mail that is already in use (normalised), with a field error for the admin', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const res = await t.call('POST', '/v1/admin/clients', admin.token, {
          firstName: 'Doppelt',
          lastName: 'Vergeben',
          email: `  ${admin.email.toUpperCase()} `,
        });
        expect(res.status).toBe(409);
        expect(JSON.stringify(res.body)).toContain('bereits verwendet');
      });
    });
  });

  describe('object-level authorization', () => {
    it('ADMIN sees all; COACH A only own clients; COACH B can not read/edit/manage A’s client by id', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const coachA = await t.activatedCoach(admin.token, 'Coach A');
        const coachB = await t.activatedCoach(admin.token, 'Coach B');

        // coach A creates a client — always assigned to A, even if the body names B
        const own = await t.createClientAs(coachA.token, { coachId: coachB.id });
        expect(own.client.coach?.id).toBe(coachA.id);
        const ofB = await t.createClientAs(admin.token, { coachId: coachB.id });
        const unassigned = await t.createClientAs(admin.token);

        const listA = adminClientListSchema.parse(
          (await t.call('GET', '/v1/admin/clients', coachA.token)).body,
        );
        expect(listA.items.map((c) => c.id)).toEqual([own.client.id]);
        const listAdmin = adminClientListSchema.parse(
          (await t.call('GET', '/v1/admin/clients?pageSize=50', admin.token)).body,
        );
        const adminIds = listAdmin.items.map((c) => c.id);
        for (const id of [own.client.id, ofB.client.id, unassigned.client.id]) {
          expect(adminIds).toContain(id);
        }
        // a coach filter can not widen a coach's scope
        const sneaky = adminClientListSchema.parse(
          (await t.call('GET', `/v1/admin/clients?coach=${coachB.id}`, coachA.token)).body,
        );
        expect(sneaky.items.map((c) => c.id)).toEqual([own.client.id]);

        // direct id guessing by coach A on B's client and the unassigned client → 404 everywhere
        for (const id of [ofB.client.id, unassigned.client.id, coachB.id, admin.id]) {
          const base = `/v1/admin/clients/${id}`;
          expect((await t.call('GET', base, coachA.token)).status).toBe(404);
          expect((await t.call('PATCH', base, coachA.token, { firstName: 'X' })).status).toBe(404);
          expect(
            (await t.call('PUT', `${base}/account`, coachA.token, { status: 'DISABLED' })).status,
          ).toBe(404);
          expect((await t.call('POST', `${base}/activation`, coachA.token)).status).toBe(404);
        }
        const [untouched] = await tx
          .select({ status: schema.users.status })
          .from(schema.users)
          .where(eq(schema.users.id, ofB.client.id));
        expect(must(untouched).status).toBe('ACTIVE');

        // coach A edits their own client
        const edited = await t.call('PATCH', `/v1/admin/clients/${own.client.id}`, coachA.token, {
          phone: '+49 30 1234',
          coachingStatus: 'PAUSED',
        });
        expect(edited.status).toBe(200);
        expect(adminClientDetailSchema.parse(edited.body)).toMatchObject({
          phone: '+49 30 1234',
          coachingStatus: 'PAUSED',
        });

        // coaches can not manage coaches or reassign
        expect((await t.call('GET', '/v1/admin/coaches', coachA.token)).status).toBe(403);
        expect(
          (
            await t.call('POST', '/v1/admin/coaches', coachA.token, {
              displayName: 'X',
              email: 'x@vitruv.invalid',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await t.call('PUT', `/v1/admin/coaches/${coachB.id}/account`, coachA.token, {
              status: 'DISABLED',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await t.call('PUT', `/v1/admin/clients/${own.client.id}/assignment`, coachA.token, {
              coachId: coachB.id,
            })
          ).status,
        ).toBe(403);
        expect((await t.call('GET', '/v1/admin/clients/coach-options', coachA.token)).status).toBe(
          403,
        );
      });
    });

    it('reassignment moves access, keeps history and allows only one active coach', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const coachA = await t.activatedCoach(admin.token, 'Coach A');
        const coachB = await t.activatedCoach(admin.token, 'Coach B');
        const { client } = await t.createClientAs(coachA.token);

        const moved = await t.call(
          'PUT',
          `/v1/admin/clients/${client.id}/assignment`,
          admin.token,
          {
            coachId: coachB.id,
          },
        );
        expect(moved.status).toBe(200);
        const detail = adminClientDetailSchema.parse(moved.body);
        expect(detail.coach?.id).toBe(coachB.id);
        expect(detail.assignments).toHaveLength(2);
        expect(detail.assignments.filter((a) => a.endedAt === null)).toHaveLength(1);

        expect((await t.call('GET', `/v1/admin/clients/${client.id}`, coachA.token)).status).toBe(
          404,
        );
        expect((await t.call('GET', `/v1/admin/clients/${client.id}`, coachB.token)).status).toBe(
          200,
        );

        // the DB refuses a second active assignment
        let code: string | undefined;
        try {
          await tx.transaction(async (inner) => {
            await inner
              .insert(schema.coachClientAssignments)
              .values({ coachUserId: coachA.id, clientUserId: client.id });
          });
        } catch (error) {
          code = pgErrorCode(error);
        }
        expect(code).toBe('23505');

        // a disabled coach can not receive clients
        await t.call('PUT', `/v1/admin/coaches/${coachA.id}/account`, admin.token, {
          status: 'DISABLED',
        });
        const toDisabled = await t.call(
          'PUT',
          `/v1/admin/clients/${client.id}/assignment`,
          admin.token,
          {
            coachId: coachA.id,
          },
        );
        expect(toDisabled.status).toBe(400);
        // unassign
        const none = await t.call('PUT', `/v1/admin/clients/${client.id}/assignment`, admin.token, {
          coachId: null,
        });
        expect(adminClientDetailSchema.parse(none.body).coach).toBeNull();
        const events = await tx
          .select({ type: schema.authEvents.type })
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, client.id));
        expect(events.filter((e) => e.type === 'ASSIGNMENT_CHANGED')).toHaveLength(2);
      });
    });

    it('CLIENT accounts get 403 on every management route; /v1/client/me is safe', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const coach = await t.activatedCoach(admin.token, 'Coach C');
        const { client, activation } = await t.createClientAs(coach.token);
        await t.call('PATCH', `/v1/admin/clients/${client.id}`, coach.token, {
          internalNotes: 'Vertrauliche Coach-Notiz 4711',
        });
        await t.call('POST', '/v1/auth/activate', undefined, {
          token: activation.token,
          password: NEW_PASSWORD,
        });
        const token = (await t.login(client.email, NEW_PASSWORD, 'MOBILE')).accessToken;

        for (const [method, path, body] of [
          ['GET', '/v1/admin/clients'],
          [
            'POST',
            '/v1/admin/clients',
            { firstName: 'a', lastName: 'b', email: 'c@vitruv.invalid' },
          ],
          ['GET', `/v1/admin/clients/${client.id}`],
          ['PATCH', `/v1/admin/clients/${client.id}`, { firstName: 'Hack' }],
          ['GET', '/v1/admin/coaches'],
          ['PUT', `/v1/admin/clients/${client.id}/assignment`, { coachId: null }],
        ] as const) {
          expect((await t.call(method, path, token, body)).status).toBe(403);
        }
        const me = await t.call('GET', '/v1/client/me', token);
        expect(me.status).toBe(200);
        const profile = clientSelfProfileSchema.parse(me.body);
        expect(profile).toMatchObject({ id: client.id, coach: { displayName: 'Coach C' } });
        const raw = JSON.stringify(me.body);
        for (const secret of ['4711', 'internalNotes', 'passwordHash', 'account', 'Vertrauliche']) {
          expect(raw).not.toContain(secret);
        }
        expect((await t.call('GET', '/v1/client/me', admin.token)).status).toBe(404);
        expect((await t.call('GET', '/v1/client/me')).status).toBe(401);
      });
    });
  });

  describe('account status', () => {
    it('disable kills sessions immediately; re-enable restores none; fresh login works', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const { client, activation } = await t.createClientAs(admin.token);
        await t.call('POST', '/v1/auth/activate', undefined, {
          token: activation.token,
          password: NEW_PASSWORD,
        });
        const session = await t.login(client.email, NEW_PASSWORD, 'MOBILE');
        expect((await t.call('GET', '/v1/client/me', session.accessToken)).status).toBe(200);

        const disabled = await t.call(
          'PUT',
          `/v1/admin/clients/${client.id}/account`,
          admin.token,
          {
            status: 'DISABLED',
          },
        );
        expect(adminClientDetailSchema.parse(disabled.body).account.status).toBe('DISABLED');
        expect((await t.call('GET', '/v1/client/me', session.accessToken)).status).toBe(401);
        expect(
          (
            await t.call('POST', '/v1/auth/refresh', undefined, {
              refreshToken: session.refreshToken,
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await t.call('POST', '/v1/auth/login', undefined, {
              email: client.email,
              password: NEW_PASSWORD,
              clientType: 'MOBILE',
            })
          ).status,
        ).toBe(401);
        const [revoked] = await tx
          .select({ reason: schema.authSessions.revokedReason })
          .from(schema.authSessions)
          .where(eq(schema.authSessions.userId, client.id));
        expect(must(revoked).reason).toBe('USER_DISABLED');

        await t.call('PUT', `/v1/admin/clients/${client.id}/account`, admin.token, {
          status: 'ACTIVE',
        });
        expect((await t.call('GET', '/v1/client/me', session.accessToken)).status).toBe(401);
        expect(
          (
            await t.call('POST', '/v1/auth/refresh', undefined, {
              refreshToken: session.refreshToken,
            })
          ).status,
        ).toBe(401);
        const fresh = await t.login(client.email, NEW_PASSWORD, 'MOBILE');
        expect((await t.call('GET', '/v1/client/me', fresh.accessToken)).status).toBe(200);

        const types = (
          await tx
            .select({ type: schema.authEvents.type })
            .from(schema.authEvents)
            .where(eq(schema.authEvents.userId, client.id))
        ).map((e) => e.type);
        expect(types).toEqual(expect.arrayContaining(['ACCOUNT_DISABLED', 'ACCOUNT_ENABLED']));
      });
    });

    it('disabling a pending account revokes its link; status changes are idempotent', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const { client, activation } = await t.createClientAs(admin.token);
        await t.call('PUT', `/v1/admin/clients/${client.id}/account`, admin.token, {
          status: 'DISABLED',
        });
        const res = await t.call('POST', '/v1/auth/activate', undefined, {
          token: activation.token,
          password: NEW_PASSWORD,
        });
        expect(res.status).toBe(400);
        expect(
          (await t.call('POST', `/v1/admin/clients/${client.id}/activation`, admin.token)).status,
        ).toBe(409);
        // re-enable, then a fresh link works
        await t.call('PUT', `/v1/admin/clients/${client.id}/account`, admin.token, {
          status: 'ACTIVE',
        });
        const regen = await t.call(
          'POST',
          `/v1/admin/clients/${client.id}/activation`,
          admin.token,
        );
        expect(regen.status).toBe(201);

        const coach = await t.activatedCoach(admin.token, 'Coach Self');
        const self = await t.call('PUT', `/v1/admin/coaches/${coach.id}/account`, admin.token, {
          status: 'ACTIVE',
        });
        expect(self.status).toBe(200);
      });
    });
  });

  describe('list, search, pagination, privacy', () => {
    it('paginates, searches and filters within scope; notes never in lists or logs', async () => {
      await inRollback(handle, async (tx) => {
        const capture = captureLogger();
        const t = setup(tx, capture.logger);
        const admin = await t.userWithSession('ADMIN');
        const coach = await t.activatedCoach(admin.token, 'Coach Liste');
        const marker = randomUUID().slice(0, 6);
        for (const [first, status] of [
          ['Anna', 'ACTIVE'],
          ['Bernd', 'PAUSED'],
          ['Clara', 'COMPLETED'],
        ] as const) {
          await t.createClientAs(coach.token, {
            firstName: first,
            lastName: `Zz${marker}`,
            coachingStatus: status,
          });
        }
        const page1 = adminClientListSchema.parse(
          (await t.call('GET', `/v1/admin/clients?q=Zz${marker}&pageSize=2`, coach.token)).body,
        );
        expect(page1.total).toBe(3);
        expect(page1.items.map((c) => c.firstName)).toEqual(['Anna', 'Bernd']);
        const page2 = adminClientListSchema.parse(
          (await t.call('GET', `/v1/admin/clients?q=Zz${marker}&pageSize=2&page=2`, coach.token))
            .body,
        );
        expect(page2.items.map((c) => c.firstName)).toEqual(['Clara']);
        const paused = adminClientListSchema.parse(
          (
            await t.call(
              'GET',
              `/v1/admin/clients?q=Zz${marker}&coachingStatus=PAUSED`,
              coach.token,
            )
          ).body,
        );
        expect(paused.items.map((c) => c.firstName)).toEqual(['Bernd']);
        const fullName = adminClientListSchema.parse(
          (
            await t.call(
              'GET',
              `/v1/admin/clients?q=${encodeURIComponent(`Clara Zz${marker}`)}`,
              coach.token,
            )
          ).body,
        );
        expect(fullName.total).toBe(1);
        const pending = adminClientListSchema.parse(
          (await t.call('GET', `/v1/admin/clients?q=Zz${marker}&activation=PENDING`, coach.token))
            .body,
        );
        expect(pending.total).toBe(3);
        // LIKE wildcards are literal
        const wildcard = adminClientListSchema.parse(
          (await t.call('GET', '/v1/admin/clients?q=%25', coach.token)).body,
        );
        expect(wildcard.total).toBe(0);
        expect((await t.call('GET', '/v1/admin/clients?pageSize=500', coach.token)).status).toBe(
          400,
        );

        const target = must(page1.items[0]);
        await t.call('PATCH', `/v1/admin/clients/${target.id}`, coach.token, {
          internalNotes: 'Notiz-Geheimnis 9876',
        });
        const list = await t.call('GET', `/v1/admin/clients?q=Zz${marker}`, coach.token);
        expect(JSON.stringify(list.body)).not.toContain('9876');
        const detail = await t.call('GET', `/v1/admin/clients/${target.id}`, coach.token);
        expect(adminClientDetailSchema.parse(detail.body).internalNotes).toBe(
          'Notiz-Geheimnis 9876',
        );
        expect(capture.text()).not.toContain('9876');
        // nor raw activation tokens / passwords
        expect(capture.text()).not.toContain(NEW_PASSWORD);
      });
    });

    it('enforces 1:1 profiles at the database level', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const admin = await t.userWithSession('ADMIN');
        const { client } = await t.createClientAs(admin.token);
        let code: string | undefined;
        try {
          await tx.transaction(async (inner) => {
            await inner
              .insert(schema.clientProfiles)
              .values({ userId: client.id, firstName: 'a', lastName: 'b' });
          });
        } catch (error) {
          code = pgErrorCode(error);
        }
        expect(code).toBe('23505');
        // users are never hard-deleted while a profile references them
        let restrict: string | undefined;
        try {
          await tx.transaction(async (inner) => {
            await inner.execute(sql`delete from users where id = ${client.id}`);
          });
        } catch (error) {
          restrict = pgErrorCode(error);
        }
        expect(restrict).toBe('23001');
      });
    });
  });
});
