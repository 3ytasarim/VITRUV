import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { mediaKind, mediaPurpose, mediaVisibility } from './enums';
import { users } from './users';

/**
 * Metadata for every file in object storage (website media, training videos, nutrition PDFs,
 * client uploads, feedback videos). The binary itself is NEVER stored in PostgreSQL —
 * `storage_key` points at the object in the bucket.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: mediaKind('kind').notNull(),
    // What the file is for (website, nutrition …). Set explicitly by every upload path.
    purpose: mediaPurpose('purpose').notNull(),
    // Private by default: making something public must be an explicit decision.
    visibility: mediaVisibility('visibility').notNull().default('PRIVATE'),
    storageKey: text('storage_key').notNull().unique(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    altText: text('alt_text'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('media_assets_kind_idx').on(table.kind),
    index('media_assets_purpose_created_idx').on(table.purpose, table.createdAt),
    index('media_assets_uploaded_by_idx').on(table.uploadedByUserId),
    check('media_assets_size_nonnegative', sql`${table.sizeBytes} >= 0`),
    check('media_assets_width_positive', sql`${table.width} > 0`),
    check('media_assets_height_positive', sql`${table.height} > 0`),
    check('media_assets_duration_nonnegative', sql`${table.durationMs} >= 0`),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
