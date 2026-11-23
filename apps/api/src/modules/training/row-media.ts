import type { ExerciseMedia } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '../../lib/errors';
import type { MediaUrlResolver } from '../media/media-url';

/**
 * Sprint 7: the optional video/image of ONE plan row (template exercise or one client's exercise
 * assignment) that overrides the library medium. Only TRAINING library images/videos are allowed
 * (the same rule as the exercise library).
 */
const { mediaAssets: M } = schema;

type MediaRow = Pick<
  typeof M.$inferSelect,
  'id' | 'kind' | 'storageKey' | 'fileName' | 'mimeType' | 'visibility' | 'purpose'
>;

/**
 * DTO of a TRAINING image/video (null for documents, a missing asset, or a PRIVATE asset that can
 * not be signed for the current viewer — fail closed, Sprint 8A).
 */
export function exerciseMediaDto(
  urls: MediaUrlResolver,
  asset: MediaRow | null | undefined,
): ExerciseMedia | null {
  if (!asset || (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO')) return null;
  const url = urls.assetUrl(asset);
  if (!url) return null;
  return {
    assetId: asset.id,
    kind: asset.kind,
    url,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  };
}

/** One query for all row media; key = asset id. */
export async function loadRowMedia(
  urls: MediaUrlResolver,
  db: DbExecutor,
  assetIds: Iterable<string | null | undefined>,
): Promise<Map<string, ExerciseMedia>> {
  const ids = [...new Set([...assetIds].filter((id): id is string => Boolean(id)))];
  const result = new Map<string, ExerciseMedia>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      id: M.id,
      kind: M.kind,
      storageKey: M.storageKey,
      fileName: M.fileName,
      mimeType: M.mimeType,
      visibility: M.visibility,
      purpose: M.purpose,
    })
    .from(M)
    .where(inArray(M.id, ids));
  for (const row of rows) {
    const dto = exerciseMediaDto(urls, row);
    if (dto) result.set(row.id, dto);
  }
  return result;
}

/**
 * Every given asset must be a TRAINING image/video (one query) — PUBLIC (before the Sprint 8A
 * switch) or PRIVATE (signed delivery). `path` is the field the
 * validation error points to.
 */
export async function requireTrainingMediaRows(
  db: DbExecutor,
  rows: { assetId: string | null | undefined; path: string }[],
): Promise<void> {
  const wanted = rows.filter((r): r is { assetId: string; path: string } => Boolean(r.assetId));
  if (wanted.length === 0) return;
  const found = await db
    .select({ id: M.id, kind: M.kind })
    .from(M)
    .where(
      and(
        inArray(M.id, [...new Set(wanted.map((r) => r.assetId))]),
        eq(M.purpose, 'TRAINING_VIDEO'),
      ),
    );
  const usable = new Set(found.filter((a) => a.kind !== 'DOCUMENT').map((a) => a.id));
  const bad = wanted.find((r) => !usable.has(r.assetId));
  if (bad) {
    throw AppError.validation([
      { path: bad.path, message: 'Bitte ein Bild oder Video aus der Trainings-Mediathek wählen.' },
    ]);
  }
}
