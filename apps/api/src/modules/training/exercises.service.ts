import type { AdminExercise, ExerciseCategory } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, asc, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
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

const {
  clientPlanItems,
  exercises,
  exerciseCategories,
  mediaAssets,
  trainingExerciseAssignments,
  workoutSessionExercises,
} = schema;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);
const notFound = () => AppError.notFound('Übung nicht gefunden.');
const nameTaken = () =>
  AppError.conflict('Exercise name already exists.', [
    { path: 'name', message: 'Eine Übung mit diesem Namen gibt es bereits.' },
  ]);
const codeTaken = () =>
  AppError.conflict('Exercise code already exists.', [
    { path: 'code', message: 'Dieser Code ist bereits vergeben.' },
  ]);
/** Unique violations name the index: tell the coach which field clashes. */
const uniqueError = (error: unknown) => {
  const e = error as { constraint?: string; cause?: { constraint?: string } };
  const name = e.constraint ?? e.cause?.constraint ?? '';
  return name.includes('code') ? codeTaken() : nameTaken();
};

/** Catalogue fields shared by create and update. */
type CatalogInput = {
  categoryId?: string | null;
  code?: string | null;
  captureType?: string | null;
  standard?: string | null;
  usage?: string | null;
};
const catalogValues = (input: CatalogInput) => ({
  ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
  ...(input.code !== undefined ? { code: input.code } : {}),
  ...(input.captureType !== undefined ? { captureType: input.captureType } : {}),
  ...(input.standard !== undefined ? { standard: input.standard } : {}),
  ...(input.usage !== undefined ? { usage: input.usage } : {}),
});

async function requireCategory(db: DbExecutor, categoryId: string) {
  const [row] = await db
    .select({ id: exerciseCategories.id })
    .from(exerciseCategories)
    .where(eq(exerciseCategories.id, categoryId))
    .limit(1);
  if (!row) {
    throw AppError.validation([{ path: 'categoryId', message: 'Kategorie nicht gefunden.' }]);
  }
}

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
  const categoryIds = [
    ...new Set(rows.map((row) => row.categoryId).filter((v): v is string => Boolean(v))),
  ];
  const categories = categoryIds.length
    ? await deps.db
        .select({ id: exerciseCategories.id, name: exerciseCategories.name })
        .from(exerciseCategories)
        .where(inArray(exerciseCategories.id, categoryIds))
    : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const usageMap = new Map(usage.map((row) => [row.exerciseId, row.uses]));
  const plans = ids.length
    ? await deps.db
        .select({
          exerciseId: clientPlanItems.exerciseId,
          plans: sql<number>`count(distinct ${clientPlanItems.clientUserId})::int`,
        })
        .from(clientPlanItems)
        .where(inArray(clientPlanItems.exerciseId, ids))
        .groupBy(clientPlanItems.exerciseId)
    : [];
  const planMap = new Map(plans.map((row) => [row.exerciseId, Number(row.plans)]));
  const mediaMap = new Map(media.map((row) => [row.id, row]));
  return rows.map((row): AdminExercise => {
    const asset = row.mediaAssetId ? mediaMap.get(row.mediaAssetId) : undefined;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      category: row.categoryId ? (categoryMap.get(row.categoryId) ?? null) : null,
      code: row.code,
      captureType: row.captureType,
      standard: row.standard,
      usage: row.usage,
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
      planCount: planMap.get(row.id) ?? 0,
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
        query.q
          ? or(
              ilike(exercises.name, `%${escapeLike(query.q)}%`),
              ilike(exercises.code, `%${escapeLike(query.q)}%`),
            )
          : undefined,
        query.status === 'all' ? undefined : eq(exercises.active, query.status === 'active'),
      ),
    )
    // catalogue order: by code (OK-01, OK-02 …), uncoded exercises by name after them
    .orderBy(
      asc(sql`${exercises.code} is null`),
      asc(exercises.code),
      asc(sql`lower(${exercises.name})`),
      asc(exercises.id),
    )
    .limit(1000);
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
  input: {
    name: string;
    description?: string | null;
    mediaAssetId?: string | null;
  } & CatalogInput,
): Promise<AdminExercise> {
  if (input.mediaAssetId) await requireTrainingMedia(deps.db, input.mediaAssetId);
  if (input.categoryId) await requireCategory(deps.db, input.categoryId);
  try {
    const id = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(exercises)
        .values({
          name: input.name,
          description: input.description ?? null,
          mediaAssetId: input.mediaAssetId ?? null,
          ...catalogValues(input),
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
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw uniqueError(error);
    throw error;
  }
}

export async function updateExercise(
  deps: TrainingDeps,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    mediaAssetId?: string | null;
  } & CatalogInput,
): Promise<AdminExercise> {
  if (input.mediaAssetId) await requireTrainingMedia(deps.db, input.mediaAssetId);
  if (input.categoryId) await requireCategory(deps.db, input.categoryId);
  try {
    const [row] = await deps.db
      .update(exercises)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.mediaAssetId !== undefined ? { mediaAssetId: input.mediaAssetId } : {}),
        ...catalogValues(input),
      })
      .where(eq(exercises.id, id))
      .returning({ id: exercises.id });
    if (!row) throw notFound();
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw uniqueError(error);
    throw error;
  }
  return getExercise(deps, id);
}

/**
 * Hard delete (owner request 2026-10-21, e.g. a "DEMO" exercise). Allowed only while the exercise
 * has no history: never used in a program or a workout session (those keep their references —
 * deactivate instead). It is removed from client training plans in the same transaction.
 */
export async function deleteExercise(
  deps: TrainingDeps,
  actor: Principal,
  id: string,
): Promise<{ removedFromPlans: number }> {
  const removed = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, id))
      .for('update')
      .limit(1);
    if (!row) throw notFound();
    const [programUse] = await tx
      .select({ n: count() })
      .from(trainingExerciseAssignments)
      .where(eq(trainingExerciseAssignments.exerciseId, id));
    const [workoutUse] = await tx
      .select({ n: count() })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.exerciseId, id));
    if ((programUse?.n ?? 0) > 0 || (workoutUse?.n ?? 0) > 0) {
      throw AppError.conflict(
        'Diese Übung wurde bereits in Trainings verwendet und kann nicht gelöscht werden – bitte deaktivieren.',
      );
    }
    const fromPlans = await tx
      .delete(clientPlanItems)
      .where(eq(clientPlanItems.exerciseId, id))
      .returning({ client: clientPlanItems.clientUserId });
    await tx.delete(exercises).where(eq(exercises.id, id));
    return new Set(fromPlans.map((r) => r.client)).size;
  });
  deps.logger.info(
    {
      event: 'exercise_deleted',
      exerciseId: id,
      actorUserId: actor.userId,
      removedFromPlans: removed,
    },
    'exercise deleted',
  );
  return { removedFromPlans: removed };
}

// ---------------------------------------------------------------- categories

/** Categories in picker order with their number of active exercises. */
export async function listExerciseCategories(
  deps: TrainingDeps,
): Promise<{ items: ExerciseCategory[] }> {
  const rows = await deps.db
    .select({
      id: exerciseCategories.id,
      name: exerciseCategories.name,
      sortOrder: exerciseCategories.sortOrder,
      exerciseCount: sql<number>`(select count(*)::int from exercises e where e.category_id = exercise_categories.id and e.active)`,
    })
    .from(exerciseCategories)
    .orderBy(asc(exerciseCategories.sortOrder), asc(sql`lower(${exerciseCategories.name})`));
  return { items: rows.map((row) => ({ ...row, exerciseCount: Number(row.exerciseCount) })) };
}

/** New category at the end of the list (name unique, case-insensitive). */
export async function createExerciseCategory(
  deps: TrainingDeps,
  input: { name: string },
): Promise<ExerciseCategory> {
  try {
    // own (sub-)transaction: a name clash must not poison an enclosing transaction
    const [row] = await deps.db.transaction((tx) =>
      tx
        .insert(exerciseCategories)
        .values({
          name: input.name,
          sortOrder: sql`(select coalesce(max(sort_order), 0) + 10 from exercise_categories)`,
        })
        .returning(),
    );
    if (!row) throw new Error('insert returned nothing');
    return { id: row.id, name: row.name, sortOrder: row.sortOrder, exerciseCount: 0 };
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw AppError.conflict('Category exists.', [
        { path: 'name', message: 'Diese Kategorie gibt es bereits.' },
      ]);
    }
    throw error;
  }
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
