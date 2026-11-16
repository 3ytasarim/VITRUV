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
import { createReadStream } from 'node:fs';
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
import { convertHeicToJpeg, type HeicConverter } from './heic-convert';
import { HEVC_CODECS, sniffMedia, sniffMediaFile, type SniffResult } from './media-sniff';
import type { StagedUpload } from './upload-receiver';
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
  /** Streaming uploads: temp dir for staged files + max. simultaneous uploads per process. */
  uploads?: { tmpDir: string; maxConcurrent: number };
  /** Called after a replaced file went live (expires the public page cache). */
  onPublicMediaChanged?: () => Promise<void>;
  /** HEIC → JPEG conversion (worker thread); injectable for tests. */
  convertHeic?: HeicConverter;
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
    focalPoint:
      typeof asset.focalX === 'number' && typeof asset.focalY === 'number'
        ? { x: asset.focalX, y: asset.focalY }
        : null,
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

/**
 * Canonical declared type. HEIC/HEIF are one input format; browsers on Windows often send no
 * type (or octet-stream) for .heic files, so the extension decides there — the bytes are
 * sniffed afterwards in any case, the declaration never decides alone.
 */
const normalizeMime = (mime: string, fileName?: string) => {
  const lower = mime.trim().toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'image/heif') return 'image/heic';
  // (multipart parts without a Content-Type are reported as text/plain by the parser)
  const untyped = lower === '' || lower === 'application/octet-stream' || lower === 'text/plain';
  if (untyped && /.hei[cf]$/i.test(fileName ?? '')) {
    return 'image/heic';
  }
  return lower;
};

/** Display name of a converted HEIC: same name, .jpg extension. */
const jpegFileName = (name: string) => name.replace(/.hei[cf]$/i, '') + '.jpg';

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
  const declaredKind = checkDeclaredUpload({ ...input, sizeBytes: input.bytes.byteLength });
  return checkSniffedUpload({ ...input, kind: declaredKind, sniffed: sniffMedia(input.bytes) });
}

/** Step 1 (before reading content): allowed declared type and per-kind size limit. */
export function checkDeclaredUpload(input: {
  declaredType: string;
  fileName?: string | undefined;
  sizeBytes: number;
  limits: Readonly<Record<WebsiteMediaKind, number>>;
}): WebsiteMediaKind {
  const declaredKind = websiteMediaKindForMimeType(
    normalizeMime(input.declaredType, input.fileName),
  );
  if (!declaredKind) {
    throw AppError.badRequest(
      'Dateityp nicht erlaubt. Erlaubt sind JPEG, PNG, WebP, AVIF, HEIC, MP4 und WebM.',
    );
  }
  if (input.sizeBytes > input.limits[declaredKind]) {
    throw AppError.payloadTooLarge(
      `Datei zu groß (max. ${Math.floor(input.limits[declaredKind] / 1024 / 1024)} MB).`,
    );
  }
  if (input.sizeBytes === 0) throw AppError.badRequest('Die Datei ist leer.');
  return declaredKind;
}

/** Step 2: the real content (magic bytes) must match the declared type; no HEVC video. */
export function checkSniffedUpload(input: {
  declaredType: string;
  fileName: string | undefined;
  kind: WebsiteMediaKind;
  sniffed: SniffResult | null;
}): ValidatedUpload {
  const declared = normalizeMime(input.declaredType, input.fileName);
  const sniffed = input.sniffed;
  if (!sniffed || sniffed.mimeType !== declared) {
    throw AppError.badRequest('Der Dateiinhalt entspricht nicht dem angegebenen Dateityp.');
  }
  if (sniffed.videoCodecs.some((codec) => HEVC_CODECS.has(codec))) {
    throw AppError.badRequest(
      'HEVC/H.265-Videos sind nicht browserkompatibel. Bitte eine H.264-MP4- oder WebM-Fassung hochladen.',
    );
  }
  return {
    kind: input.kind,
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

// The key is generated from server-side values only; the client's file name never reaches it.
const libraryStorageKey = (library: MediaLibrary, upload: ValidatedUpload) =>
  buildStorageKey({
    visibility: 'PUBLIC',
    purpose: LIBRARY[library].storagePurpose,
    extension: upload.extension,
  });

interface StoredFile {
  upload: ValidatedUpload;
  storageKey: string;
  sizeBytes: number;
}

const KIND_LABEL: Record<WebsiteMediaKind, string> = { IMAGE: 'Bild', VIDEO: 'Video' };

/**
 * Validates the staged upload (type, size, content signature; HEIC → JPEG) and writes it to
 * object storage under a NEW server-generated key. Streaming: validation reads only headers /
 * metadata boxes from disk (bounded memory), the file is streamed to storage, and an object only
 * exists under its key after a COMPLETE write (drivers guarantee it). The caller records the
 * metadata row and deletes the object again if that fails. `expectKind`: replacements keep the
 * kind (a CMS image slot must not suddenly hold a video).
 */
async function storeStagedFile(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  staged: StagedUpload,
  expectKind?: WebsiteMediaKind,
): Promise<StoredFile> {
  const kind = checkDeclaredUpload({
    declaredType: staged.declaredType,
    fileName: staged.fileName,
    sizeBytes: staged.sizeBytes,
    limits: deps.limits,
  });
  if (expectKind && kind !== expectKind) {
    const label = KIND_LABEL[expectKind];
    throw AppError.badRequest(`Ein ${label} kann nur durch ein ${label} ersetzt werden.`);
  }
  const upload = checkSniffedUpload({
    declaredType: staged.declaredType,
    fileName: staged.fileName,
    kind,
    sniffed: await sniffMediaFile(staged, staged.sizeBytes),
  });
  if (upload.sniffed.mimeType === 'image/heic') {
    return storeConvertedHeic(deps, library, staged, upload);
  }
  const storageKey = libraryStorageKey(library, upload);
  await deps.storage.putStream({
    key: storageKey,
    body: createReadStream(staged.path),
    sizeBytes: staged.sizeBytes,
    contentType: upload.sniffed.mimeType,
    visibility: 'PUBLIC',
  });
  return { upload, storageKey, sizeBytes: staged.sizeBytes };
}

/**
 * iPhone photo (HEIC/HEIF): converted to JPEG (worker thread, metadata incl. GPS dropped) and
 * stored as a normal JPEG — browsers can not display HEIC. Images are ≤ 20 MiB, so the file is
 * read into memory for the decoder; pixel count and parallelism are capped there.
 */
async function storeConvertedHeic(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  staged: StagedUpload,
  original: ValidatedUpload,
): Promise<StoredFile> {
  const heic = await staged.read(0, staged.sizeBytes);
  const converted = await (deps.convertHeic ?? convertHeicToJpeg)(heic);
  const upload: ValidatedUpload = {
    kind: 'IMAGE',
    sniffed: {
      mimeType: 'image/jpeg',
      width: converted.width,
      height: converted.height,
      durationMs: null,
      videoCodecs: [],
    },
    fileName: sanitizeFileName(jpegFileName(original.fileName)),
    extension: 'jpg',
  };
  const storageKey = libraryStorageKey(library, upload);
  await deps.storage.put({
    key: storageKey,
    body: converted.jpeg,
    contentType: 'image/jpeg',
    visibility: 'PUBLIC',
  });
  deps.logger.info({ library, width: converted.width }, 'HEIC photo converted to JPEG');
  return { upload, storageKey, sizeBytes: converted.jpeg.byteLength };
}

/**
 * New asset from a streamed upload (upload-receiver.ts). The metadata row is inserted last — a
 * failure at any step leaves nothing published. The caller discards the temp file.
 */
export async function uploadStagedLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  input: { staged: StagedUpload; altText: string | null; userId: string },
): Promise<AdminMediaAsset> {
  const stored = await storeStagedFile(deps, library, input.staged);
  return recordUploadedAsset(deps, library, {
    ...stored,
    altText: input.altText,
    userId: input.userId,
  });
}

/**
 * Replaces the FILE of an existing asset (owner request 2026-11-14: media in use must be
 * replaceable). The asset keeps its id, so every reference — CMS drafts and published versions,
 * exercises — shows the new file at once without editing content; only the metadata row points
 * to a new storage key (new key = no stale CDN/browser cache).
 *
 * Order: new object written → row switched (only if it still points to the old key, so two
 * simultaneous replacements can not lose a file) → public page cache expired → old object
 * deleted. Any failure before the switch removes the new object; the old file stays live.
 */
export async function replaceStagedLibraryMedia(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  id: string,
  input: { staged: StagedUpload; altText: string | null; userId: string },
): Promise<AdminMediaDetail> {
  const [current] = await deps.db.select().from(mediaAssets).where(libraryAsset(library, id));
  if (!current) throw AppError.notFound('Medium nicht gefunden.');
  const currentKind: WebsiteMediaKind = current.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const stored = await storeStagedFile(deps, library, input.staged, currentKind);
  let switched: { id: string } | undefined;
  try {
    [switched] = await deps.db
      .update(mediaAssets)
      .set({
        storageKey: stored.storageKey,
        fileName: stored.upload.fileName,
        mimeType: stored.upload.sniffed.mimeType,
        sizeBytes: stored.sizeBytes,
        width: stored.upload.sniffed.width,
        height: stored.upload.sniffed.height,
        durationMs: stored.upload.sniffed.durationMs,
        // A new alt text if given, otherwise the asset's existing one stays.
        altText: input.altText?.trim() || current.altText,
        uploadedByUserId: input.userId,
      })
      .where(and(libraryAsset(library, id), eq(mediaAssets.storageKey, current.storageKey)))
      .returning({ id: mediaAssets.id });
  } catch (error) {
    await deps.storage.delete(stored.storageKey, 'PUBLIC').catch(() => undefined);
    throw error;
  }
  if (!switched) {
    await deps.storage.delete(stored.storageKey, 'PUBLIC').catch(() => undefined);
    throw AppError.conflict(
      'Das Medium wurde inzwischen geändert oder gelöscht. Bitte die Seite neu laden.',
    );
  }
  // The public page caches resolved media URLs: expire it BEFORE the old file disappears.
  if (deps.onPublicMediaChanged) {
    await deps.onPublicMediaChanged().catch((error: unknown) => {
      deps.logger.warn({ err: (error as Error).name }, 'public cache refresh after replace failed');
    });
  }
  await deps.storage.delete(current.storageKey, 'PUBLIC').catch((error: unknown) => {
    deps.logger.warn(
      { assetId: id, err: (error as Error).name },
      'media replaced but old object cleanup failed (orphaned object)',
    );
  });
  deps.logger.info({ assetId: id, kind: current.kind, library }, 'media file replaced');
  return getLibraryMedia(deps, library, id);
}

async function recordUploadedAsset(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  input: {
    upload: ValidatedUpload;
    storageKey: string;
    sizeBytes: number;
    altText: string | null;
    userId: string;
  },
): Promise<AdminMediaAsset> {
  const { upload, storageKey } = input;
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
        sizeBytes: input.sizeBytes,
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
  const set: Partial<typeof mediaAssets.$inferInsert> = {};
  if (patch.altText !== undefined) set.altText = patch.altText?.trim() || null;
  if (patch.focalPoint !== undefined) {
    // Stored rounded; centred = no default (null).
    const point = patch.focalPoint;
    const centred = !point || (point.x === 0.5 && point.y === 0.5);
    set.focalX = centred ? null : Math.round(point.x * 1000) / 1000;
    set.focalY = centred ? null : Math.round(point.y * 1000) / 1000;
  }
  const [updated] = await deps.db
    .update(mediaAssets)
    .set(set)
    .where(libraryAsset(library, id))
    .returning({ id: mediaAssets.id });
  if (!updated) throw AppError.notFound('Medium nicht gefunden.');
  // The default image section shows on the public page wherever a placement has none of its own.
  if (patch.focalPoint !== undefined && deps.onPublicMediaChanged) {
    await deps.onPublicMediaChanged().catch((error: unknown) => {
      deps.logger.warn(
        { err: (error as Error).name },
        'public cache refresh after media edit failed',
      );
    });
  }
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
