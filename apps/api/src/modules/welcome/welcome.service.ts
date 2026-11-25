import type { AdminWelcome, ClientWelcome } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError, PG_UNIQUE_VIOLATION, pgErrorCode } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { MediaUrlResolver } from '../media/media-url';

/**
 * "Willkommen" (owner request 2026-11-18): categories (tabs) with videos for ALL clients.
 * ADMIN manages them (`welcome.manage`); clients read them (`welcome.self.read`). Videos come from
 * the TRAINING media library (PUBLIC demonstration content) — only the asset id is stored.
 * Ordering: `sort_order` per level, rewritten densely (0, 10, 20 …) by the order endpoints.
 */
export interface WelcomeDeps {
  db: DbExecutor;
  logger: Logger;
  urls: MediaUrlResolver;
}

const { mediaAssets, welcomeCategories, welcomeVideos } = schema;

const categoryNotFound = () => AppError.notFound('Kategorie nicht gefunden.');
const videoNotFound = () => AppError.notFound('Video nicht gefunden.');
const nameTaken = () =>
  AppError.conflict('Category exists.', [
    { path: 'name', message: 'Diese Kategorie gibt es bereits.' },
  ]);

async function load(deps: WelcomeDeps): Promise<AdminWelcome> {
  const categories = await deps.db
    .select()
    .from(welcomeCategories)
    .orderBy(asc(welcomeCategories.sortOrder), asc(welcomeCategories.createdAt));
  const videos = await deps.db
    .select({ video: welcomeVideos, asset: mediaAssets })
    .from(welcomeVideos)
    .innerJoin(mediaAssets, eq(mediaAssets.id, welcomeVideos.mediaAssetId))
    .orderBy(asc(welcomeVideos.sortOrder), asc(welcomeVideos.createdAt));
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      videos: videos
        .filter(({ video }) => video.categoryId === category.id)
        // A PRIVATE video that can not be signed for this viewer is left out (fail closed).
        .map(({ video, asset }) => ({ video, asset, url: deps.urls.assetUrl(asset) }))
        .filter((entry): entry is typeof entry & { url: string } => entry.url !== null)
        .map(({ video, asset, url }) => ({
          id: video.id,
          categoryId: video.categoryId,
          title: video.title,
          description: video.description,
          video: {
            assetId: asset.id,
            url,
            mimeType: asset.mimeType,
            durationMs: asset.durationMs ?? null,
            fileName: asset.fileName,
          },
        })),
    })),
  };
}

export function adminWelcome(deps: WelcomeDeps): Promise<AdminWelcome> {
  return load(deps);
}

/** Client view: only categories with videos; no file names. */
export async function clientWelcome(deps: WelcomeDeps): Promise<ClientWelcome> {
  const all = await load(deps);
  return {
    categories: all.categories
      .filter((category) => category.videos.length > 0)
      .map((category) => ({
        ...category,
        videos: category.videos.map(({ video: { fileName: _fileName, ...video }, ...rest }) => ({
          ...rest,
          video,
        })),
      })),
  };
}

// ---------------------------------------------------------------- categories

export async function createWelcomeCategory(
  deps: WelcomeDeps,
  actor: Principal,
  input: { name: string },
): Promise<AdminWelcome> {
  try {
    // own (sub-)transaction: a name clash must not poison an enclosing transaction
    await deps.db.transaction((tx) =>
      tx.insert(welcomeCategories).values({
        name: input.name,
        sortOrder: sql`(select coalesce(max(sort_order), -10) + 10 from welcome_categories)`,
      }),
    );
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw nameTaken();
    throw error;
  }
  deps.logger.info({ event: 'welcome_category_created', actorUserId: actor.userId }, 'welcome');
  return load(deps);
}

export async function renameWelcomeCategory(
  deps: WelcomeDeps,
  id: string,
  input: { name: string },
): Promise<AdminWelcome> {
  try {
    const rows = await deps.db.transaction((tx) =>
      tx
        .update(welcomeCategories)
        .set({ name: input.name })
        .where(eq(welcomeCategories.id, id))
        .returning({ id: welcomeCategories.id }),
    );
    if (rows.length === 0) throw categoryNotFound();
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw nameTaken();
    throw error;
  }
  return load(deps);
}

/** Only empty categories can be deleted (videos first — nothing disappears by accident). */
export async function deleteWelcomeCategory(deps: WelcomeDeps, id: string): Promise<AdminWelcome> {
  await deps.db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: welcomeCategories.id })
      .from(welcomeCategories)
      .where(eq(welcomeCategories.id, id))
      .for('update');
    if (!category) throw categoryNotFound();
    // owner request 2026-11-18: deleting a category removes its Willkommen entries too.
    // Only the welcome rows go — the video files stay in the training media library.
    const removed = await tx
      .delete(welcomeVideos)
      .where(eq(welcomeVideos.categoryId, id))
      .returning({ id: welcomeVideos.id });
    await tx.delete(welcomeCategories).where(eq(welcomeCategories.id, id));
    deps.logger.info(
      { event: 'welcome_category_deleted', videosRemoved: removed.length },
      'welcome',
    );
  });
  return load(deps);
}

/** The complete list of category ids in the new order. */
export async function orderWelcomeCategories(
  deps: WelcomeDeps,
  ids: string[],
): Promise<AdminWelcome> {
  await deps.db.transaction(async (tx) => {
    const rows = await tx.select({ id: welcomeCategories.id }).from(welcomeCategories);
    assertSameSet(
      rows.map((row) => row.id),
      ids,
    );
    for (const [index, id] of ids.entries()) {
      await tx
        .update(welcomeCategories)
        .set({ sortOrder: index * 10 })
        .where(eq(welcomeCategories.id, id));
    }
  });
  return load(deps);
}

// ---------------------------------------------------------------- videos

async function requireCategory(db: DbExecutor, categoryId: string) {
  const [row] = await db
    .select({ id: welcomeCategories.id })
    .from(welcomeCategories)
    .where(eq(welcomeCategories.id, categoryId))
    .limit(1);
  if (!row) {
    throw AppError.validation([{ path: 'categoryId', message: 'Kategorie nicht gefunden.' }]);
  }
}

/** Only videos of the training media library (public, or private + signed — Sprint 8A). */
async function requireWelcomeVideo(db: DbExecutor, assetId: string) {
  const [asset] = await db
    .select({ kind: mediaAssets.kind })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.purpose, 'TRAINING_VIDEO')))
    .limit(1);
  if (!asset || asset.kind !== 'VIDEO') {
    throw AppError.validation([
      { path: 'mediaAssetId', message: 'Bitte ein Video aus der Trainings-Mediathek wählen.' },
    ]);
  }
}

const nextVideoOrder = (categoryId: string) =>
  sql`(select coalesce(max(sort_order), -10) + 10 from welcome_videos where category_id = ${categoryId})`;

export async function createWelcomeVideo(
  deps: WelcomeDeps,
  actor: Principal,
  input: { categoryId: string; mediaAssetId: string; title: string; description?: string | null },
): Promise<AdminWelcome> {
  await requireCategory(deps.db, input.categoryId);
  await requireWelcomeVideo(deps.db, input.mediaAssetId);
  await deps.db.insert(welcomeVideos).values({
    categoryId: input.categoryId,
    mediaAssetId: input.mediaAssetId,
    title: input.title,
    description: input.description ?? null,
    sortOrder: nextVideoOrder(input.categoryId),
  });
  deps.logger.info({ event: 'welcome_video_created', actorUserId: actor.userId }, 'welcome');
  return load(deps);
}

export async function updateWelcomeVideo(
  deps: WelcomeDeps,
  id: string,
  input: {
    categoryId?: string;
    mediaAssetId?: string;
    title?: string;
    description?: string | null;
  },
): Promise<AdminWelcome> {
  const [current] = await deps.db
    .select({ categoryId: welcomeVideos.categoryId })
    .from(welcomeVideos)
    .where(eq(welcomeVideos.id, id))
    .limit(1);
  if (!current) throw videoNotFound();
  if (input.categoryId) await requireCategory(deps.db, input.categoryId);
  if (input.mediaAssetId) await requireWelcomeVideo(deps.db, input.mediaAssetId);
  const moved = input.categoryId !== undefined && input.categoryId !== current.categoryId;
  await deps.db
    .update(welcomeVideos)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.mediaAssetId !== undefined ? { mediaAssetId: input.mediaAssetId } : {}),
      // moved to another category → appended at its end
      ...(moved && input.categoryId
        ? { categoryId: input.categoryId, sortOrder: nextVideoOrder(input.categoryId) }
        : {}),
    })
    .where(eq(welcomeVideos.id, id));
  return load(deps);
}

/** Removes the video from "Willkommen" only — the file stays in the media library. */
export async function deleteWelcomeVideo(deps: WelcomeDeps, id: string): Promise<AdminWelcome> {
  const rows = await deps.db
    .delete(welcomeVideos)
    .where(eq(welcomeVideos.id, id))
    .returning({ id: welcomeVideos.id });
  if (rows.length === 0) throw videoNotFound();
  return load(deps);
}

/** The complete list of the category's video ids in the new order. */
export async function orderWelcomeVideos(
  deps: WelcomeDeps,
  categoryId: string,
  ids: string[],
): Promise<AdminWelcome> {
  await deps.db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: welcomeCategories.id })
      .from(welcomeCategories)
      .where(eq(welcomeCategories.id, categoryId))
      .for('update');
    if (!category) throw categoryNotFound();
    const rows = await tx
      .select({ id: welcomeVideos.id })
      .from(welcomeVideos)
      .where(eq(welcomeVideos.categoryId, categoryId));
    assertSameSet(
      rows.map((row) => row.id),
      ids,
    );
    for (const [index, id] of ids.entries()) {
      await tx
        .update(welcomeVideos)
        .set({ sortOrder: index * 10 })
        .where(and(eq(welcomeVideos.id, id), eq(welcomeVideos.categoryId, categoryId)));
    }
  });
  return load(deps);
}

function assertSameSet(existing: string[], ids: string[]) {
  const known = new Set(existing);
  if (existing.length !== ids.length || !ids.every((id) => known.has(id))) {
    throw AppError.validation([
      { path: 'ids', message: 'Die Liste ist nicht mehr aktuell. Bitte neu laden.' },
    ]);
  }
}
