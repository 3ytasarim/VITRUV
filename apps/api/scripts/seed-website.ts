/**
 * Idempotent development seed for the website CMS.
 *
 *   pnpm --filter @vitruv/api seed:website
 *
 * - ensures the `home` page and its nine sections exist (stable keys + order)
 * - gives every section WITHOUT any version an initial published version (neutral copy, no media)
 *   through the same validated service code the admin uses
 * - with DEV_AUTH_EMAIL set (and not in production): ensures that fictional development user
 *   exists with role ADMIN, so the development auth adapter can resolve it
 *
 * Never overwrites existing content, never deletes anything. Prints no connection details.
 */
import { createDatabase, schema } from '@vitruv/db';
import { blankToUndefined, normalizeEmail } from '@vitruv/shared';
import { and, eq, sql } from 'drizzle-orm';
import { createLogger } from '../src/lib/logger';
import { createMediaUrlResolver } from '../src/modules/media/media-url';
import { HOME_PAGE, HOME_SECTIONS, HOME_SEED_CONTENT } from '../src/modules/website/seed-content';
import { publishSection, saveDraft } from '../src/modules/website/website.service';

async function main(): Promise<void> {
  const env = blankToUndefined(process.env);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const handle = createDatabase(env.DATABASE_URL, { maxConnections: 2 });
  const { db } = handle;
  const out = (line: string) => console.warn(line);

  try {
    let userId: string | null = null;
    if (env.DEV_AUTH_EMAIL && env.NODE_ENV !== 'production') {
      await db
        .insert(schema.users)
        .values({
          email: normalizeEmail(env.DEV_AUTH_EMAIL),
          displayName: 'Entwicklung (lokal)',
          role: 'ADMIN',
        })
        .onConflictDoNothing();
      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(sql`lower(${schema.users.email})`, env.DEV_AUTH_EMAIL.toLowerCase()));
      userId = user?.id ?? null;
      out('development user: ensured (role ADMIN)');
    }

    await db.insert(schema.websitePages).values(HOME_PAGE).onConflictDoNothing();
    const [page] = await db
      .select()
      .from(schema.websitePages)
      .where(eq(schema.websitePages.slug, HOME_PAGE.slug));
    if (!page) throw new Error('home page missing after insert');

    await db
      .insert(schema.websiteSections)
      .values(
        HOME_SECTIONS.map((section, index) => ({
          pageId: page.id,
          key: section.key,
          type: section.type,
          sortOrder: section.sortOrder ?? (index + 1) * 10,
        })),
      )
      .onConflictDoNothing();

    const deps = {
      db,
      urls: createMediaUrlResolver('http://localhost/media'),
      logger: createLogger({ level: 'silent' }),
    };
    for (const section of HOME_SECTIONS) {
      const [row] = await db
        .select({ id: schema.websiteSections.id })
        .from(schema.websiteSections)
        .where(
          and(
            eq(schema.websiteSections.pageId, page.id),
            eq(schema.websiteSections.key, section.key),
          ),
        );
      if (!row) throw new Error(`section ${section.key} missing after insert`);
      const [existing] = await db
        .select({ id: schema.websiteSectionVersions.id })
        .from(schema.websiteSectionVersions)
        .where(eq(schema.websiteSectionVersions.sectionId, row.id))
        .limit(1);
      if (existing) {
        out(`section ${section.key}: has content — left unchanged`);
        continue;
      }
      await saveDraft(deps, {
        slug: page.slug,
        key: section.key,
        content: HOME_SEED_CONTENT[section.type],
        userId,
      });
      await publishSection(deps, { slug: page.slug, key: section.key, userId });
      out(`section ${section.key}: initial version published`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const e = error as { name?: string; code?: string; message?: string };
  console.error(`[seed:website] FAILED: ${e.name ?? 'Error'}${e.code ? ` (${e.code})` : ''}`);
  if (e.name === 'AppError') console.error(e.message);
  process.exit(1);
});
