import { publicWebsitePageSchema } from '@vitruv/contracts';
import { schema, type DatabaseHandle } from '@vitruv/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter } from '@vitruv/shared';
import { buildTestApp, principalResolver, testUrls } from './helpers';
import {
  createAsset,
  createFixture,
  databaseUrl,
  inRollback,
  must,
  openTestDatabase,
} from './rollback';

/**
 * Sprint 3 Stage C against the real schema (rolled back): lead persistence + constraints,
 * and the SEO settings document (draft never public, OG image resolved, alt text enforced).
 */
describe.skipIf(!databaseUrl)('leads and SEO settings (integration, rolled back)', () => {
  let handle: DatabaseHandle;
  beforeAll(() => {
    handle = openTestDatabase();
  });
  afterAll(async () => handle?.close());

  it('persists a lead with consent time and never exposes it publicly', async () => {
    await inRollback(handle, async (tx) => {
      const marker = `it-${crypto.randomUUID().slice(0, 8)}@example.invalid`;
      const fixture = await createFixture(tx, [{ key: 'faq', type: 'faq' }]);
      const app = buildTestApp({
        bodyLimitBytes: 1_048_576,
        website: { db: tx, urls: testUrls },
        leads: {
          db: tx,
          perEmail: createRateLimiter({ limit: 3, windowMs: 60_000 }),
          global: createRateLimiter({ limit: 30, windowMs: 60_000 }),
        },
      });
      const res = await app.request('/v1/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Testperson',
          email: marker,
          message: 'Integrationstest',
          consent: true,
          startedAt: Date.now() - 10_000,
        }),
      });
      expect(res.status).toBe(201);
      const [lead] = await tx
        .select()
        .from(schema.websiteLeads)
        .where(eq(schema.websiteLeads.email, marker));
      expect(lead).toMatchObject({ name: 'Testperson', status: 'NEW', phone: null });
      expect(must(lead).consentAt).toBeInstanceOf(Date);

      const page = await (await app.request(`/v1/public/website/pages/${fixture.pageSlug}`)).text();
      expect(page).not.toContain(marker);

      // Database constraints back the API limits.
      const tooLong = await tx
        .transaction(async (sp) => {
          await sp.insert(schema.websiteLeads).values({
            name: 'x',
            email: marker,
            message: 'y'.repeat(2001),
            consentAt: new Date(),
          });
        })
        .catch((error: unknown) => error);
      expect(String((tooLong as { cause?: { code?: string } }).cause?.code ?? '')).toBe('23514');
    });
  });

  it('keeps SEO drafts private and resolves the published OG image', async () => {
    await inRollback(handle, async (tx) => {
      const fixture = await createFixture(tx, [{ key: 'seo', type: 'seo' }]);
      const image = await createAsset(tx, { altText: 'Teilen-Vorschau' });
      const app = buildTestApp({
        bodyLimitBytes: 1_048_576,
        auth: principalResolver('ADMIN', fixture.userId),
        website: { db: tx, urls: testUrls },
      });
      const base = `/v1/admin/website/pages/${fixture.pageSlug}/sections/seo`;
      const send = (method: string, path: string, body?: unknown) =>
        app.request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const seo = {
        title: 'Öffentlicher Titel',
        description: 'Öffentliche Beschreibung.',
        siteName: 'VITRUV',
        ogImage: { desktop: { assetId: image.id } },
        faqStructuredData: true,
      };
      expect((await send('PUT', `${base}/draft`, { content: seo })).status).toBe(200);
      expect((await send('POST', `${base}/publish`)).status).toBe(200);
      await send('PUT', `${base}/draft`, { content: { ...seo, title: 'GEHEIMER ENTWURF' } });

      const page = publicWebsitePageSchema.parse(
        await (await app.request(`/v1/public/website/pages/${fixture.pageSlug}`)).json(),
      );
      const published = page.sections.find((s) => s.type === 'seo');
      expect(published?.type === 'seo' && published.content.title).toBe('Öffentlicher Titel');
      expect(JSON.stringify(page)).not.toContain('GEHEIMER ENTWURF');
      expect(published?.type === 'seo' && published.content.ogImage?.desktop).toMatchObject({
        url: `http://localhost:4000/media/${image.storageKey}`,
        altText: 'Teilen-Vorschau',
      });

      // Video is not an acceptable OG image.
      const video = await createAsset(tx, {
        kind: 'VIDEO',
        mimeType: 'video/mp4',
        storageKey: `public/website/2026/10/${crypto.randomUUID()}.mp4`,
      });
      const rejected = await send('PUT', `${base}/draft`, {
        content: { ...seo, ogImage: { desktop: { assetId: video.id } } },
      });
      expect(rejected.status).toBe(400);
    });
  });
});
