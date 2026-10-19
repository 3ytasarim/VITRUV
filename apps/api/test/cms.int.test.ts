import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminSectionDetailSchema,
  adminWebsitePageSchema,
  apiErrorSchema,
  publicWebsitePageSchema,
  publishResponseSchema,
  saveDraftResponseSchema,
  type HeroContent,
  type JourneyCmsContent,
} from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode } from '../src/lib/errors';
import { buildTestApp, principalResolver } from './helpers';
import { png } from './media-fixtures';
import {
  createAsset,
  createFixture,
  databaseUrl,
  inRollback,
  must,
  openTestDatabase,
  type Fixture,
} from './rollback';

/**
 * Website CMS against the real Neon schema. Every test runs in a transaction that is rolled back
 * (see rollback.ts) — no rows are ever committed. Skipped without DATABASE_URL.
 */
const hero = (title: string, extra: Partial<HeroContent> = {}): HeroContent => ({
  eyebrow: 'Personal Coaching',
  title,
  primaryCta: { label: 'Erstgespräch', href: '/kontakt' },
  media: null,
  ...extra,
});

const journey: JourneyCmsContent = {
  eyebrow: 'Dein Weg',
  title: 'Vier Etappen. Ein Ziel.',
  stages: ['ernaehrung', 'mobilitaet', 'balance', 'kraft'].map((id, i) => ({
    id,
    name: `Etappe ${i + 1}`,
    title: `Titel ${i + 1}`,
    description: 'Beschreibung.',
    media: null,
    enabled: true,
  })),
};

describe.skipIf(!databaseUrl)('website CMS (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  let storageDir: string;

  beforeAll(async () => {
    handle = openTestDatabase();
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-cms-int-'));
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  const setup = async (tx: DbExecutor) => {
    const fixture = await createFixture(tx, [
      { key: 'hero', type: 'hero' },
      { key: 'journey', type: 'journey' },
      { key: 'faq', type: 'faq' },
    ]);
    const app = buildTestApp({
      db: tx,
      storageDir,
      auth: principalResolver('ADMIN', fixture.userId),
      bodyLimitBytes: 1_048_576,
    });
    const base = `/v1/admin/website/pages/${fixture.pageSlug}/sections`;
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const saveDraft = (key: string, content: unknown) =>
      json('PUT', `${base}/${key}/draft`, { content });
    const publish = (key: string) => json('POST', `${base}/${key}/publish`);
    const publicPage = () => app.request(`/v1/public/website/pages/${fixture.pageSlug}`);
    return { fixture, app, base, json, saveDraft, publish, publicPage };
  };

  const versionsOf = (tx: DbExecutor, fixture: Fixture, key: string) =>
    tx
      .select()
      .from(schema.websiteSectionVersions)
      .where(eq(schema.websiteSectionVersions.sectionId, must(fixture.sectionIds[key])));

  describe('schema constraints', () => {
    it('allows only one draft and one published version per section', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture } = await setup(tx);
        const sectionId = must(fixture.sectionIds.hero);
        const insert = (values: Partial<typeof schema.websiteSectionVersions.$inferInsert>) =>
          tx
            .insert(schema.websiteSectionVersions)
            .values({ sectionId, status: 'DRAFT', content: { a: 1 }, ...values });

        await insert({});
        const second = await tx
          .transaction(async (sp) => {
            await sp
              .insert(schema.websiteSectionVersions)
              .values({ sectionId, status: 'DRAFT', content: { a: 2 } });
          })
          .catch((error: unknown) => error);
        expect(pgErrorCode(second)).toBe('23505');

        // A draft can not carry publication fields; JSON content must be an object.
        const badDraft = await tx
          .transaction(async (sp) => {
            await sp.insert(schema.websiteSectionVersions).values({
              sectionId: must(fixture.sectionIds.faq),
              status: 'DRAFT',
              content: {},
              publishedAt: new Date(),
            });
          })
          .catch((error: unknown) => error);
        expect(pgErrorCode(badDraft)).toBe('23514');
        const notObject = await tx
          .transaction(async (sp) => {
            await sp.insert(schema.websiteSectionVersions).values({
              sectionId: must(fixture.sectionIds.faq),
              status: 'DRAFT',
              content: [1, 2],
            });
          })
          .catch((error: unknown) => error);
        expect(pgErrorCode(notObject)).toBe('23514');
      });
    });

    it('refuses at database level to delete media referenced by live content', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture, saveDraft } = await setup(tx);
        const asset = await createAsset(tx);
        const res = await saveDraft(
          'hero',
          hero('Mit Bild', { media: { desktop: { assetId: asset.id } } }),
        );
        expect(res.status).toBe(200);
        const direct = await tx
          .transaction(async (sp) => {
            await sp.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, asset.id));
          })
          .catch((error: unknown) => error);
        // ON DELETE RESTRICT → restrict_violation
        expect(pgErrorCode(direct)).toBe('23001');
        expect(fixture.pageSlug).toMatch(/^it-/);
      });
    });
  });

  describe('draft → publish lifecycle', () => {
    it('keeps the published version public until an explicit publish', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture, json, base, saveDraft, publish, publicPage } = await setup(tx);

        expect((await saveDraft('hero', hero('Version Eins'))).status).toBe(200);
        const first = publishResponseSchema.parse(await (await publish('hero')).json());
        expect(first.published.status).toBe('PUBLISHED');

        // Edit repeatedly as a draft — the public page still shows version 1.
        expect((await saveDraft('hero', hero('Entwurf A'))).status).toBe(200);
        expect((await saveDraft('hero', hero('ENTWURF-GEHEIM-B'))).status).toBe(200);
        const before = await publicPage();
        const beforeText = await before.text();
        expect(beforeText).toContain('Version Eins');
        expect(beforeText).not.toContain('ENTWURF-GEHEIM-B');
        expect(beforeText).not.toContain('Entwurf A');

        const detail = adminSectionDetailSchema.parse(
          await (await json('GET', `${base}/hero`)).json(),
        );
        expect(detail.draft?.content.title).toBe('ENTWURF-GEHEIM-B');
        expect(detail.published?.content.title).toBe('Version Eins');
        expect(detail.section).toMatchObject({ hasDraft: true, hasPublished: true });

        // One draft row only, edited in place.
        const live = await versionsOf(tx, fixture, 'hero');
        expect(live.filter((v) => v.status === 'DRAFT')).toHaveLength(1);

        const second = publishResponseSchema.parse(await (await publish('hero')).json());
        expect(second.contentRevision).toBe(first.contentRevision + 1);

        const after = publicWebsitePageSchema.parse(await (await publicPage()).json());
        expect(after.sections.find((s) => s.key === 'hero')?.content).toMatchObject({
          title: 'ENTWURF-GEHEIM-B',
        });
        expect(after.contentRevision).toBe(second.contentRevision);

        // History: old version archived (not overwritten), no draft left.
        const versions = await versionsOf(tx, fixture, 'hero');
        expect(versions.map((v) => v.status).sort()).toEqual(['ARCHIVED', 'PUBLISHED']);
        const archived = must(versions.find((v) => v.status === 'ARCHIVED'));
        expect(archived.archivedAt).toBeInstanceOf(Date);
        expect((archived.content as { title: string }).title).toBe('Version Eins');
        expect(archived.publishedByUserId).toBe(fixture.userId);
      });
    });

    it('reports draft/published state per section in the overview', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture, app, saveDraft, publish } = await setup(tx);
        await saveDraft('hero', hero('Eins'));
        await publish('hero');
        await saveDraft('journey', journey);
        const res = await app.request(`/v1/admin/website/pages/${fixture.pageSlug}`);
        const overview = adminWebsitePageSchema.parse(await res.json());
        const state = Object.fromEntries(
          overview.sections.map((s) => [s.key, [s.hasPublished, s.hasDraft]]),
        );
        expect(state).toEqual({
          hero: [true, false],
          journey: [false, true],
          faq: [false, false],
        });
        expect(res.headers.get('cache-control')).toBe('no-store');
      });
    });

    it('rejects invalid content on save and leaves state unchanged', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture, saveDraft } = await setup(tx);
        const dangerous = hero('X', {
          primaryCta: { label: 'Klick', href: 'javascript:alert(1)' },
        });
        const res = await saveDraft('hero', dangerous);
        expect(res.status).toBe(400);
        const body = apiErrorSchema.parse(await res.json());
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details?.[0]?.path).toBe('content.primaryCta.href');
        expect((await saveDraft('faq', { title: 'FAQ', items: [] })).status).toBe(400);
        expect(await versionsOf(tx, fixture, 'hero')).toHaveLength(0);
      });
    });

    it('does not publish an invalid draft (schema drift / manual DB edits)', async () => {
      await inRollback(handle, async (tx) => {
        const { fixture, saveDraft, publish, publicPage } = await setup(tx);
        await saveDraft('hero', hero('Gültig'));
        await publish('hero');
        // Simulate a draft that no longer satisfies the schema.
        await tx.insert(schema.websiteSectionVersions).values({
          sectionId: must(fixture.sectionIds.hero),
          status: 'DRAFT',
          content: { title: '', primaryCta: { label: 'x', href: 'data:text/html,x' } },
        });
        const res = await publish('hero');
        expect(res.status).toBe(400);
        expect(apiErrorSchema.parse(await res.json()).error.code).toBe('VALIDATION_FAILED');
        const page = publicWebsitePageSchema.parse(await (await publicPage()).json());
        expect(page.sections[0]?.content).toMatchObject({ title: 'Gültig' });
        const statuses = (await versionsOf(tx, fixture, 'hero')).map((v) => v.status).sort();
        expect(statuses).toEqual(['DRAFT', 'PUBLISHED']);
      });
    });

    it('requires a draft to publish and can discard a draft', async () => {
      await inRollback(handle, async (tx) => {
        const { json, base, saveDraft, publish } = await setup(tx);
        expect((await publish('faq')).status).toBe(409);
        await saveDraft('faq', {
          title: 'Fragen',
          items: [{ id: 'q1', question: 'Frage?', answer: 'Antwort.' }],
        });
        expect((await json('DELETE', `${base}/faq/draft`)).status).toBe(204);
        expect((await json('DELETE', `${base}/faq/draft`)).status).toBe(404);
      });
    });
  });

  describe('media references', () => {
    it('stores id-based slot roles and validates referenced assets', async () => {
      await inRollback(handle, async (tx) => {
        const { saveDraft } = await setup(tx);
        const image = await createAsset(tx);
        const video = await createAsset(tx, {
          kind: 'VIDEO',
          mimeType: 'video/mp4',
          storageKey: `public/website/2026/10/${crypto.randomUUID()}.mp4`,
          altText: null,
        });
        const privateFile = await createAsset(tx, {
          kind: 'DOCUMENT',
          purpose: 'NUTRITION',
          visibility: 'PRIVATE',
          mimeType: 'application/pdf',
          storageKey: `private/nutrition/2026/10/${crypto.randomUUID()}.pdf`,
        });

        const withStageMedia = {
          ...journey,
          stages: journey.stages.map((stage) =>
            stage.id === 'kraft'
              ? {
                  ...stage,
                  media: { desktop: { assetId: video.id }, poster: { assetId: image.id } },
                }
              : stage,
          ),
        };
        const ok = await saveDraft('journey', withStageMedia);
        expect(ok.status).toBe(200);
        const draft = saveDraftResponseSchema.parse(await ok.json()).draft;
        const slots = await tx
          .select()
          .from(schema.websiteMediaSlots)
          .where(eq(schema.websiteMediaSlots.versionId, draft.id));
        expect(slots.map((s) => s.role).sort()).toEqual([
          'stages.kraft.media.desktop',
          'stages.kraft.media.poster',
        ]);

        const cases: [unknown, string][] = [
          [{ desktop: { assetId: crypto.randomUUID() } }, 'Medium nicht gefunden.'],
          [{ desktop: { assetId: privateFile.id } }, 'Nur Medien aus der Website-Mediathek'],
          [{ desktop: { assetId: image.id }, poster: { assetId: video.id } }, 'Posterbild'],
          [{ desktop: { assetId: image.id }, mobile: { assetId: video.id } }, 'denselben Typ'],
        ];
        for (const [media, message] of cases) {
          const res = await saveDraft('hero', hero('Medien', { media } as Partial<HeroContent>));
          expect(res.status).toBe(400);
          expect(JSON.stringify(await res.json())).toContain(message);
        }
      });
    });

    it('requires alt text for images on publish unless marked decorative', async () => {
      await inRollback(handle, async (tx) => {
        const { saveDraft, publish, publicPage } = await setup(tx);
        const noAlt = await createAsset(tx, { altText: null });
        const res = await saveDraft(
          'hero',
          hero('Ohne Alt', { media: { desktop: { assetId: noAlt.id } } }),
        );
        expect(res.status).toBe(200);
        const saved = saveDraftResponseSchema.parse(await res.json());
        expect(saved.warnings[0]?.path).toBe('content.media.desktop');
        expect((await publish('hero')).status).toBe(400);

        await saveDraft(
          'hero',
          hero('Dekorativ', { media: { desktop: { assetId: noAlt.id, altText: '' } } }),
        );
        expect((await publish('hero')).status).toBe(200);
        const page = publicWebsitePageSchema.parse(await (await publicPage()).json());
        const media = (
          page.sections[0]?.content as { media: { desktop: { url: string; altText: string } } }
        ).media;
        expect(media.desktop.altText).toBe('');
        expect(media.desktop.url).toBe(`http://localhost:4000/media/${noAlt.storageKey}`);
      });
    });
  });

  describe('public endpoint', () => {
    it('returns published content only, without admin metadata, with an ETag', async () => {
      await inRollback(handle, async (tx) => {
        const { saveDraft, publish, publicPage, fixture, app } = await setup(tx);
        await saveDraft('hero', hero('Öffentlich'));
        await publish('hero');
        await saveDraft('journey', journey); // draft only — must not appear
        const res = await publicPage();
        const text = await res.text();
        const page = publicWebsitePageSchema.parse(JSON.parse(text));
        expect(page.sections.map((s) => s.key)).toEqual(['hero']);
        for (const leaked of ['userId', 'createdBy', 'storageKey', 'DRAFT', 'Vier Etappen']) {
          expect(text).not.toContain(leaked);
        }
        const etag = must(res.headers.get('etag'));
        expect(etag).toBe(`W/"${fixture.pageSlug}-${page.contentRevision}"`);
        const cached = await app.request(`/v1/public/website/pages/${fixture.pageSlug}`, {
          headers: { 'If-None-Match': etag },
        });
        expect(cached.status).toBe(304);
      });
    });

    it('drops hidden Journey stages and disabled sections', async () => {
      await inRollback(handle, async (tx) => {
        const { saveDraft, publish, publicPage, fixture } = await setup(tx);
        const partly = {
          ...journey,
          stages: journey.stages.map((s, i) => ({ ...s, enabled: i !== 1 })),
        };
        await saveDraft('journey', partly);
        await publish('journey');
        await saveDraft('hero', hero('Aus'));
        await publish('hero');
        await tx
          .update(schema.websiteSections)
          .set({ enabled: false })
          .where(
            and(
              eq(schema.websiteSections.id, must(fixture.sectionIds.hero)),
              eq(schema.websiteSections.key, 'hero'),
            ),
          );
        const page = publicWebsitePageSchema.parse(await (await publicPage()).json());
        expect(page.sections.map((s) => s.key)).toEqual(['journey']);
        const stages = (page.sections[0]?.content as JourneyCmsContent).stages.map((s) => s.id);
        expect(stages).toEqual(['ernaehrung', 'balance', 'kraft']);
      });
    });
  });

  describe('media library', () => {
    it('uploads safely: server-generated key, sniffed type, metadata persisted', async () => {
      await inRollback(handle, async (tx) => {
        const { app } = await setup(tx);
        const form = new FormData();
        form.append(
          'file',
          new File([png(640, 360)], '../../etc/passwd.png', { type: 'image/png' }),
        );
        form.append('altText', 'Testmuster');
        const res = await app.request('/v1/admin/media', { method: 'POST', body: form });
        expect(res.status).toBe(201);
        const asset = (await res.json()) as {
          id: string;
          fileName: string;
          url: string;
          width: number;
        };
        expect(asset).toMatchObject({ fileName: 'passwd.png', width: 640 });
        const [row] = await tx
          .select()
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, asset.id));
        expect(row?.storageKey).toMatch(/^public\/website\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
        expect(row?.storageKey).not.toContain('passwd');
        expect(row).toMatchObject({
          purpose: 'WEBSITE',
          visibility: 'PUBLIC',
          altText: 'Testmuster',
        });

        const served = await app.request(new URL(asset.url).pathname);
        expect(served.status).toBe(200);
        expect(served.headers.get('content-type')).toBe('image/png');

        const bad = new FormData();
        bad.append('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
        expect((await app.request('/v1/admin/media', { method: 'POST', body: bad })).status).toBe(
          400,
        );
        const disguised = new FormData();
        disguised.append('file', new File(['MZ executable'], 'x.png', { type: 'image/png' }));
        expect(
          (await app.request('/v1/admin/media', { method: 'POST', body: disguised })).status,
        ).toBe(400);
      });
    });

    it('rejects deleting referenced media with usage details and deletes unused media', async () => {
      await inRollback(handle, async (tx) => {
        const { app, saveDraft, publish, fixture } = await setup(tx);
        const used = await createAsset(tx);
        const unused = await createAsset(tx);
        await saveDraft('hero', hero('Benutzt', { media: { desktop: { assetId: used.id } } }));
        await publish('hero');

        const list = (await (await app.request('/v1/admin/media')).json()) as {
          items: { id: string; usageCount: number }[];
        };
        expect(list.items.find((i) => i.id === used.id)?.usageCount).toBe(1);

        const refused = await app.request(`/v1/admin/media/${used.id}`, { method: 'DELETE' });
        expect(refused.status).toBe(409);
        const body = apiErrorSchema.parse(await refused.json());
        expect(body.error.code).toBe('CONFLICT');
        expect(body.error.details).toEqual([
          { path: `${fixture.pageSlug}/hero/media.desktop`, message: 'Veröffentlicht' },
        ]);

        expect(
          (await app.request(`/v1/admin/media/${unused.id}`, { method: 'DELETE' })).status,
        ).toBe(204);
        expect((await app.request(`/v1/admin/media/${unused.id}`)).status).toBe(404);

        // Replacing the media and publishing releases the old asset (archived history does not pin it).
        await saveDraft('hero', hero('Ohne Bild'));
        await publish('hero');
        expect((await app.request(`/v1/admin/media/${used.id}`, { method: 'DELETE' })).status).toBe(
          204,
        );
      });
    });

    it('updates alt text', async () => {
      await inRollback(handle, async (tx) => {
        const { app } = await setup(tx);
        const asset = await createAsset(tx, { altText: null });
        const res = await app.request(`/v1/admin/media/${asset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ altText: '  Laufband im Studio  ' }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { altText: string }).altText).toBe('Laufband im Studio');
      });
    });
  });
});
