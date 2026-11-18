import { randomUUID } from 'node:crypto';
import {
  adminWelcomeSchema,
  authSessionResponseSchema,
  clientWelcomeSchema,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import type { UserRole } from '@vitruv/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionResolver } from '../src/auth/authenticate';
import { resolveAccessToken } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, testAuthLimits } from './helpers';
import { databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * "Willkommen" categories + videos against the real schema. Every test: ONE rolled-back
 * transaction. Fictional people and titles only.
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
    const email = `it-welcome-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@vitruv.invalid`;
    const [row] = await tx
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) })
      .returning();
    if (role === 'COACH') {
      await tx.insert(schema.coachProfiles).values({ userId: must(row).id, displayName: 'Coach' });
    }
    if (role === 'CLIENT') {
      await tx
        .insert(schema.clientProfiles)
        .values({ userId: must(row).id, firstName: 'Test', lastName: 'Kunde' });
    }
    const login = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        clientType: role === 'CLIENT' ? 'MOBILE' : 'WEB',
      }),
    });
    return authSessionResponseSchema.parse(await login.json()).tokens.accessToken;
  };
  const media = async (kind: 'VIDEO' | 'IMAGE', purpose: 'TRAINING_VIDEO' | 'WEBSITE') => {
    const id = randomUUID();
    const [row] = await tx
      .insert(schema.mediaAssets)
      .values({
        id,
        kind,
        purpose,
        visibility: 'PUBLIC',
        storageKey: `public/it-welcome/${id}.${kind === 'VIDEO' ? 'mp4' : 'png'}`,
        fileName: kind === 'VIDEO' ? 'testvideo.mp4' : 'testbild.png',
        mimeType: kind === 'VIDEO' ? 'video/mp4' : 'image/png',
        sizeBytes: 1024,
        durationMs: kind === 'VIDEO' ? 12_000 : null,
      })
      .returning();
    return must(row).id;
  };
  return { call, user, media };
}

describe.skipIf(!databaseUrl)('Willkommen (integration, rolled back)', { timeout: 90_000 }, () => {
  let handle: DatabaseHandle;
  beforeAll(() => {
    handle = openTestDatabase();
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('admin builds categories + videos; clients see only filled categories', async () => {
    await inRollback(handle, async (tx) => {
      const t = setup(tx);
      const admin = await t.user('ADMIN');
      const coach = await t.user('COACH');
      const client = await t.user('CLIENT');
      const tag = randomUUID().slice(0, 6);

      // COACH and CLIENT can't manage
      expect((await t.call('GET', '/v1/admin/welcome', coach)).status).toBe(403);
      expect((await t.call('GET', '/v1/admin/welcome', client)).status).toBe(403);

      const first = await t.call('POST', '/v1/admin/welcome/categories', admin, {
        name: `Start ${tag}`,
      });
      expect(first.status, await first.clone().text()).toBe(201);
      await t.call('POST', '/v1/admin/welcome/categories', admin, { name: `Ernährung ${tag}` });
      const dup = await t.call('POST', '/v1/admin/welcome/categories', admin, {
        name: `start ${tag}`,
      });
      expect(dup.status).toBe(409);

      let overview = adminWelcomeSchema.parse(
        await (await t.call('GET', '/v1/admin/welcome', admin)).json(),
      );
      const start = must(overview.categories.find((c) => c.name === `Start ${tag}`));
      const food = must(overview.categories.find((c) => c.name === `Ernährung ${tag}`));

      // only training-library videos
      const image = await t.media('IMAGE', 'TRAINING_VIDEO');
      const website = await t.media('VIDEO', 'WEBSITE');
      for (const mediaAssetId of [image, website]) {
        const bad = await t.call('POST', '/v1/admin/welcome/videos', admin, {
          categoryId: start.id,
          mediaAssetId,
          title: 'Falsch',
        });
        expect(bad.status).toBe(400);
      }

      const videoA = await t.media('VIDEO', 'TRAINING_VIDEO');
      const videoB = await t.media('VIDEO', 'TRAINING_VIDEO');
      await t.call('POST', '/v1/admin/welcome/videos', admin, {
        categoryId: start.id,
        mediaAssetId: videoA,
        title: 'Hallo und willkommen',
        description: 'So funktioniert dein Bereich.',
      });
      const created = await t.call('POST', '/v1/admin/welcome/videos', admin, {
        categoryId: start.id,
        mediaAssetId: videoB,
        title: 'Dein erstes Training',
      });
      expect(created.status).toBe(201);
      overview = adminWelcomeSchema.parse(await created.json());
      let videos = must(overview.categories.find((c) => c.id === start.id)).videos;
      expect(videos.map((v) => v.title)).toEqual(['Hallo und willkommen', 'Dein erstes Training']);
      expect(videos[0]?.video).toMatchObject({ mimeType: 'video/mp4', fileName: 'testvideo.mp4' });

      // reorder; incomplete list rejected
      const ids = videos.map((v) => v.id).reverse();
      const partial = await t.call(
        'PUT',
        `/v1/admin/welcome/categories/${start.id}/videos/order`,
        admin,
        { ids: [ids[0]] },
      );
      expect(partial.status).toBe(400);
      overview = adminWelcomeSchema.parse(
        await (
          await t.call('PUT', `/v1/admin/welcome/categories/${start.id}/videos/order`, admin, {
            ids,
          })
        ).json(),
      );
      videos = must(overview.categories.find((c) => c.id === start.id)).videos;
      expect(videos.map((v) => v.title)).toEqual(['Dein erstes Training', 'Hallo und willkommen']);

      // client: only the filled category, no file names
      const clientView = await t.call('GET', '/v1/client/welcome', client);
      expect(clientView.status).toBe(200);
      const body: unknown = await clientView.json();
      const parsed = clientWelcomeSchema.parse(body);
      const mine = parsed.categories.filter((c) => c.name.endsWith(tag));
      expect(mine.map((c) => c.name)).toEqual([`Start ${tag}`]);
      expect(JSON.stringify(body)).not.toContain('testvideo.mp4');

      // media in use can't be deleted
      const mediaDelete = await t.call('DELETE', `/v1/admin/training/media/${videoA}`, admin);
      expect(mediaDelete.status).toBe(409);
      expect(await mediaDelete.text()).toContain('Willkommen-Video');

      // move a video, rename, remove
      const moving = must(videos[0]);
      overview = adminWelcomeSchema.parse(
        await (
          await t.call('PATCH', `/v1/admin/welcome/videos/${moving.id}`, admin, {
            categoryId: food.id,
            title: 'Erstes Training',
          })
        ).json(),
      );
      expect(must(overview.categories.find((c) => c.id === food.id)).videos[0]?.title).toBe(
        'Erstes Training',
      );
      const renamed = await t.call('PATCH', `/v1/admin/welcome/categories/${food.id}`, admin, {
        name: `Los geht's ${tag}`,
      });
      expect(renamed.status).toBe(200);
      const remaining = must(overview.categories.find((c) => c.id === start.id)).videos[0];
      expect(
        (await t.call('DELETE', `/v1/admin/welcome/videos/${must(remaining).id}`, admin)).status,
      ).toBe(200);

      // deleting a category with videos removes its entries, the media files stay
      const gone = adminWelcomeSchema.parse(
        await (await t.call('DELETE', `/v1/admin/welcome/categories/${food.id}`, admin)).json(),
      );
      expect(gone.categories.some((c) => c.id === food.id)).toBe(false);
      const [still] = await tx
        .select({ id: schema.mediaAssets.id })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, videoB));
      expect(still?.id).toBe(videoB);
      expect(
        (await t.call('DELETE', `/v1/admin/welcome/categories/${start.id}`, admin)).status,
      ).toBe(200);
    });
  });
});
