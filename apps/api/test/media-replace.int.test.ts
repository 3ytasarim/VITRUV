import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorSchema, type HeroContent } from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import { WEBSITE_MEDIA_MAX_BYTES, type UserRole } from '@vitruv/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import { buildTestApp, principalResolver, testUrls } from './helpers';
import { jpeg, mp4, png } from './media-fixtures';
import {
  createAsset,
  createFixture,
  databaseUrl,
  inRollback,
  must,
  openTestDatabase,
} from './rollback';

/**
 * Replacing the file of a media asset that is in use (owner request 2026-11-14). Real Neon
 * schema, every test rolled back (rollback.ts) — no rows are committed. Fictional data only.
 */
const hero = (title: string, extra: Partial<HeroContent> = {}): HeroContent => ({
  eyebrow: 'Personal Coaching',
  title,
  primaryCta: { label: 'Erstgespräch', href: '/kontakt' },
  media: null,
  ...extra,
});

const fileForm = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string, altText?: string) => {
  const form = new FormData();
  if (altText !== undefined) form.append('altText', altText);
  form.append('file', new File([bytes], name, { type }));
  return form;
};

describe.skipIf(!databaseUrl)('media replace (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  let storageDir: string;

  beforeAll(async () => {
    handle = openTestDatabase();
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-replace-int-'));
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const setup = async (tx: DbExecutor, role: UserRole = 'ADMIN') => {
    const fixture = await createFixture(tx, [{ key: 'hero', type: 'hero' }]);
    const storage = createLocalStorage(storageDir);
    const onPublicMediaChanged = vi.fn(async () => undefined);
    const app = buildTestApp({
      db: tx,
      storage,
      auth: principalResolver(role, fixture.userId),
      bodyLimitBytes: 1_048_576,
      media: {
        db: tx,
        storage,
        urls: testUrls,
        limits: WEBSITE_MEDIA_MAX_BYTES,
        onPublicMediaChanged,
      },
    });
    const base = `/v1/admin/website/pages/${fixture.pageSlug}/sections`;
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return {
      fixture,
      app,
      storage,
      onPublicMediaChanged,
      saveDraft: (content: unknown) => json('PUT', `${base}/hero/draft`, { content }),
      publish: () => json('POST', `${base}/hero/publish`),
      publicPage: () => app.request(`/v1/public/website/pages/${fixture.pageSlug}`),
    };
  };

  const rowOf = async (tx: DbExecutor, id: string) =>
    must(
      (await tx.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)))[0],
      'asset row',
    );

  it('swaps the file of a published, referenced image and keeps id + references', async () => {
    await inRollback(handle, async (tx) => {
      const { app, storage, saveDraft, publish, publicPage, onPublicMediaChanged } =
        await setup(tx);
      const uploaded = await app.request('/v1/admin/media', {
        method: 'POST',
        body: fileForm(png(640, 360), 'alt.png', 'image/png', 'Hantelbank'),
      });
      expect(uploaded.status).toBe(201);
      const { id } = (await uploaded.json()) as { id: string };
      const before = await rowOf(tx, id);
      expect(await storage.head(before.storageKey, 'PUBLIC')).not.toBeNull();

      expect(
        (await saveDraft(hero('Mit Bild', { media: { desktop: { assetId: id } } }))).status,
      ).toBe(200);
      expect((await publish()).status).toBe(200);
      // Deleting is refused while in use — replacing is the way.
      expect((await app.request(`/v1/admin/media/${id}`, { method: 'DELETE' })).status).toBe(409);

      const res = await app.request(`/v1/admin/media/${id}/replace`, {
        method: 'POST',
        body: fileForm(jpeg(1200, 800), 'neu.jpg', 'image/jpeg'),
      });
      expect(res.status).toBe(200);
      const detail = (await res.json()) as {
        id: string;
        fileName: string;
        mimeType: string;
        width: number;
        altText: string;
        usageCount: number;
      };
      expect(detail).toMatchObject({
        id,
        fileName: 'neu.jpg',
        mimeType: 'image/jpeg',
        width: 1200,
        altText: 'Hantelbank', // kept when no new alt text is sent
        usageCount: 1,
      });

      const after = await rowOf(tx, id);
      expect(after.storageKey).not.toBe(before.storageKey);
      expect(after.storageKey).toMatch(/^public\/website\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
      expect(await storage.head(after.storageKey, 'PUBLIC')).not.toBeNull();
      expect(await storage.head(before.storageKey, 'PUBLIC')).toBeNull();
      expect(onPublicMediaChanged).toHaveBeenCalledTimes(1);

      // The published page resolves the same reference to the new file.
      const text = await (await publicPage()).text();
      expect(text).toContain(after.storageKey);
      expect(text).not.toContain(before.storageKey);
    });
  });

  it('stores a default image section in Medien that placements without their own inherit', async () => {
    await inRollback(handle, async (tx) => {
      const { app, saveDraft, publish, publicPage, onPublicMediaChanged } = await setup(tx);
      const asset = await createAsset(tx);
      const other = await createAsset(tx);
      const patch = (id: string, body: unknown) =>
        app.request(`/v1/admin/media/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

      const saved = await patch(asset.id, { focalPoint: { x: 0.25, y: 0.8 } });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        focalPoint: { x: 0.25, y: 0.8 },
        altText: 'Athlet beim Training', // untouched
      });
      expect(onPublicMediaChanged).toHaveBeenCalledTimes(1);
      expect((await patch(asset.id, { focalPoint: { x: 2, y: 0 } })).status).toBe(400);
      expect((await patch(asset.id, {})).status).toBe(400);

      // hero: inherits the default; second slot: own section wins.
      await saveDraft(
        hero('Ausschnitt', {
          media: {
            desktop: { assetId: asset.id },
            mobile: { assetId: other.id, focalPoint: { x: 0.1, y: 0.2 } },
          },
        }),
      );
      expect((await publish()).status).toBe(200);
      const page = (await (await publicPage()).json()) as {
        sections: { content: { media: Record<string, { focalPoint?: unknown }> } }[];
      };
      const media = must(page.sections[0]).content.media;
      expect(media.desktop?.focalPoint).toEqual({ x: 0.25, y: 0.8 });
      expect(media.mobile?.focalPoint).toEqual({ x: 0.1, y: 0.2 });

      // Centred = no default.
      expect(await (await patch(asset.id, { focalPoint: null })).json()).toMatchObject({
        focalPoint: null,
      });
    });
  });

  it('updates the alt text when one is sent', async () => {
    await inRollback(handle, async (tx) => {
      const { app } = await setup(tx);
      const asset = await createAsset(tx, { altText: 'Alt' });
      const res = await app.request(`/v1/admin/media/${asset.id}/replace`, {
        method: 'POST',
        body: fileForm(png(10, 10), 'b.png', 'image/png', 'Neuer Alttext'),
      });
      expect(res.status).toBe(200);
      expect((await rowOf(tx, asset.id)).altText).toBe('Neuer Alttext');
    });
  });

  it('refuses another kind, invalid files and unknown ids — the old file stays', async () => {
    await inRollback(handle, async (tx) => {
      const { app } = await setup(tx);
      const asset = await createAsset(tx);
      const video = mp4({ width: 640, height: 360, durationMs: 1000, codec: 'avc1' });
      const wrongKind = await app.request(`/v1/admin/media/${asset.id}/replace`, {
        method: 'POST',
        body: fileForm(video, 'clip.mp4', 'video/mp4'),
      });
      expect(wrongKind.status).toBe(400);
      expect(apiErrorSchema.parse(await wrongKind.json()).error.message).toContain(
        'Bild kann nur durch ein Bild',
      );
      const disguised = await app.request(`/v1/admin/media/${asset.id}/replace`, {
        method: 'POST',
        body: fileForm(new TextEncoder().encode('MZ executable'), 'x.png', 'image/png'),
      });
      expect(disguised.status).toBe(400);
      expect((await rowOf(tx, asset.id)).storageKey).toBe(asset.storageKey);

      const unknown = await app.request(
        '/v1/admin/media/00000000-0000-4000-8000-000000000000/replace',
        { method: 'POST', body: fileForm(png(10, 10), 'b.png', 'image/png') },
      );
      expect(unknown.status).toBe(404);
    });
  });

  it('keeps the libraries apart: a website asset is not replaceable via training media', async () => {
    await inRollback(handle, async (tx) => {
      const { app } = await setup(tx);
      const asset = await createAsset(tx);
      const res = await app.request(`/v1/admin/training/media/${asset.id}/replace`, {
        method: 'POST',
        body: fileForm(png(10, 10), 'b.png', 'image/png'),
      });
      expect(res.status).toBe(404);
    });
  });

  it('requires write AND delete permission', async () => {
    await inRollback(handle, async (tx) => {
      // COACH: no website.* at all; training write but not training.media.delete.
      const { app } = await setup(tx, 'COACH');
      const asset = await createAsset(tx);
      for (const path of [
        `/v1/admin/media/${asset.id}/replace`,
        `/v1/admin/training/media/${asset.id}/replace`,
      ]) {
        const res = await app.request(path, {
          method: 'POST',
          body: fileForm(png(10, 10), 'b.png', 'image/png'),
        });
        expect(res.status).toBe(403);
      }
      const client = await setup(tx, 'CLIENT');
      const res = await client.app.request(`/v1/admin/media/${asset.id}/replace`, {
        method: 'POST',
        body: fileForm(png(10, 10), 'b.png', 'image/png'),
      });
      expect(res.status).toBe(403);
      expect((await rowOf(tx, asset.id)).storageKey).toBe(asset.storageKey);
    });
  });
});
