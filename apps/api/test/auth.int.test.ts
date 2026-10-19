import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { authSessionResponseSchema, meResponseSchema } from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import { createRateLimiter, type UserRole, type UserStatus } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { AccountTaskError, bootstrapAdmin, setUserPassword } from '../src/modules/auth/accounts';
import {
  purgeSessions,
  resolveAccessToken,
  type AuthRateLimits,
} from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { hashToken } from '../src/modules/auth/tokens';
import { buildTestApp, testAuthLimits, testUrls } from './helpers';
import { createFixture, databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Sprint 4 authentication against the real schema. Every test runs in ONE rolled-back
 * transaction — no user, session or audit row survives.
 */
const PASSWORD = 'korrekt Pferd Batterie Heftklammer';

async function createUser(
  tx: DbExecutor,
  options: { role?: UserRole; status?: UserStatus; password?: string | null } = {},
) {
  const email = `it-auth-${randomUUID().slice(0, 8)}@vitruv.invalid`;
  const password = options.password === undefined ? PASSWORD : options.password;
  const [user] = await tx
    .insert(schema.users)
    .values({
      email,
      displayName: 'Auth-Test',
      role: options.role ?? 'ADMIN',
      status: options.status ?? 'ACTIVE',
      passwordHash: password ? await hashPassword(password) : null,
    })
    .returning();
  return { ...must(user, 'user'), email };
}

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

function authApp(tx: DbExecutor, options: { limits?: AuthRateLimits; logger?: pino.Logger } = {}) {
  return buildTestApp({
    db: tx,
    bodyLimitBytes: 1_048_576,
    ...(options.logger ? { logger: options.logger } : {}),
    auth: createSessionResolver((token) => resolveAccessToken({ db: tx }, token)),
    sessions: { db: tx, limits: options.limits ?? testAuthLimits() },
    website: { db: tx, urls: testUrls },
  });
}

type App = ReturnType<typeof authApp>;

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function loginAs(app: App, email: string, password = PASSWORD, clientType = 'WEB') {
  return app.request('/v1/auth/login', json({ email, password, clientType }));
}

async function sessionOf(app: App, email: string) {
  const res = await loginAs(app, email);
  expect(res.status).toBe(200);
  return authSessionResponseSchema.parse(await res.json());
}

describe.skipIf(!databaseUrl)('authentication (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  beforeAll(() => {
    handle = openTestDatabase();
  });
  afterAll(async () => handle?.close());

  describe('login', () => {
    it('signs in with valid credentials, persists only token hashes and is not cacheable', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        // e-mail normalisation: surrounding spaces + upper case still match
        const res = await loginAs(app, `  ${user.email.toUpperCase()} `);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const body = authSessionResponseSchema.parse(await res.json());
        expect(body.user).toMatchObject({ id: user.id, role: 'ADMIN', status: 'ACTIVE' });
        expect(body.user.permissions).toContain('website.content.publish');
        const raw = JSON.stringify(body);
        expect(raw).not.toContain('passwordHash');
        expect(raw).not.toContain('argon2');

        const [row] = await tx
          .select()
          .from(schema.authSessions)
          .where(eq(schema.authSessions.userId, user.id));
        const session = must(row, 'session');
        expect(session.accessTokenHash).toBe(hashToken(body.tokens.accessToken));
        expect(session.refreshTokenHash).toBe(hashToken(body.tokens.refreshToken));
        // the raw tokens appear nowhere in the stored row
        expect(JSON.stringify(session)).not.toContain(body.tokens.accessToken);
        expect(JSON.stringify(session)).not.toContain(body.tokens.refreshToken);
        expect(session.clientType).toBe('WEB');
        // WEB policy: 15 min access, 12 h idle refresh, 7 d absolute
        const created = session.createdAt.getTime();
        expect(session.accessExpiresAt.getTime() - created).toBe(15 * 60_000);
        expect(session.refreshExpiresAt.getTime() - created).toBe(12 * 3_600_000);
        expect(session.expiresAt.getTime() - created).toBe(7 * 86_400_000);

        const [stored] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id));
        expect(must(stored).lastLoginAt).toBeInstanceOf(Date);
        const events = await tx
          .select()
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, user.id));
        expect(events.map((e) => e.type)).toEqual(['LOGIN_SUCCEEDED']);
      });
    });

    it('gives the same generic 401 for wrong password, unknown e-mail, disabled and password-less accounts', async () => {
      await inRollback(handle, async (tx) => {
        const active = await createUser(tx);
        const disabled = await createUser(tx, { status: 'DISABLED' });
        const noPassword = await createUser(tx, { password: null });
        const app = authApp(tx);
        const attempts = [
          await loginAs(app, active.email, 'falsches Passwort 123'),
          await loginAs(app, 'niemand-hier@vitruv.invalid'),
          await loginAs(app, disabled.email),
          await loginAs(app, noPassword.email, 'irgendein Passwort 1'),
        ];
        const bodies = await Promise.all(attempts.map((r) => r.json()));
        for (const [index, res] of attempts.entries()) {
          expect(res.status).toBe(401);
          const body = bodies[index] as { error: { code: string; message: string } };
          expect(body.error).toMatchObject({
            code: 'UNAUTHENTICATED',
            message: 'Invalid e-mail address or password.',
          });
        }
        const sessions = await tx
          .select()
          .from(schema.authSessions)
          .where(
            sql`${schema.authSessions.userId} in (${active.id}, ${disabled.id}, ${noPassword.id})`,
          );
        expect(sessions).toHaveLength(0);
        const failures = await tx
          .select()
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, active.id));
        expect(failures.map((e) => e.type)).toEqual(['LOGIN_FAILED']);
      });
    });

    it('signs in with the username instead of the e-mail; failures stay the same generic 401', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const username = `it-${randomUUID().slice(0, 8)}`;
        await tx.update(schema.users).set({ username }).where(eq(schema.users.id, user.id));
        const app = authApp(tx);
        const ok = await loginAs(app, `  ${username.toUpperCase()} `);
        expect(ok.status).toBe(200);
        expect(authSessionResponseSchema.parse(await ok.json()).user.id).toBe(user.id);
        for (const res of [
          await loginAs(app, username, 'falsches Passwort 123'),
          await loginAs(app, 'niemand-hier'),
        ]) {
          expect(res.status).toBe(401);
          expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'UNAUTHENTICATED',
          );
        }
        // malformed login names are rejected before any lookup
        expect((await loginAs(app, 'a/b')).status).toBe(400);
      });
    });

    it('rate-limits repeated failures per IP + e-mail without a permanent lockout', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        let now = 1_000_000;
        const clock = () => now;
        const app = authApp(tx, {
          limits: testAuthLimits({
            loginFailuresPerIpAndEmail: createRateLimiter({
              limit: 3,
              windowMs: 60_000,
              now: clock,
            }),
          }),
        });
        for (let i = 0; i < 3; i++) {
          expect((await loginAs(app, user.email, 'falsches Passwort 123')).status).toBe(401);
        }
        // limit reached: even the correct password is refused for this IP + e-mail
        const limited = await loginAs(app, user.email);
        expect(limited.status).toBe(429);
        expect(((await limited.json()) as { error: { code: string } }).error.code).toBe(
          'RATE_LIMITED',
        );
        // temporary only: after the window the account works again
        now += 60_001;
        expect((await loginAs(app, user.email)).status).toBe(200);
      });
    });

    it('rate-limits login attempts per IP', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx, {
          limits: testAuthLimits({ loginPerIp: createRateLimiter({ limit: 2, windowMs: 60_000 }) }),
        });
        expect((await loginAs(app, user.email)).status).toBe(200);
        expect((await loginAs(app, user.email)).status).toBe(200);
        expect((await loginAs(app, user.email)).status).toBe(429);
      });
    });

    it('never writes the password or tokens to the logs', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const capture = captureLogger();
        const app = authApp(tx, { logger: capture.logger });
        const ok = authSessionResponseSchema.parse(await (await loginAs(app, user.email)).json());
        await loginAs(app, user.email, 'ein falsches Passwort');
        await app.request('/v1/auth/refresh', json({ refreshToken: ok.tokens.refreshToken }));
        const logs = capture.text();
        expect(logs).toContain('login succeeded');
        expect(logs).not.toContain(PASSWORD);
        expect(logs).not.toContain('ein falsches Passwort');
        expect(logs).not.toContain(ok.tokens.accessToken);
        expect(logs).not.toContain(ok.tokens.refreshToken);
        expect(logs).not.toContain(user.email);
      });
    });
  });

  describe('sessions', () => {
    it('accepts a valid access token and rejects expired, revoked and disabled-user sessions', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const me = (token: string) => app.request('/v1/auth/me', { headers: bearer(token) });

        const a = await sessionOf(app, user.email);
        const meRes = await me(a.tokens.accessToken);
        expect(meRes.status).toBe(200);
        expect(meRes.headers.get('cache-control')).toBe('no-store');
        expect(meResponseSchema.parse(await meRes.json()).user.id).toBe(user.id);

        // access token expired
        await tx
          .update(schema.authSessions)
          .set({ accessExpiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.authSessions.accessTokenHash, hashToken(a.tokens.accessToken)));
        expect((await me(a.tokens.accessToken)).status).toBe(401);

        // absolute session expiry also ends refresh
        const b = await sessionOf(app, user.email);
        await tx
          .update(schema.authSessions)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.authSessions.accessTokenHash, hashToken(b.tokens.accessToken)));
        expect((await me(b.tokens.accessToken)).status).toBe(401);
        expect(
          (await app.request('/v1/auth/refresh', json({ refreshToken: b.tokens.refreshToken })))
            .status,
        ).toBe(401);

        // revoked
        const c = await sessionOf(app, user.email);
        await tx
          .update(schema.authSessions)
          .set({ revokedAt: new Date(), revokedReason: 'LOGOUT' })
          .where(eq(schema.authSessions.accessTokenHash, hashToken(c.tokens.accessToken)));
        expect((await me(c.tokens.accessToken)).status).toBe(401);

        // disabling the account ends existing sessions immediately
        const d = await sessionOf(app, user.email);
        await tx
          .update(schema.users)
          .set({ status: 'DISABLED' })
          .where(eq(schema.users.id, user.id));
        expect((await me(d.tokens.accessToken)).status).toBe(401);
        expect(
          (await app.request('/v1/auth/refresh', json({ refreshToken: d.tokens.refreshToken })))
            .status,
        ).toBe(401);

        // malformed / unknown tokens
        expect((await me('x'.repeat(43))).status).toBe(401);
        expect(
          (await app.request('/v1/auth/me', { headers: { Authorization: 'Bearer nope' } })).status,
        ).toBe(401);
      });
    });

    it('rotates on refresh, rejects the old refresh token and revokes the session on later reuse', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const first = await sessionOf(app, user.email);

        const refreshed = await app.request(
          '/v1/auth/refresh',
          json({ refreshToken: first.tokens.refreshToken }),
        );
        expect(refreshed.status).toBe(200);
        const second = authSessionResponseSchema.parse(await refreshed.json());
        expect(second.tokens.refreshToken).not.toBe(first.tokens.refreshToken);
        expect(second.tokens.accessToken).not.toBe(first.tokens.accessToken);
        expect(second.tokens.sessionExpiresAt).toBe(first.tokens.sessionExpiresAt);
        // old access token is gone with the rotation, the new one works
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(first.tokens.accessToken) })).status,
        ).toBe(401);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(second.tokens.accessToken) })).status,
        ).toBe(200);

        // immediate replay of the old refresh token (parallel-request window): rejected, session kept
        expect(
          (await app.request('/v1/auth/refresh', json({ refreshToken: first.tokens.refreshToken })))
            .status,
        ).toBe(401);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(second.tokens.accessToken) })).status,
        ).toBe(200);

        // replay after the grace window = stolen token → whole session revoked
        await tx
          .update(schema.authSessions)
          .set({ rotatedAt: new Date(Date.now() - 60_000) })
          .where(eq(schema.authSessions.userId, user.id));
        expect(
          (await app.request('/v1/auth/refresh', json({ refreshToken: first.tokens.refreshToken })))
            .status,
        ).toBe(401);
        const [session] = await tx
          .select()
          .from(schema.authSessions)
          .where(eq(schema.authSessions.userId, user.id));
        expect(must(session).revokedReason).toBe('REFRESH_REUSE');
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(second.tokens.accessToken) })).status,
        ).toBe(401);
        expect(
          (
            await app.request(
              '/v1/auth/refresh',
              json({ refreshToken: second.tokens.refreshToken }),
            )
          ).status,
        ).toBe(401);
        const events = await tx
          .select({ type: schema.authEvents.type })
          .from(schema.authEvents)
          .where(eq(schema.authEvents.userId, user.id));
        expect(events.map((e) => e.type)).toContain('REFRESH_REUSE_DETECTED');
      });
    });

    it('uses the MOBILE lifetimes for mobile clients', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx, { role: 'CLIENT' });
        const app = authApp(tx);
        const res = await loginAs(app, user.email, PASSWORD, 'MOBILE');
        const body = authSessionResponseSchema.parse(await res.json());
        const session = must(
          (
            await tx
              .select()
              .from(schema.authSessions)
              .where(eq(schema.authSessions.userId, user.id))
          )[0],
        );
        expect(session.clientType).toBe('MOBILE');
        expect(session.refreshExpiresAt.getTime() - session.createdAt.getTime()).toBe(
          30 * 86_400_000,
        );
        expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(90 * 86_400_000);
        expect([...body.user.permissions].sort()).toEqual([
          'nutrition.self.read',
          'self:read',
          'training.self.read',
          'training.self.workout',
        ]);
      });
    });
  });

  describe('logout', () => {
    it('revokes the current session; its tokens are unusable afterwards', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const s = await sessionOf(app, user.email);
        const other = await sessionOf(app, user.email);
        const res = await app.request('/v1/auth/logout', json({}, bearer(s.tokens.accessToken)));
        expect(res.status).toBe(204);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(s.tokens.accessToken) })).status,
        ).toBe(401);
        expect(
          (await app.request('/v1/auth/refresh', json({ refreshToken: s.tokens.refreshToken })))
            .status,
        ).toBe(401);
        // other sessions are untouched by a single logout
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(other.tokens.accessToken) })).status,
        ).toBe(200);
        // idempotent
        expect(
          (await app.request('/v1/auth/logout', json({}, bearer(s.tokens.accessToken)))).status,
        ).toBe(204);
      });
    });

    it('logs out with only the refresh token (access already expired)', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const s = await sessionOf(app, user.email);
        expect(
          (await app.request('/v1/auth/logout', json({ refreshToken: s.tokens.refreshToken })))
            .status,
        ).toBe(204);
        const [row] = await tx
          .select()
          .from(schema.authSessions)
          .where(eq(schema.authSessions.userId, user.id));
        expect(must(row).revokedReason).toBe('LOGOUT');
      });
    });

    it('logs out all sessions of the user', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const bystander = await createUser(tx);
        const app = authApp(tx);
        const sessions = [await sessionOf(app, user.email), await sessionOf(app, user.email)];
        const theirs = await sessionOf(app, bystander.email);
        expect(
          (
            await app.request(
              '/v1/auth/logout-all',
              json({}, bearer(must(sessions[0]).tokens.accessToken)),
            )
          ).status,
        ).toBe(204);
        for (const s of sessions) {
          expect(
            (await app.request('/v1/auth/me', { headers: bearer(s.tokens.accessToken) })).status,
          ).toBe(401);
        }
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(theirs.tokens.accessToken) })).status,
        ).toBe(200);
        expect((await app.request('/v1/auth/logout-all', { method: 'POST' })).status).toBe(401);
      });
    });
  });

  describe('password change', () => {
    it('changes the password, rotates the current session and revokes all others', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const current = await sessionOf(app, user.email);
        const other = await sessionOf(app, user.email);
        const newPassword = 'ein ganz neues Passwort 2026';
        const res = await app.request(
          '/v1/auth/password',
          json({ currentPassword: PASSWORD, newPassword }, bearer(current.tokens.accessToken)),
        );
        expect(res.status).toBe(200);
        const rotated = authSessionResponseSchema.parse(await res.json());
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(rotated.tokens.accessToken) }))
            .status,
        ).toBe(200);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(current.tokens.accessToken) }))
            .status,
        ).toBe(401);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(other.tokens.accessToken) })).status,
        ).toBe(401);
        expect((await loginAs(app, user.email)).status).toBe(401);
        expect((await loginAs(app, user.email, newPassword)).status).toBe(200);
        const [stored] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id));
        expect(must(stored).passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
        expect(must(stored).passwordHash).not.toContain(newPassword);
      });
    });

    it('rejects a wrong current password, a weak new password and unauthenticated calls', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const s = await sessionOf(app, user.email);
        const wrong = await app.request(
          '/v1/auth/password',
          json(
            { currentPassword: 'nicht das Passwort', newPassword: 'ein ganz neues Passwort' },
            bearer(s.tokens.accessToken),
          ),
        );
        expect(wrong.status).toBe(400);
        expect(JSON.stringify(await wrong.json())).toContain('currentPassword');
        const weak = await app.request(
          '/v1/auth/password',
          json({ currentPassword: PASSWORD, newPassword: 'kurz' }, bearer(s.tokens.accessToken)),
        );
        expect(weak.status).toBe(400);
        expect(
          (
            await app.request(
              '/v1/auth/password',
              json({ currentPassword: PASSWORD, newPassword: 'ein ganz neues Passwort' }),
            )
          ).status,
        ).toBe(401);
        // session still valid after the failed attempts
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(s.tokens.accessToken) })).status,
        ).toBe(200);
      });
    });
  });

  describe('authorization with real sessions', () => {
    it('ADMIN may use the CMS; COACH and CLIENT never (403); forged roles are ignored', async () => {
      await inRollback(handle, async (tx) => {
        const fixture = await createFixture(tx, [{ key: 'faq', type: 'faq' }]);
        const app = authApp(tx);
        const tokenFor = async (role: UserRole) =>
          (await sessionOf(app, (await createUser(tx, { role })).email)).tokens.accessToken;
        const admin = await tokenFor('ADMIN');
        const coach = await tokenFor('COACH');
        const client = await tokenFor('CLIENT');
        const page = `/v1/admin/website/pages/${fixture.pageSlug}`;

        const adminRes = await app.request(page, { headers: bearer(admin) });
        expect(adminRes.status).toBe(200);
        expect(adminRes.headers.get('cache-control')).toBe('no-store');
        expect((await app.request(page, { headers: bearer(coach) })).status).toBe(403);
        expect((await app.request(page, { headers: bearer(client) })).status).toBe(403);
        // ADMIN can write and publish through a real session; a COACH can do neither
        const section = `${page}/sections/faq`;
        const faq = {
          content: { title: 'FAQ', items: [{ id: 'q1', question: 'Frage?', answer: 'Antwort.' }] },
        };
        const write = (token: string) =>
          app.request(`${section}/draft`, {
            method: 'PUT',
            headers: { ...bearer(token), 'Content-Type': 'application/json' },
            body: JSON.stringify(faq),
          });
        const publish = (token: string) =>
          app.request(`${section}/publish`, { method: 'POST', headers: bearer(token) });
        expect((await write(coach)).status).toBe(403);
        expect((await write(admin)).status).toBe(200);
        expect((await publish(coach)).status).toBe(403);
        expect((await publish(admin)).status).toBe(200);
        expect((await app.request('/v1/admin/media', { headers: bearer(coach) })).status).toBe(403);
        expect((await app.request(page)).status).toBe(401);

        // media delete: COACH refused before any lookup, ADMIN reaches the lookup (404)
        const media = `/v1/admin/media/${randomUUID()}`;
        expect(
          (await app.request(media, { method: 'DELETE', headers: bearer(coach) })).status,
        ).toBe(403);
        expect(
          (await app.request(media, { method: 'DELETE', headers: bearer(admin) })).status,
        ).toBe(404);

        // a client can not talk its way in: role/user hints in headers, query or body are ignored
        const forged = await app.request(`${page}?role=ADMIN`, {
          headers: {
            ...bearer(client),
            'x-vitruv-role': 'ADMIN',
            'x-user-role': 'ADMIN',
            'x-user-id': fixture.userId,
          },
        });
        expect(forged.status).toBe(403);
        const me = meResponseSchema.parse(
          await (await app.request('/v1/auth/me', { headers: bearer(client) })).json(),
        );
        expect(me.user.role).toBe('CLIENT');
        expect(me.user.permissions).not.toContain('admin.access');
      });
    });
  });

  describe('operator tasks + cleanup', () => {
    it('bootstraps the first admin once and never upgrades an existing row', async () => {
      await inRollback(handle, async (tx) => {
        // In this database other admins may already exist; isolate the "first admin" rule by
        // demoting credentialed admins inside the rolled-back transaction.
        await tx
          .update(schema.users)
          .set({ role: 'COACH' })
          .where(sql`${schema.users.role} = 'ADMIN' and ${schema.users.passwordHash} is not null`);
        const existing = await createUser(tx, { role: 'CLIENT', password: null });
        await expect(
          bootstrapAdmin(tx, { email: existing.email, password: 'ein sicheres Passwort 1' }),
        ).rejects.toThrow('already exists');
        await expect(
          bootstrapAdmin(tx, { email: 'owner-it@vitruv.invalid', password: 'kurz' }),
        ).rejects.toBeInstanceOf(AccountTaskError);

        const { userId } = await bootstrapAdmin(tx, {
          email: '  Owner-IT@Vitruv.Invalid ',
          password: 'ein sicheres Passwort 1',
        });
        const [created] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
        expect(must(created)).toMatchObject({ email: 'owner-it@vitruv.invalid', role: 'ADMIN' });
        expect(must(created).passwordHash).toMatch(/^\$argon2id\$/);
        await expect(
          bootstrapAdmin(tx, {
            email: 'second-it@vitruv.invalid',
            password: 'ein sicheres Passwort 2',
          }),
        ).rejects.toThrow('Bootstrap runs only once');
      });
    });

    it('operator password reset revokes all sessions', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const s = await sessionOf(app, user.email);
        const result = await setUserPassword(tx, {
          email: user.email,
          password: 'zurückgesetztes Passwort',
        });
        expect(result.revokedSessions).toBe(1);
        expect(
          (await app.request('/v1/auth/me', { headers: bearer(s.tokens.accessToken) })).status,
        ).toBe(401);
        expect((await loginAs(app, user.email, 'zurückgesetztes Passwort')).status).toBe(200);
      });
    });

    it('cleanup removes expired and long-revoked sessions only', async () => {
      await inRollback(handle, async (tx) => {
        const user = await createUser(tx);
        const app = authApp(tx);
        const keep = await sessionOf(app, user.email);
        const expired = await sessionOf(app, user.email);
        const oldRevoked = await sessionOf(app, user.email);
        await tx
          .update(schema.authSessions)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.authSessions.accessTokenHash, hashToken(expired.tokens.accessToken)));
        await tx
          .update(schema.authSessions)
          .set({ revokedAt: new Date(Date.now() - 31 * 86_400_000), revokedReason: 'LOGOUT' })
          .where(eq(schema.authSessions.accessTokenHash, hashToken(oldRevoked.tokens.accessToken)));
        expect(await purgeSessions(tx, new Date(), user.id)).toBe(2);
        const left = await tx
          .select({ hash: schema.authSessions.accessTokenHash })
          .from(schema.authSessions)
          .where(eq(schema.authSessions.userId, user.id));
        expect(left.map((r) => r.hash)).toEqual([hashToken(keep.tokens.accessToken)]);
      });
    });
  });
});
