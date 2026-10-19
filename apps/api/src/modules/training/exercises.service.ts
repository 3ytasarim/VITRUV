import type { AdminExercise } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError, PG_UNIQUE_VIOLATION, pgErrorCode } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { recordEvent } from '../auth/auth.service';
import type { MediaUrlResolver } from '../media/media-url';

/**
 * Shared, organisation-wide exercise library (Sprint 6). ADMIN and COACH read and write it; there
 * are no per-coach libraries. Exercises are never hard-deleted — `active = false` hides them from
 * the picker while existing assignments keep working. Media: TRAINING library assets only.
 */
export interface TrainingDeps {
  db: DbExecutor;
  logger: Logger;
  urls: MediaUrlResolver;
  now?: () => Date;
}

const { exercises, mediaAssets, trainingExerciseAssignments } = schema;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);
const notFound = () => AppError.notFound('Übung nicht gefunden.');
const nameTaken = () =>
  AppError.conflict('Exercise name already exists.', [
    { path: 'name', message: 'Eine Übung mit diesem Namen gibt es bereits.' },
  ]);

async function toDtos(deps: TrainingDeps, rows: (typeof exercises.$inferSelect)[]) {
  const ids = rows.map((row) => row.id);
  const mediaIds = rows.map((row) => row.mediaAssetId).filter((id): id is string => Boolean(id));
  const usage = ids.length
    ? await deps.db
        .select({ exerciseId: trainingExerciseAssignments.exerciseId, uses: count() })
        .from(trainingExerciseAssignments)
        .where(inArray(trainingExerciseAssignments.exerciseId, ids))
        .groupBy(trainingExerciseAssignments.exerciseId)
    : [];
  const media = mediaIds.length
    ? await deps.db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds))
    : [];
  const usageMap = new Map(usage.map((row) => [row.exerciseId, row.uses]));
  const mediaMap = new Map(media.map((row) => [row.id, row]));
  return rows.map((row): AdminExercise => {
    const asset = row.mediaAssetId ? mediaMap.get(row.mediaAssetId) : undefined;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      media:
        asset && (asset.kind === 'IMAGE' || asset.kind === 'VIDEO')
          ? {
              assetId: asset.id,
              kind: asset.kind,
              url: deps.urls.publicUrl(asset.storageKey),
              fileName: asset.fileName,
            }
          : null,
      usageCount: usageMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function listExercises(
  deps: TrainingDeps,
  query: { q?: string; status: 'active' | 'inactive' | 'all' },
): Promise<{ items: AdminExercise[] }> {
  const rows = await deps.db
    .select()
    .from(exercises)
    .where(
      and(
        query.q ? ilike(exercises.name, `%${escapeLike(query.q)}%`) : undefined,
        query.status === 'all' ? undefined : eq(exercises.active, query.status === 'active'),
      ),
    )
    .orderBy(asc(sql`lower(${exercises.name})`), asc(exercises.id))
    .limit(500);
  return { items: await toDtos(deps, rows) };
}

export async function getExercise(deps: TrainingDeps, id: string): Promise<AdminExercise> {
  const [row] = await deps.db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  if (!row) throw notFound();
  const [dto] = await toDtos(deps, [row]);
  if (!dto) throw notFound();
  return dto;
}

/** Exercise media must be a TRAINING library image/video (public demonstration content). */
async function requireTrainingMedia(db: DbExecutor, assetId: string) {
  const [asset] = await db
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, visibility: mediaAssets.visibility })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.purpose, 'TRAINING_VIDEO')))
    .limit(1);
  if (!asset || asset.kind === 'DOCUMENT' || asset.visibility !== 'PUBLIC') {
    throw AppError.validation([
      {
        path: 'mediaAssetId',
        message: 'Bitte ein Bild oder Video aus der Trainings-Mediathek wählen.',
      },
    ]);
  }
}

export async function createExercise(
  deps: TrainingDeps,
  actor: Principal,
  input: { name: string; description?: string | null; mediaAssetId?: string | null },
): Promise<AdminExercise> {
  if (input.mediaAssetId) await requireTrainingMedia(deps.db, input.mediaAssetId);
  try {
    const id = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(exercises)
        .values({
          name: input.name,
          description: input.description ?? null,
          mediaAssetId: input.mediaAssetId ?? null,
          createdByUserId: actor.userId,
        })
        .returning({ id: exercises.id });
      if (!row) throw new Error('insert returned nothing');
      await recordEvent(tx, 'EXERCISE_CREATED', { actorUserId: actor.userId, entityId: row.id });
      return row.id;
    });
    deps.logger.info(
      { event: 'exercise_created', exerciseId: id, actorUserId: actor.userId },
      'exercise created',
    );
    return getExercise(deps, id);
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw nameTaken();
    throw error;
  }
}

export async function updateExercise(
  deps: TrainingDeps,
  id: string,
  input: { name?: string; description?: string | null; mediaAssetId?: string | null },
): Promise<AdminExercise> {
  if (input.mediaAssetId) await requireTrainingMedia(deps.db, input.mediaAssetId);
  try {
    const [row] = await deps.db
      .update(exercises)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.mediaAssetId !== undefined ? { mediaAssetId: input.mediaAssetId } : {}),
      })
      .where(eq(exercises.id, id))
      .returning({ id: exercises.id });
    if (!row) throw notFound();
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw nameTaken();
    throw error;
  }
  return getExercise(deps, id);
}

export async function setExerciseActive(
  deps: TrainingDeps,
  actor: Principal,
  id: string,
  active: boolean,
): Promise<AdminExercise> {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(exercises)
      .set({ active })
      .where(and(eq(exercises.id, id), eq(exercises.active, !active)))
      .returning({ id: exercises.id });
    if (row) {
      await recordEvent(tx, active ? 'EXERCISE_REACTIVATED' : 'EXERCISE_DEACTIVATED', {
        actorUserId: actor.userId,
        entityId: id,
      });
    }
  });
  return getExercise(deps, id);
}
