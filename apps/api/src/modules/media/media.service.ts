import type {
  AdminMediaAsset,
  AdminMediaDetail,
  ExerciseMediaUsage,
  MediaUsage,
  UpdateMediaRequest,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import {
  WEBSITE_MEDIA_EXTENSIONS,
  websiteMediaKindForMimeType,
  type WebsiteMediaKind,
} from '@vitruv/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  buildStorageKey,
  type ObjectStorage,
  type StoragePurpose,
} from '../../infra/storage/index';
import {
  AppError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_RESTRICT_VIOLATION,
  pgErrorCode,
} from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { HEVC_CODECS, sniffMedia, type SniffResult } from './media-sniff';
import type { MediaUrlResolver } from './media-url';

const {
  mediaAssets,
  websiteMediaSlots,
  websiteSectionVersions,
  websiteSections,
  websitePages,
  exercises,
} = schema;

/**
 * One media system, two libraries (same table, storage, validation and delete protection):
 *  - WEBSITE  — CMS images/videos (website.media.* permissions)
 *  - TRAINING — exercise demonstration images/videos (training.* permissions, Sprint 6)
 * Both are PUBLIC: demonstration content without personal data. Private client media
 * (feedback videos, nutrition PDFs) will be PRIVATE assets with signed URLs.
 */
export type MediaLibrary = 'WEBSITE' | 'TRAINING';
const LIBRARY: Record<
  MediaLibrary,
  { purpose: 'WEBSITE' | 'TRAINING_VIDEO'; storagePurpose: StoragePurpose }
> = {
  WEBSITE: { purpose: 'WEBSITE', storagePurpose: 'website' },
  TRAINING: { purpose: 'TRAINING_VIDEO', storagePurpose: 'training-video' },
};

export interface MediaServiceDeps {
  db: DbExecutor;
  storage: ObjectStorage;
  urls: MediaUrlResolver;
  logger: Logger;
  limits: Readonly<Record<WebsiteMediaKind, number>>;
}

type MediaAssetRow = typeof mediaAssets.$inferSelect;

export function toAdminMediaDto(
  asset: MediaAssetRow,
  urls: MediaUrlResolver,
  usageCount: number,
): AdminMediaAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    visibility: asset.visibility,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    altText: asset.altText,
    url: urls.publicUrl(asset.storageKey),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    usageCount,
  };
}

// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001F\u007F<>:"|?*]/g;

/**
 * Display name for an uploaded file: last path segment only, no control/reserved characters,
 * bounded length. It is stored for humans and NEVER used to build a storage path.
 */
export function sanitizeFileName(raw: string | undefined): string {
  const lastSegment = (raw ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = lastSegment.replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim();
  const withoutDots = cleaned.replace(/^\.+/, '');
  return (withoutDots || 'upload').slice(0, 180);
}

const normalizeMime = (mime: string) => {
  const lower = mime.trim().toLowerCase();
  return lower === 'image/jpg' || lower === 'image/pjpeg' ? 'image/jpeg' : lower;
};

export interface ValidatedUpload {
  kind: WebsiteMediaKind;
  sniffed: SniffResult;
  fileName: string;
  extension: string;
}

/**
 * Validates an upload before anything is stored: allowed type, content matches the declared
 * type, per-kind size limit, browser-compatible video codec. Pure — no I/O.
 */
export function validateWebsiteUpload(input: {
  bytes: Uint8Array;
  declaredType: string;
  fileName: string | undefined;
  limits: Readonly<Record<WebsiteMediaKind, number>>;
}): ValidatedUpload {
  const declared = normalizeMime(input.declaredType);
  const declaredKind = websiteMediaKindForMimeType(declared);
  if (!declaredKind) {
    throw AppError.badRequest(
      'Dateityp nicht erlaubt. Erlaubt sind JPEG, PNG, WebP, AVIF, MP4 und WebM.',
    );
  }
  if (input.bytes.byteLength > input.limits[declaredKind]) {
    throw AppError.payloadTooLarge(
      `Datei zu groß (max. ${Math.floor(input.limits[declaredKind] / 1024 / 1024)} MB).`,
    );
  }
  const sniffed = sniffMedia(input.bytes);
  if (!sniffed || sniffed.mimeType !== declared) {
    throw AppError.badRequest('Der Dateiinhalt entspricht nicht dem angegebenen Dateityp.');
  }
  if (sniffed.videoCodecs.some((codec) => HEVC_CODECS.has(codec))) {
    throw AppError.badRequest(
      'HEVC/H.265-Videos sind nicht browserkompatibel. Bitte eine H.264-MP4- oder WebM-Fassung hochladen.',
    );
  }
  return {
    kind: declaredKind,
    sniffed,
    fileName: sanitizeFileName(input.fileName),
    extension: WEBSITE_MEDIA_EXTENSIONS[sniffed.mimeType] ?? 'bin',
  };
}

async function usageCounts(db: DbExecutor, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const slotRows = await db
    .select({ assetId: websiteMediaSlots.assetId, uses: count() })
    .from(websiteMediaSlots)
    .where(inArray(websiteMediaSlots.assetId, ids))
    .groupBy(websiteMediaSlots.assetId);
  const exerciseRows = await db
    .select({ assetId: exercises.mediaAssetId, uses: count() })
    .from(exercises)
    .where(inArray(exercises.mediaAssetId, ids))
    .groupBy(exercises.mediaAssetId);
  const counts = new Map<string, number>();
  for (const row of [...slotRows, ...exerciseRows]) {
    if (row.assetId) counts.set(row.assetId, (counts.get(row.assetId) ?? 0) + row.uses);
  }
  return counts;
}

/** Exercises referencing an asset (active or not) — they block deletion. */
export async function exerciseUsages(
  db: DbExecutor,
  assetId: string,
): Promise<ExerciseMediaUsage[]> {
  return db
    .select({ exerciseId: exercises.id, name: exercises.name, active: exercises.active })
    .from(exercises)
    .where(eq(exercises.mediaAssetId, assetId))
    .orderBy(exercises.name);
}

export async function mediaUsages(db: DbExecutor, assetId: string): Promise<MediaUsage[]> {
  return db
    .select({
      pageSlug: websitePages.slug,
      sectionKey: websiteSections.key,
      sectionType: websiteSections.type,
      status: websiteSectionVersions.status,
      role: websiteMediaSlots.role,
    })
    .from(websiteMediaSlots)
    .innerJoin(websiteSectionVersions, eq(websiteSectionVersions.id, websiteMediaSlots.versionId))
    .innerJoin(websiteSections, eq(websiteSections.id, websiteSectionVersions.sectionId))
    .innerJoin(websitePages, eq(websitePages.id, websiteSections.pageId))
    .where(eq(websiteMediaSlots.assetId, assetId))
    .orderBy(websitePages.slug, websiteSections.sortOrder, websiteMediaSlots.role);
}

const libraryAsset = (library: MediaLibrary, id: string) =>
  and(eq(mediaAssets.id, id), eq(mediaAssets.purpose, LIBRARY[library].purpose));

export function listWebsiteMedia(deps: MediaServiceDeps, filter: { kind?: WebsiteMediaKind }) {
  return listLibraryMedia(deps, 'WEBSITE', filter);
}

export async function listLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  filter: { kind?: WebsiteMediaKind },
): Promise<AdminMediaAsset[]> {
  const rows = await deps.db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.purpose, LIBRARY[library].purpose),
        filter.kind ? eq(mediaAssets.kind, filter.kind) : undefined,
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(500);
  const counts = await usageCounts(
    deps.db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toAdminMediaDto(row, deps.urls, counts.get(row.id) ?? 0));
}

export function getWebsiteMedia(deps: MediaServiceDeps, id: string) {
  return getLibraryMedia(deps, 'WEBSITE', id);
}

export async function getLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  id: string,
): Promise<AdminMediaDetail> {
  const [asset] = await deps.db.select().from(mediaAssets).where(libraryAsset(library, id));
  if (!asset) throw AppError.notFound('Medium nicht gefunden.');
  const usages = await mediaUsages(deps.db, id);
  const byExercises = await exerciseUsages(deps.db, id);
  return {
    ...toAdminMediaDto(asset, deps.urls, usages.length + byExercises.length),
    usages,
    exerciseUsages: byExercises,
  };
}

export interface MediaUploadInput {
  bytes: Uint8Array;
  declaredType: string;
  fileName: string | undefined;
  altText: string | null;
  userId: string;
}

export function uploadWebsiteMedia(deps: MediaServiceDeps, input: MediaUploadInput) {
  return uploadLibraryMedia(deps, 'WEBSITE', input);
}

export async function uploadLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  input: MediaUploadInput,
): Promise<AdminMediaAsset> {
  const upload = validateWebsiteUpload({ ...input, limits: deps.limits });
  // The key is generated from server-side values only; the client's file name never reaches it.
  const storageKey = buildStorageKey({
    visibility: 'PUBLIC',
    purpose: LIBRARY[library].storagePurpose,
    extension: upload.extension,
  });
  await deps.storage.put({
    key: storageKey,
    body: input.bytes,
    contentType: upload.sniffed.mimeType,
    visibility: 'PUBLIC',
  });
  try {
    const [asset] = await deps.db
      .insert(mediaAssets)
      .values({
        kind: upload.kind,
        purpose: LIBRARY[library].purpose,
        visibility: 'PUBLIC',
        storageKey,
        fileName: upload.fileName,
        mimeType: upload.sniffed.mimeType,
        sizeBytes: input.bytes.byteLength,
        width: upload.sniffed.width,
        height: upload.sniffed.height,
        durationMs: upload.sniffed.durationMs,
        altText: input.altText?.trim() || null,
        uploadedByUserId: input.userId,
      })
      .returning();
    if (!asset) throw new Error('insert returned no row');
    deps.logger.info({ assetId: asset.id, kind: asset.kind, library }, 'media uploaded');
    return toAdminMediaDto(asset, deps.urls, 0);
  } catch (error) {
    // No metadata row → no orphaned object.
    await deps.storage.delete(storageKey, 'PUBLIC').catch(() => undefined);
    throw error;
  }
}

export function updateWebsiteMedia(deps: MediaServiceDeps, id: string, patch: UpdateMediaRequest) {
  return updateLibraryMedia(deps, 'WEBSITE', id, patch);
}

export async function updateLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  id: string,
  patch: UpdateMediaRequest,
): Promise<AdminMediaDetail> {
  const [updated] = await deps.db
    .update(mediaAssets)
    .set({ altText: patch.altText?.trim() || null })
    .where(libraryAsset(library, id))
    .returning({ id: mediaAssets.id });
  if (!updated) throw AppError.notFound('Medium nicht gefunden.');
  return getLibraryMedia(deps, library, id);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Entwurf',
  PUBLISHED: 'Veröffentlicht',
  ARCHIVED: 'Archiv',
};

function inUseError(usages: MediaUsage[], byExercises: ExerciseMediaUsage[] = []) {
  return AppError.conflict(
    'Das Medium wird noch verwendet und kann nicht gelöscht werden. Zuerst in den Inhalten bzw. Übungen ersetzen oder entfernen.',
    [
      ...usages.map((usage) => ({
        path: `${usage.pageSlug}/${usage.sectionKey}/${usage.role}`,
        message: STATUS_LABEL[usage.status] ?? usage.status,
      })),
      ...byExercises.map((usage) => ({
        path: `exercise/${usage.exerciseId}`,
        message: `Übung „${usage.name}“${usage.active ? '' : ' (inaktiv)'}`,
      })),
    ],
  );
}

/**
 * Deletes a website asset only if no draft or published content references it.
 *
 * The asset row is locked (FOR UPDATE) while usage is checked, so a concurrent draft save that
 * references it waits and then fails its FK check instead of silently pointing at a deleted file.
 * The FK (ON DELETE RESTRICT) is the final guarantee. The stored object is removed after commit.
 */
export function deleteWebsiteMedia(deps: MediaServiceDeps, id: string) {
  return deleteLibraryMedia(deps, 'WEBSITE', id);
}

export async function deleteLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  id: string,
): Promise<void> {
  let storageKey: string;
  try {
    storageKey = await deps.db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(mediaAssets)
        .where(libraryAsset(library, id))
        .for('update');
      if (!asset) throw AppError.notFound('Medium nicht gefunden.');
      const usages = await mediaUsages(tx, id);
      const byExercises = await exerciseUsages(tx, id);
      if (usages.length > 0 || byExercises.length > 0) throw inUseError(usages, byExercises);
      await tx.delete(mediaAssets).where(eq(mediaAssets.id, id));
      return asset.storageKey;
    });
  } catch (error) {
    const code = pgErrorCode(error);
    if (code === PG_RESTRICT_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) {
      throw inUseError(await mediaUsages(deps.db, id), await exerciseUsages(deps.db, id));
    }
    throw error;
  }
  await deps.storage.delete(storageKey, 'PUBLIC').catch((error: unknown) => {
    deps.logger.warn(
      { assetId: id, err: (error as Error).name },
      'media row deleted but object cleanup failed (orphaned object)',
    );
  });
}
