import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activateNutritionDocumentResponseSchema,
  adminNutritionDocumentListSchema,
  adminNutritionDocumentSchema,
  authSessionResponseSchema,
  clientActiveNutritionResponseSchema,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import type { ObjectStorage, SignedUrlOptions } from '../src/infra/storage/object-storage';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Meal-plan PDFs (nutrition V1) against the real schema. Every test: ONE rolled-back
 * transaction; files go to a temporary local storage directory. Fictional content only.
 */
const PASSWORD = 'ein sicheres Test-Passwort';
const N = '/v1/admin/nutrition';
let storageDir: string;

/** A minimal, syntactically valid PDF (fictional content). */
const pdfBytes = (label: string) =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n% ${label}\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
  );

function setup(tx: DbExecutor, storage?: ObjectStorage) {
  const app = buildTestApp({
    db: tx,
    storageDir,
    storage,
    bodyLimitBytes: 1_048_576,
    auth: createSessionResolver((token) => resolveAccessToken({ db: tx }, token)),
    sessions: { db: tx, limits: testAuthLimits() },
  });
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined || body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    return res;
  };
  const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
  const user = async (role: UserRole) => {
    const email = `it-nutrition-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
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
  const upload = (token: string, clientId: string, title: string, bytes = pdfBytes(title)) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), `${title}.pdf`);
    form.append('title', title);
    form.append('effectiveFrom', '2026-11-01');
    return call('POST', `${N}/clients/${clientId}/documents`, token, form);
  };
  return { call, json, user, coach, client, upload };
}

describe.skipIf(!databaseUrl)(
  'nutrition PDFs (integration, rolled back)',
  { timeout: 90_000 },
  () => {
    let handle: DatabaseHandle;
    beforeAll(async () => {
      handle = openTestDatabase();
      storageDir = await mkdtemp(join(tmpdir(), 'vitruv-nutrition-it-'));
    });
    afterAll(async () => {
      await handle?.close();
      await rm(storageDir, { recursive: true, force: true });
    });

    it('upload → draft (client sees nothing) → release → client reads + downloads; new release archives the old one', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coach = await t.coach();
        const client = await t.client(coach.id);

        const res = await t.upload(coach.token, client.id, 'Plan Oktober');
        expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
        const first = adminNutritionDocumentSchema.parse(await res.json());
        expect(first).toMatchObject({
          status: 'DRAFT',
          versionNumber: 1,
          effectiveFrom: '2026-11-01',
        });
        expect(JSON.stringify(first)).not.toMatch(/private\/|storage/i);

        const none = clientActiveNutritionResponseSchema.parse(
          await t.json(await t.call('GET', '/v1/client/nutrition/active', client.token)),
        );
        expect(none.document).toBeNull();

        const act = await t.call('POST', `${N}/documents/${first.id}/activate`, coach.token);
        expect(act.status).toBe(200);
        expect(
          activateNutritionDocumentResponseSchema.parse(await act.json()).archivedDocumentId,
        ).toBeNull();

        const active = clientActiveNutritionResponseSchema.parse(
          await t.json(await t.call('GET', '/v1/client/nutrition/active', client.token)),
        ).document;
        expect(active?.title).toBe('Plan Oktober');
        const file = await t.call('GET', must(active).file.fileApiPath, client.token);
        expect(file.status).toBe(200);
        expect(file.headers.get('content-type')).toBe('application/pdf');
        expect(file.headers.get('content-disposition')).toMatch(/^attachment/);
        expect(file.headers.get('cache-control')).toContain('no-store');
        expect(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()))).toContain(
          'Plan Oktober',
        );

        const second = adminNutritionDocumentSchema.parse(
          await (await t.upload(coach.token, client.id, 'Plan November')).json(),
        );
        expect(second.versionNumber).toBe(2);
        const swap = activateNutritionDocumentResponseSchema.parse(
          await (await t.call('POST', `${N}/documents/${second.id}/activate`, coach.token)).json(),
        );
        expect(swap.archivedDocumentId).toBe(first.id);
        const list = adminNutritionDocumentListSchema.parse(
          await t.json(await t.call('GET', `${N}/clients/${client.id}/documents`, coach.token)),
        );
        expect(list.items.map((d) => [d.versionNumber, d.status]).sort()).toEqual([
          [1, 'ARCHIVED'],
          [2, 'ACTIVE'],
        ]);
        // the archived version is no longer downloadable for the client
        expect(
          (await t.call('GET', `/v1/client/nutrition/${first.id}/file`, client.token)).status,
        ).toBe(404);
      });
    });

    it('rejects non-PDF content; scope: other coach / other client get 404, client has no admin access', async () => {
      await inRollback(handle, async (tx) => {
        const t = setup(tx);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const clientA = await t.client(coachA.id);
        const clientB = await t.client(coachB.id);
        const admin = await t.user('ADMIN');

        const fake = new TextEncoder().encode('<html>'.padEnd(200, 'x'));
        expect((await t.upload(coachA.token, clientA.id, 'Fake', fake)).status).toBe(400);

        const doc = adminNutritionDocumentSchema.parse(
          await (await t.upload(coachA.token, clientA.id, 'Plan A')).json(),
        );
        await t.call('POST', `${N}/documents/${doc.id}/activate`, coachA.token);

        expect((await t.upload(coachB.token, clientA.id, 'Fremd')).status).toBe(404);
        expect((await t.call('GET', `${N}/documents/${doc.id}`, coachB.token)).status).toBe(404);
        expect((await t.call('GET', `${N}/documents/${doc.id}/file`, coachB.token)).status).toBe(
          404,
        );
        expect(
          (await t.call('POST', `${N}/documents/${doc.id}/archive`, coachB.token)).status,
        ).toBe(404);
        expect((await t.call('GET', `${N}/documents/${doc.id}/file`, admin.token)).status).toBe(
          200,
        );

        expect(
          (await t.call('GET', `/v1/client/nutrition/${doc.id}/file`, clientB.token)).status,
        ).toBe(404);
        expect(
          (await t.call('GET', `${N}/clients/${clientA.id}/documents`, clientA.token)).status,
        ).toBe(403);

        const archived = await t.call('POST', `${N}/documents/${doc.id}/archive`, coachA.token);
        expect(archived.status).toBe(200);
        expect(
          clientActiveNutritionResponseSchema.parse(
            await t.json(await t.call('GET', '/v1/client/nutrition/active', clientA.token)),
          ).document,
        ).toBeNull();
      });
    });

    it('S3: authorised downloads redirect to a short-lived signed URL; out of scope stays 404', async () => {
      const signed: { key: string; options: SignedUrlOptions }[] = [];
      // local bytes + an S3-like signer (fictional URL) — exercises the production code path
      const storage: ObjectStorage = {
        ...createLocalStorage(storageDir),
        signedUrl: async (key, visibility, options) => {
          expect(visibility).toBe('PRIVATE');
          signed.push({ key, options });
          return `https://priv-bucket.example-objectstorage.test/${key}?X-Amz-Expires=60`;
        },
      };
      await inRollback(handle, async (tx) => {
        const t = setup(tx, storage);
        const coachA = await t.coach();
        const coachB = await t.coach();
        const client = await t.client(coachA.id);
        const doc = adminNutritionDocumentSchema.parse(
          await (await t.upload(coachA.token, client.id, 'Plan Signed')).json(),
        );
        await t.call('POST', `${N}/documents/${doc.id}/activate`, coachA.token);

        const res = await t.call('GET', `/v1/client/nutrition/${doc.id}/file`, client.token);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toMatch(
          /^https:\/\/priv-bucket\.example-objectstorage\.test\/private\/nutrition\//,
        );
        expect(res.headers.get('cache-control')).toContain('no-store');
        expect(res.headers.get('referrer-policy')).toBe('no-referrer');
        expect(signed[0]?.options).toMatchObject({
          expiresInSeconds: 60,
          contentType: 'application/pdf',
        });
        expect(signed[0]?.options.contentDisposition).toMatch(/^attachment/);

        expect((await t.call('GET', `${N}/documents/${doc.id}/file`, coachB.token)).status).toBe(
          404,
        );
        expect(signed).toHaveLength(1);
      });
    });
  },
);
