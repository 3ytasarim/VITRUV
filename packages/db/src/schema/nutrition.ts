import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { nutritionDocumentStatus } from './enums';
import { mediaAssets } from './media-assets';
import { users } from './users';

/**
 * Client-specific nutrition documents (Sprint 8, docs/NUTRITION-ARCHITECTURE.md).
 *
 * One row per uploaded PDF version. The file itself is a PRIVATE media asset (purpose NUTRITION)
 * that is only delivered through authenticated, client-scoped endpoints — never via /media.
 * History is permanent: documents are archived, never deleted, and the asset is protected by
 * RESTRICT (also for archived versions). At most ONE ACTIVE document per client (partial index).
 */
export const nutritionDocuments = pgTable(
  'nutrition_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /** 1, 2, 3 … per client (assigned by the API at upload). */
    versionNumber: integer('version_number').notNull(),
    /** Optional label from the coach ("Aufbauphase", "Version 2b"). */
    versionLabel: text('version_label'),
    status: nutritionDocumentStatus('status').notNull().default('DRAFT'),
    effectiveFrom: date('effective_from'),
    /** Who uploaded/assigned it (kept if that account is later removed). */
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('nutrition_documents_one_active')
      .on(table.clientUserId)
      .where(sql`${table.status} = 'ACTIVE'`),
    unique('nutrition_documents_version_unique').on(table.clientUserId, table.versionNumber),
    unique('nutrition_documents_media_unique').on(table.mediaAssetId),
    index('nutrition_documents_client_created_idx').on(table.clientUserId, table.createdAt),
    check('nutrition_documents_title_length', sql`char_length(${table.title}) between 1 and 160`),
    check(
      'nutrition_documents_version_label_length',
      sql`${table.versionLabel} is null or char_length(${table.versionLabel}) between 1 and 60`,
    ),
    check('nutrition_documents_version_positive', sql`${table.versionNumber} >= 1`),
    check(
      'nutrition_documents_status_timestamps',
      sql`(${table.status} = 'DRAFT' and ${table.activatedAt} is null and ${table.archivedAt} is null)
        or (${table.status} = 'ACTIVE' and ${table.activatedAt} is not null and ${table.archivedAt} is null)
        or (${table.status} = 'ARCHIVED' and ${table.archivedAt} is not null)`,
    ),
  ],
);

export type NutritionDocument = typeof nutritionDocuments.$inferSelect;
