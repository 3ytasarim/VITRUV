import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { websiteSectionType, websiteVersionStatus } from './enums';
import { mediaAssets } from './media-assets';
import { users } from './users';

/**
 * Website CMS (see docs/CMS-ARCHITECTURE.md).
 *
 *   website_pages             stable pages ('home')
 *   website_sections          stable structure: which section sits where on a page
 *   website_section_versions  typed, validated content documents (DRAFT / PUBLISHED / ARCHIVED)
 *   website_media_slots       explicit media references of the live (DRAFT/PUBLISHED) versions
 *
 * Content is one JSON document per section version, validated by the section type's Zod schema
 * in @vitruv/contracts before it is written — never one untyped blob for the whole site.
 */
export const websitePages = pgTable(
  'website_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    /** Incremented by every publish on the page — public cache key / revalidation hook. */
    contentRevision: integer('content_revision').notNull().default(0),
    lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check('website_pages_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('website_pages_revision_nonnegative', sql`${table.contentRevision} >= 0`),
  ],
);

export const websiteSections = pgTable(
  'website_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => websitePages.id, { onDelete: 'restrict' }),
    /** Stable identity on the page ('hero', 'faq' …). Never changes once created. */
    key: text('key').notNull(),
    /** Which content schema applies. */
    type: websiteSectionType('type').notNull(),
    sortOrder: integer('sort_order').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('website_sections_page_key_unique').on(table.pageId, table.key),
    index('website_sections_page_order_idx').on(table.pageId, table.sortOrder),
    check('website_sections_key_format', sql`${table.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const websiteSectionVersions = pgTable(
  'website_section_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => websiteSections.id, { onDelete: 'restrict' }),
    status: websiteVersionStatus('status').notNull(),
    /** Section content, validated against the section type's schema (`schema_version`). */
    content: jsonb('content').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // At most one working draft and one live version per section — enforced by the database.
    uniqueIndex('website_section_versions_one_draft')
      .on(table.sectionId)
      .where(sql`${table.status} = 'DRAFT'`),
    uniqueIndex('website_section_versions_one_published')
      .on(table.sectionId)
      .where(sql`${table.status} = 'PUBLISHED'`),
    index('website_section_versions_section_created_idx').on(table.sectionId, table.createdAt),
    check(
      'website_section_versions_publish_fields',
      sql`(${table.status} = 'DRAFT') = (${table.publishedAt} is null)`,
    ),
    check(
      'website_section_versions_archive_fields',
      sql`(${table.status} = 'ARCHIVED') = (${table.archivedAt} is not null)`,
    ),
    check(
      'website_section_versions_content_object',
      sql`jsonb_typeof(${table.content}) = 'object'`,
    ),
  ],
);

/**
 * One row per media reference inside a DRAFT or PUBLISHED version, e.g.
 *   role 'media.desktop'                  → hero background (desktop)
 *   role 'stages.kraft.media.mobile'      → Journey stage image (mobile)
 *
 * The asset FK is ON DELETE RESTRICT, so the database itself refuses to delete an asset that live
 * content still uses. A version's rows are removed when it is archived — history keeps its JSON
 * but no longer pins media.
 */
export const websiteMediaSlots = pgTable(
  'website_media_slots',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => websiteSectionVersions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.role] }),
    index('website_media_slots_asset_idx').on(table.assetId),
  ],
);

export type WebsitePage = typeof websitePages.$inferSelect;
export type WebsiteSection = typeof websiteSections.$inferSelect;
export type WebsiteSectionVersion = typeof websiteSectionVersions.$inferSelect;
export type WebsiteMediaSlot = typeof websiteMediaSlots.$inferSelect;
