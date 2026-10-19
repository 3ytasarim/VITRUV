import { publicWebsitePageSchema } from '@vitruv/contracts';
import { schema, type DatabaseHandle, type DbExecutor } from '@vitruv/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublishedEvent } from '../src/modules/website/website.service';
import { buildTestApp, principalResolver, testUrls } from './helpers';
import { createFixture, databaseUrl, inRollback, must, openTestDatabase } from './rollback';

/**
 * Sprint 3 Stage B: section visibility/order drive the public page, and the revalidation hook
 * fires only after a committed public change. One rolled-back transaction per test.
 */
const CONTENT = {
  hero: { title: 'Hero', primaryCta: { label: 'Los', href: '#cta' }, media: null },
  faq: { title: 'FAQ', items: [{ id: 'a', question: 'Frage?', answer: 'Antwort.' }] },
  cta: { title: 'Bereit?', action: { label: 'Los', href: '#cta' }, media: null },
} as const;

describe.skipIf(!databaseUrl)(
  'public visibility, order and revalidation hook (rolled back)',
  () => {
    let handle: DatabaseHandle;
    beforeAll(() => {
      handle = openTestDatabase();
    });
    afterAll(async () => handle?.close());

    async function setup(tx: DbExecutor, hook?: (event: PublishedEvent) => void | Promise<void>) {
      const fixture = await createFixture(tx, [
        { key: 'hero', type: 'hero' },
        { key: 'faq', type: 'faq' },
        { key: 'cta', type: 'cta' },
      ]);
      const app = buildTestApp({
        auth: principalResolver('ADMIN', fixture.userId),
        bodyLimitBytes: 1_048_576,
        website: { db: tx, urls: testUrls, onPublished: hook },
      });
      const base = `/v1/admin/website/pages/${fixture.pageSlug}/sections`;
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
      for (const [key, content] of Object.entries(CONTENT)) {
        expect((await send('PUT', `${base}/${key}/draft`, { content })).status).toBe(200);
        expect((await send('POST', `${base}/${key}/publish`)).status).toBe(200);
      }
      return { fixture, send, base, publicPage };
    }

    it('hides a disabled section without a gap and shows it again in sort order', async () => {
      await inRollback(handle, async (tx) => {
        const { send, base, publicPage } = await setup(tx);
        expect((await publicPage()).sections.map((s) => s.key)).toEqual(['hero', 'faq', 'cta']);

        const hidden = await send('PATCH', `${base}/faq`, { enabled: false });
        expect(hidden.status).toBe(200);
        const before = await publicPage();
        expect(before.sections.map((s) => s.key)).toEqual(['hero', 'cta']);

        await send('PATCH', `${base}/faq`, { enabled: true });
        expect((await publicPage()).sections.map((s) => s.key)).toEqual(['hero', 'faq', 'cta']);
        expect((await publicPage()).contentRevision).toBeGreaterThan(before.contentRevision);
      });
    });

    it('follows the database sort order, not a code-defined order', async () => {
      await inRollback(handle, async (tx) => {
        const { send, base, publicPage } = await setup(tx);
        expect((await send('PATCH', `${base}/cta`, { sortOrder: 1 })).status).toBe(200);
        expect((await send('PATCH', `${base}/hero`, { sortOrder: 99 })).status).toBe(200);
        expect((await publicPage()).sections.map((s) => s.key)).toEqual(['cta', 'faq', 'hero']);
        expect((await send('PATCH', `${base}/hero`, {})).status).toBe(400);
      });
    });

    it('runs the revalidation hook only after committed public changes', async () => {
      await inRollback(handle, async (tx) => {
        const events: PublishedEvent[] = [];
        const { fixture, send, base } = await setup(tx, (event) => {
          events.push(event);
        });
        expect(events.map((e) => [e.sectionKey, e.reason])).toEqual([
          ['hero', 'publish'],
          ['faq', 'publish'],
          ['cta', 'publish'],
        ]);
        expect(events.every((e) => e.pageSlug === fixture.pageSlug)).toBe(true);

        // A draft save is not public → no hook. An invalid publish rolls back → no hook.
        await send('PUT', `${base}/faq/draft`, { content: CONTENT.faq });
        await tx
          .update(schema.websiteSectionVersions)
          .set({ content: { title: '' } })
          .where(
            and(
              eq(schema.websiteSectionVersions.sectionId, must(fixture.sectionIds.faq)),
              eq(schema.websiteSectionVersions.status, 'DRAFT'),
            ),
          );
        expect((await send('POST', `${base}/faq/publish`)).status).toBe(400);
        expect(events).toHaveLength(3);

        await send('PATCH', `${base}/cta`, { enabled: false });
        expect(must(events.at(-1)).reason).toBe('settings');
      });
    });

    it('a failing hook never fails the publish', async () => {
      await inRollback(handle, async (tx) => {
        const { send, base, publicPage } = await setup(tx, () => {
          throw new Error('web app unreachable');
        });
        await send('PUT', `${base}/hero/draft`, { content: { ...CONTENT.hero, title: 'Neu' } });
        expect((await send('POST', `${base}/hero/publish`)).status).toBe(200);
        expect((await publicPage()).sections[0]?.content).toMatchObject({ title: 'Neu' });
      });
    });
  },
);
