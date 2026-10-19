import {
  collectMediaRefs,
  mapMediaSlots,
  parseSectionContent,
  publicWebsiteSectionSchema,
  SECTION_MEDIA_KINDS,
  type AdminSectionDetail,
  type AdminWebsitePage,
  type MediaRef,
  type MediaRefOccurrence,
  type MediaSlot,
  type PublicWebsitePage,
  type PublicWebsiteSection,
  type PublishResponse,
  type ResolvedMedia,
  type SaveDraftResponse,
  type SectionPreview,
  type WebsiteSectionSummary,
  type WebsiteSectionVersion,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import type { WebsiteSectionType } from '@vitruv/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AppError, PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { MediaUrlResolver } from '../media/media-url';

const { websitePages, websiteSections, websiteSectionVersions, websiteMediaSlots, mediaAssets } =
  schema;

type PageRow = typeof websitePages.$inferSelect;
type SectionRow = typeof websiteSections.$inferSelect;
type VersionRow = typeof websiteSectionVersions.$inferSelect;
type AssetRow = typeof mediaAssets.$inferSelect;
type Detail = { path: string; message: string };

/** Content schema version written by this code. Bump when a section schema changes shape. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface PublishedEvent {
  pageSlug: string;
  sectionKey: string;
  contentRevision: number;
  publishedAt: Date;
  /** What changed the public page: a content publish or a section setting (enabled / order). */
  reason: 'publish' | 'settings';
}

/**
 * Called after a change to PUBLIC content has committed (publish, section visibility/order).
 * Wired to the web app's on-demand revalidation (see revalidation.ts). Failures are logged,
 * never rolled back — the content is already live and the cache's time-based expiry catches up.
 */
export type PublishHook = (event: PublishedEvent) => Promise<void> | void;

export interface WebsiteServiceDeps {
  db: DbExecutor;
  urls: MediaUrlResolver;
  logger: Logger;
  onPublished?: PublishHook;
}

// ---------------------------------------------------------------------------------------------
// Lookups and mapping

async function findPage(db: DbExecutor, slug: string): Promise<PageRow> {
  const [page] = await db.select().from(websitePages).where(eq(websitePages.slug, slug));
  if (!page) throw AppError.notFound('Seite nicht gefunden.');
  return page;
}

async function findSection(
  db: DbExecutor,
  pageId: string,
  key: string,
  options: { lock?: boolean } = {},
): Promise<SectionRow> {
  const query = db
    .select()
    .from(websiteSections)
    .where(and(eq(websiteSections.pageId, pageId), eq(websiteSections.key, key)));
  // Row lock serializes concurrent saves/publishes of the same section.
  const [section] = options.lock ? await query.for('update') : await query;
  if (!section) throw AppError.notFound('Bereich nicht gefunden.');
  return section;
}

interface LiveVersions {
  draft?: VersionRow;
  published?: VersionRow;
}

async function liveVersions(
  db: DbExecutor,
  sectionIds: string[],
): Promise<Map<string, LiveVersions>> {
  const result = new Map<string, LiveVersions>();
  if (sectionIds.length === 0) return result;
  const rows = await db
    .select()
    .from(websiteSectionVersions)
    .where(
      and(
        inArray(websiteSectionVersions.sectionId, sectionIds),
        inArray(websiteSectionVersions.status, ['DRAFT', 'PUBLISHED']),
      ),
    );
  for (const row of rows) {
    const entry = result.get(row.sectionId) ?? {};
    if (row.status === 'DRAFT') entry.draft = row;
    else entry.published = row;
    result.set(row.sectionId, entry);
  }
  return result;
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

function toSummary(section: SectionRow, live: LiveVersions = {}): WebsiteSectionSummary {
  return {
    id: section.id,
    key: section.key,
    type: section.type,
    sortOrder: section.sortOrder,
    enabled: section.enabled,
    hasDraft: Boolean(live.draft),
    hasPublished: Boolean(live.published),
    draftUpdatedAt: iso(live.draft?.updatedAt),
    publishedAt: iso(live.published?.publishedAt),
  };
}

function toVersionDto(version: VersionRow): WebsiteSectionVersion {
  return {
    id: version.id,
    status: version.status,
    content: version.content as Record<string, unknown>,
    schemaVersion: version.schemaVersion,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
    publishedAt: iso(version.publishedAt),
  };
}

/** Zod issues → API validation details, prefixed with `content.` so the editor can map them. */
function issuesToDetails(issues: z.core.$ZodIssue[]): Detail[] {
  return issues.map((issue) => ({
    path: ['content', ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

function parseOrThrow(type: WebsiteSectionType, content: unknown) {
  const parsed = parseSectionContent(type, content);
  if (!parsed.success) {
    throw AppError.validation(issuesToDetails(parsed.error.issues), 'Inhalt ist ungültig.');
  }
  return parsed.data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Media reference checks

const KIND_LABEL = { IMAGE: 'Bilder', VIDEO: 'Videos' } as const;

async function loadAssets(db: DbExecutor, ids: string[]): Promise<Map<string, AssetRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(mediaAssets).where(inArray(mediaAssets.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Checks every media reference of a content document against the media library:
 * exists, is a public website asset, has an accepted kind, mobile variant matches desktop kind,
 * posters are images. Missing alt text on images is a warning for drafts and an error on publish
 * (an empty alt text on the placement explicitly marks the image as decorative).
 */
async function checkMediaRefs(
  db: DbExecutor,
  type: WebsiteSectionType,
  content: unknown,
  mode: 'draft' | 'publish',
): Promise<{ refs: MediaRefOccurrence[]; errors: Detail[]; warnings: Detail[] }> {
  const refs = collectMediaRefs(content);
  const assets = await loadAssets(
    db,
    refs.map((r) => r.ref.assetId),
  );
  const accepted = SECTION_MEDIA_KINDS[type];
  const errors: Detail[] = [];
  const warnings: Detail[] = [];
  const desktopKind = new Map<string, string>();

  for (const occurrence of refs) {
    const asset = assets.get(occurrence.ref.assetId);
    if (occurrence.variant === 'desktop' && asset) desktopKind.set(occurrence.slotPath, asset.kind);
  }

  for (const { role, slotPath, variant, ref } of refs) {
    const path = `content.${role}`;
    const asset = assets.get(ref.assetId);
    if (!asset) {
      errors.push({ path, message: 'Medium nicht gefunden.' });
      continue;
    }
    if (asset.purpose !== 'WEBSITE' || asset.visibility !== 'PUBLIC') {
      errors.push({ path, message: 'Nur Medien aus der Website-Mediathek sind erlaubt.' });
      continue;
    }
    if (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO') {
      errors.push({ path, message: 'Nur Bilder und Videos sind erlaubt.' });
      continue;
    }
    if (variant === 'poster') {
      if (asset.kind !== 'IMAGE')
        errors.push({ path, message: 'Das Posterbild muss ein Bild sein.' });
      continue;
    }
    if (!accepted.includes(asset.kind)) {
      const allowed = accepted.map((kind) => KIND_LABEL[kind]).join(' und ') || 'keine Medien';
      errors.push({ path, message: `Dieser Bereich erlaubt nur ${allowed}.` });
      continue;
    }
    if (
      variant === 'mobile' &&
      desktopKind.get(slotPath) &&
      desktopKind.get(slotPath) !== asset.kind
    ) {
      errors.push({ path, message: 'Die mobile Variante muss denselben Typ haben wie Desktop.' });
      continue;
    }
    if (asset.kind === 'IMAGE') {
      const decorative = ref.altText === '';
      const effectiveAlt = ref.altText ?? asset.altText ?? '';
      if (!decorative && effectiveAlt.trim() === '') {
        const issue = {
          path,
          message: 'Alt-Text fehlt — in der Mediathek ergänzen oder als dekorativ markieren.',
        };
        (mode === 'publish' ? errors : warnings).push(issue);
      }
    }
  }
  return { refs, errors, warnings };
}

async function replaceSlots(db: DbExecutor, versionId: string, refs: MediaRefOccurrence[]) {
  await db.delete(websiteMediaSlots).where(eq(websiteMediaSlots.versionId, versionId));
  if (refs.length > 0) {
    await db
      .insert(websiteMediaSlots)
      .values(refs.map((r) => ({ versionId, role: r.role, assetId: r.ref.assetId })));
  }
}

// ---------------------------------------------------------------------------------------------
// Media resolution (preview + public)

function resolveRef(
  ref: MediaRef | undefined,
  assets: Map<string, AssetRow>,
  urls: MediaUrlResolver,
): ResolvedMedia | undefined {
  if (!ref) return undefined;
  const asset = assets.get(ref.assetId);
  if (!asset || asset.visibility !== 'PUBLIC') return undefined;
  if (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO') return undefined;
  return {
    assetId: asset.id,
    kind: asset.kind,
    url: urls.publicUrl(asset.storageKey),
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    altText: ref.altText ?? asset.altText ?? '',
    ...(ref.focalPoint ? { focalPoint: ref.focalPoint } : {}),
  };
}

/** Section-type specific shaping of published content (e.g. hidden Journey stages are dropped). */
function shapeForRendering(type: WebsiteSectionType, content: Record<string, unknown>) {
  if (type === 'journey' && Array.isArray(content.stages)) {
    return {
      ...content,
      stages: content.stages.filter((stage) => (stage as { enabled?: boolean }).enabled !== false),
    };
  }
  return content;
}

async function resolveContents(
  db: DbExecutor,
  urls: MediaUrlResolver,
  items: { type: WebsiteSectionType; content: unknown }[],
): Promise<Record<string, unknown>[]> {
  const assets = await loadAssets(
    db,
    items.flatMap((item) => collectMediaRefs(item.content).map((r) => r.ref.assetId)),
  );
  return items.map((item) => {
    const resolved = mapMediaSlots(item.content, (slot: MediaSlot) => {
      const desktop = resolveRef(slot.desktop, assets, urls);
      if (!desktop) return null; // no usable primary asset → render the section's fallback
      const mobile = resolveRef(slot.mobile, assets, urls);
      const poster = resolveRef(slot.poster, assets, urls);
      return { desktop, ...(mobile ? { mobile } : {}), ...(poster ? { poster } : {}) };
    }) as Record<string, unknown>;
    return shapeForRendering(item.type, resolved);
  });
}

// ---------------------------------------------------------------------------------------------
// Admin: read

export async function listPages(deps: WebsiteServiceDeps): Promise<AdminWebsitePage[]> {
  const pages = await deps.db.select().from(websitePages).orderBy(asc(websitePages.slug));
  return Promise.all(pages.map((page) => pageOverview(deps.db, page)));
}

async function pageOverview(db: DbExecutor, page: PageRow): Promise<AdminWebsitePage> {
  const sections = await db
    .select()
    .from(websiteSections)
    .where(eq(websiteSections.pageId, page.id))
    .orderBy(asc(websiteSections.sortOrder), asc(websiteSections.key));
  const live = await liveVersions(
    db,
    sections.map((s) => s.id),
  );
  return {
    slug: page.slug,
    title: page.title,
    contentRevision: page.contentRevision,
    lastPublishedAt: iso(page.lastPublishedAt),
    sections: sections.map((section) => toSummary(section, live.get(section.id))),
  };
}

export async function getPageOverview(
  deps: WebsiteServiceDeps,
  slug: string,
): Promise<AdminWebsitePage> {
  return pageOverview(deps.db, await findPage(deps.db, slug));
}

export async function getSectionDetail(
  deps: WebsiteServiceDeps,
  slug: string,
  key: string,
): Promise<AdminSectionDetail> {
  const page = await findPage(deps.db, slug);
  const section = await findSection(deps.db, page.id, key);
  const live = (await liveVersions(deps.db, [section.id])).get(section.id) ?? {};
  return {
    page: { slug: page.slug, title: page.title },
    section: toSummary(section, live),
    draft: live.draft ? toVersionDto(live.draft) : null,
    published: live.published ? toVersionDto(live.published) : null,
  };
}

export async function getSectionPreview(
  deps: WebsiteServiceDeps,
  slug: string,
  key: string,
): Promise<SectionPreview> {
  const page = await findPage(deps.db, slug);
  const section = await findSection(deps.db, page.id, key);
  const live = (await liveVersions(deps.db, [section.id])).get(section.id) ?? {};
  const version = live.draft ?? live.published;
  if (!version) throw AppError.notFound('Für diesen Bereich gibt es noch keinen Inhalt.');
  const [content] = await resolveContents(deps.db, deps.urls, [
    { type: section.type, content: version.content },
  ]);
  return {
    section: toSummary(section, live),
    source: version.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
    updatedAt: version.updatedAt.toISOString(),
    content: content ?? {},
  };
}

// ---------------------------------------------------------------------------------------------
// Admin: write

export async function saveDraft(
  deps: WebsiteServiceDeps,
  input: { slug: string; key: string; content: unknown; userId: string | null },
): Promise<SaveDraftResponse> {
  try {
    return await deps.db.transaction(async (tx) => {
      const page = await findPage(tx, input.slug);
      const section = await findSection(tx, page.id, input.key, { lock: true });
      const content = parseOrThrow(section.type, input.content);
      const media = await checkMediaRefs(tx, section.type, content, 'draft');
      if (media.errors.length > 0) {
        throw AppError.validation(media.errors, 'Medienzuordnung ist ungültig.');
      }

      const [existing] = await tx
        .select({ id: websiteSectionVersions.id })
        .from(websiteSectionVersions)
        .where(
          and(
            eq(websiteSectionVersions.sectionId, section.id),
            eq(websiteSectionVersions.status, 'DRAFT'),
          ),
        );
      const [draft] = existing
        ? await tx
            .update(websiteSectionVersions)
            .set({ content, schemaVersion: CURRENT_SCHEMA_VERSION, updatedByUserId: input.userId })
            .where(eq(websiteSectionVersions.id, existing.id))
            .returning()
        : await tx
            .insert(websiteSectionVersions)
            .values({
              sectionId: section.id,
              status: 'DRAFT',
              content,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              createdByUserId: input.userId,
              updatedByUserId: input.userId,
            })
            .returning();
      if (!draft) throw new Error('draft write returned no row');
      await replaceSlots(tx, draft.id, media.refs);
      return { draft: toVersionDto(draft), warnings: media.warnings };
    });
  } catch (error) {
    // An asset deleted between the check and the insert: report it like a missing asset.
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      throw AppError.validation(
        [{ path: 'content', message: 'Ein ausgewähltes Medium existiert nicht mehr.' }],
        'Medienzuordnung ist ungültig.',
      );
    }
    throw error;
  }
}

export async function discardDraft(
  deps: WebsiteServiceDeps,
  input: { slug: string; key: string },
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const page = await findPage(tx, input.slug);
    const section = await findSection(tx, page.id, input.key, { lock: true });
    const removed = await tx
      .delete(websiteSectionVersions)
      .where(
        and(
          eq(websiteSectionVersions.sectionId, section.id),
          eq(websiteSectionVersions.status, 'DRAFT'),
        ),
      )
      .returning({ id: websiteSectionVersions.id });
    if (removed.length === 0) throw AppError.notFound('Kein Entwurf vorhanden.');
  });
}

/**
 * Publishes the section's draft in ONE transaction:
 *   1. lock the section, load the draft (409 if none)
 *   2. re-validate content + media (schema drift, deleted media, missing alt text) → 400, no change
 *   3. current PUBLISHED → ARCHIVED (history kept; its media pins released)
 *   4. DRAFT → PUBLISHED (published_at/by set)
 *   5. page.content_revision += 1 (public cache key)
 * Visitors see either the old or the new version, never a mix. The publish hook runs after commit.
 */
export async function publishSection(
  deps: WebsiteServiceDeps,
  input: { slug: string; key: string; userId: string | null },
): Promise<PublishResponse> {
  const result = await deps.db.transaction(async (tx) => {
    const page = await findPage(tx, input.slug);
    const section = await findSection(tx, page.id, input.key, { lock: true });
    const live = (await liveVersions(tx, [section.id])).get(section.id) ?? {};
    if (!live.draft) throw AppError.conflict('Kein Entwurf zum Veröffentlichen vorhanden.');

    const content = parseOrThrow(section.type, live.draft.content);
    const media = await checkMediaRefs(tx, section.type, content, 'publish');
    if (media.errors.length > 0) {
      throw AppError.validation(media.errors, 'Veröffentlichen nicht möglich.');
    }

    const now = new Date();
    if (live.published) {
      await tx.delete(websiteMediaSlots).where(eq(websiteMediaSlots.versionId, live.published.id));
      await tx
        .update(websiteSectionVersions)
        .set({ status: 'ARCHIVED', archivedAt: now })
        .where(eq(websiteSectionVersions.id, live.published.id));
    }
    const [published] = await tx
      .update(websiteSectionVersions)
      .set({
        status: 'PUBLISHED',
        content,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        publishedAt: now,
        publishedByUserId: input.userId,
      })
      .where(eq(websiteSectionVersions.id, live.draft.id))
      .returning();
    if (!published) throw new Error('publish returned no row');
    await replaceSlots(tx, published.id, media.refs);
    const [updatedPage] = await tx
      .update(websitePages)
      .set({ contentRevision: sql`${websitePages.contentRevision} + 1`, lastPublishedAt: now })
      .where(eq(websitePages.id, page.id))
      .returning({ contentRevision: websitePages.contentRevision });
    return { published, contentRevision: updatedPage?.contentRevision ?? 0, now };
  });

  deps.logger.info(
    { page: input.slug, section: input.key, contentRevision: result.contentRevision },
    'website section published',
  );
  await notifyPublicChange(deps, {
    pageSlug: input.slug,
    sectionKey: input.key,
    contentRevision: result.contentRevision,
    publishedAt: result.now,
    reason: 'publish',
  });
  return { published: toVersionDto(result.published), contentRevision: result.contentRevision };
}

/** Runs the publish hook after commit; never throws. */
async function notifyPublicChange(deps: WebsiteServiceDeps, event: PublishedEvent): Promise<void> {
  if (!deps.onPublished) return;
  try {
    await deps.onPublished(event);
  } catch (error) {
    deps.logger.warn(
      { err: (error as Error).name, reason: event.reason },
      'public-change hook failed (content is live; cache expires on its own)',
    );
  }
}

/**
 * Section settings that affect the public page directly (no draft): visibility and order.
 * Changes the page's content revision and triggers revalidation like a publish.
 */
export async function updateSectionSettings(
  deps: WebsiteServiceDeps,
  input: { slug: string; key: string; enabled?: boolean; sortOrder?: number },
): Promise<WebsiteSectionSummary> {
  const result = await deps.db.transaction(async (tx) => {
    const page = await findPage(tx, input.slug);
    const section = await findSection(tx, page.id, input.key, { lock: true });
    const [updated] = await tx
      .update(websiteSections)
      .set({
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      })
      .where(eq(websiteSections.id, section.id))
      .returning();
    const [updatedPage] = await tx
      .update(websitePages)
      .set({ contentRevision: sql`${websitePages.contentRevision} + 1` })
      .where(eq(websitePages.id, page.id))
      .returning({ contentRevision: websitePages.contentRevision });
    if (!updated) throw new Error('section update returned no row');
    const live = (await liveVersions(tx, [updated.id])).get(updated.id) ?? {};
    return {
      summary: toSummary(updated, live),
      contentRevision: updatedPage?.contentRevision ?? 0,
    };
  });
  deps.logger.info(
    { page: input.slug, section: input.key, enabled: input.enabled, sortOrder: input.sortOrder },
    'website section settings changed',
  );
  await notifyPublicChange(deps, {
    pageSlug: input.slug,
    sectionKey: input.key,
    contentRevision: result.contentRevision,
    publishedAt: new Date(),
    reason: 'settings',
  });
  return result.summary;
}

// ---------------------------------------------------------------------------------------------
// Public

/**
 * Published content of a page: enabled sections with a PUBLISHED version only, media resolved.
 * Drafts are never selected. A section whose stored content no longer satisfies the public
 * contract is left out and logged as an error — it never reaches the renderer half-valid.
 */
export async function getPublicPage(
  deps: WebsiteServiceDeps,
  slug: string,
): Promise<PublicWebsitePage> {
  const page = await findPage(deps.db, slug);
  const rows = await deps.db
    .select({
      key: websiteSections.key,
      type: websiteSections.type,
      content: websiteSectionVersions.content,
    })
    .from(websiteSections)
    .innerJoin(
      websiteSectionVersions,
      and(
        eq(websiteSectionVersions.sectionId, websiteSections.id),
        eq(websiteSectionVersions.status, 'PUBLISHED'),
      ),
    )
    .where(and(eq(websiteSections.pageId, page.id), eq(websiteSections.enabled, true)))
    .orderBy(asc(websiteSections.sortOrder), asc(websiteSections.key));

  const contents = await resolveContents(deps.db, deps.urls, rows);
  const sections: PublicWebsiteSection[] = [];
  rows.forEach((row, index) => {
    const parsed = publicWebsiteSectionSchema.safeParse({
      key: row.key,
      type: row.type,
      content: contents[index],
    });
    if (parsed.success) sections.push(parsed.data);
    else {
      deps.logger.error(
        { page: slug, section: row.key, issues: parsed.error.issues.length },
        'published section failed the public contract and was omitted',
      );
    }
  });

  return {
    slug: page.slug,
    title: page.title,
    contentRevision: page.contentRevision,
    publishedAt: iso(page.lastPublishedAt),
    sections,
  };
}
