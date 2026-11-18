import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { mediaAssets } from './media-assets';

/**
 * "Willkommen" area of the client portal (owner request 2026-11-18): the admin creates
 * categories (shown as tabs) and puts videos from the training media library into them. The same
 * content is shown to every client. A category with videos and a media asset used here can't be
 * deleted (RESTRICT).
 */
export const welcomeCategories = pgTable(
  'welcome_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('welcome_categories_name_lower_unique').on(sql`lower(${table.name})`),
    check('welcome_categories_name_length', sql`char_length(${table.name}) between 1 and 60`),
  ],
);

export const welcomeVideos = pgTable(
  'welcome_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => welcomeCategories.id, { onDelete: 'restrict' }),
    /** Video from the training media library (purpose TRAINING_VIDEO, PUBLIC). */
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('welcome_videos_category_idx').on(table.categoryId, table.sortOrder),
    index('welcome_videos_media_idx').on(table.mediaAssetId),
    check('welcome_videos_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check(
      'welcome_videos_description_length',
      sql`${table.description} is null or char_length(${table.description}) <= 500`,
    ),
  ],
);
