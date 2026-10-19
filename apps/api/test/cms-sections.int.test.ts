import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicWebsitePageSchema } from '@vitruv/contracts';
import type { DatabaseHandle, DbExecutor } from '@vitruv/db';
import type { WebsiteSectionType } from '@vitruv/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from './helpers';
import { createAsset, createFixture, databaseUrl, inRollback, openTestDatabase } from './rollback';

/**
 * Sprint 3 Stage A: every section type that gained an editor goes through the same lifecycle —
 * absent until published, drafts never leak, publish replaces the public content, media resolve.
 * One rolled-back transaction per test (nothing is committed).
 */
type Sample = (assetId: string, marker: string) => Record<string, unknown>;

const SAMPLES: {
  type: WebsiteSectionType;
  content: Sample;
  mediaPath?: (c: unknown) => unknown;
}[] = [
  {
    type: 'results',
    content: (assetId, marker) => ({
      title: marker,
      items: [{ id: 'a', value: '8 Wochen', label: 'Dauer', media: { desktop: { assetId } } }],
    }),
    mediaPath: (c) => (c as { items: { media: unknown }[] }).items[0]?.media,
  },
  {
    type: 'coaching',
    content: (assetId, marker) => ({
      title: marker,
      features: [{ id: 'analyse', title: 'Analyse', description: 'Ausgangslage klären.' }],
      media: { desktop: { assetId } },
    }),
    mediaPath: (c) => (c as { media: unknown }).media,
  },
  {
    type: 'packages',
    content: (_assetId, marker) => ({
      title: marker,
      packages: [
        {
          id: 'basis',
          name: 'Basis',
          features: ['Erstgespräch'],
          cta: { label: 'Anfragen', href: '/kontakt' },
          highlighted: false,
        },
      ],
    }),
  },
  {
    type: 'about',
    content: (assetId, marker) => ({
      title: marker,
      paragraphs: ['Neutraler Entwicklungstext.'],
      highlights: [],
      media: { desktop: { assetId } },
    }),
    mediaPath: (c) => (c as { media: unknown }).media,
  },
  {
    type: 'cta',
    content: (assetId, marker) => ({
      title: marker,
      action: { label: 'Termin', href: '/#kontakt' },
      media: { desktop: { assetId } },
    }),
    mediaPath: (c) => (c as { media: unknown }).media,
  },
  {
    type: 'footer',
    content: (_assetId, marker) => ({
      tagline: marker,
      navigation: [{ id: 'start', label: 'Start', href: '/' }],
      legal: [{ id: 'impressum', label: 'Impressum', href: '/impressum' }],
      contact: {},
      social: [{ id: 'yt', platform: 'youtube', href: 'https://youtube.com/@demo' }],
    }),
  },
];

describe.skipIf(!databaseUrl)('all editable section types (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  let storageDir: string;
  beforeAll(async () => {
    handle = openTestDatabase();
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-sections-int-'));
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it.each(SAMPLES)(
    '$type: absent → draft hidden → published → new draft hidden',
    async (sample) => {
      await inRollback(handle, async (tx: DbExecutor) => {
        const fixture = await createFixture(tx, [{ key: sample.type, type: sample.type }]);
        const asset = await createAsset(tx);
        const app = buildTestApp({
          db: tx,
          storageDir,
          auth: principalResolver('ADMIN', fixture.userId),
          bodyLimitBytes: 1_048_576,
        });
        const base = `/v1/admin/website/pages/${fixture.pageSlug}/sections/${sample.type}`;
        const send = (method: string, path: string, body?: unknown) =>
          app.request(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
        const publicPage = async () =>
          publicWebsitePageSchema.parse(
            await (await app.request(`/v1/public/website/pages/${fixture.pageSlug}`)).json(),
          );

        // No published version yet: the section is absent, even with a saved draft.
        expect((await publicPage()).sections).toEqual([]);
        const first = sample.content(asset.id, 'Erste Fassung');
        expect((await send('PUT', `${base}/draft`, { content: first })).status).toBe(200);
        expect((await publicPage()).sections).toEqual([]);

        expect((await send('POST', `${base}/publish`)).status).toBe(200);
        const published = (await publicPage()).sections[0];
        expect(published?.type).toBe(sample.type);
        expect(JSON.stringify(published)).toContain('Erste Fassung');
        if (sample.mediaPath) {
          expect(sample.mediaPath(published?.content)).toMatchObject({
            desktop: {
              assetId: asset.id,
              kind: 'IMAGE',
              url: `http://localhost:4000/media/${asset.storageKey}`,
              altText: 'Athlet beim Training',
            },
          });
        }

        // A new draft never leaks; publishing it replaces the public content.
        const second = sample.content(asset.id, 'GEHEIMER-ENTWURF');
        expect((await send('PUT', `${base}/draft`, { content: second })).status).toBe(200);
        expect(JSON.stringify(await publicPage())).not.toContain('GEHEIMER-ENTWURF');
        expect((await send('POST', `${base}/publish`)).status).toBe(200);
        const text = JSON.stringify(await publicPage());
        expect(text).toContain('GEHEIMER-ENTWURF');
        expect(text).not.toContain('Erste Fassung');
      });
    },
  );
});
