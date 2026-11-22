import type {
  AssignTemplateResponse,
  ClientTrainingWeek,
  ClientWorkout,
  ExerciseMedia,
  WeekWorkout,
  WorkoutExercise,
  WorkoutSection,
  WorkoutTemplate,
  WorkoutTemplateList,
  WorkoutTemplateSummary,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import {
  usesExtendedTraining,
  weekStats,
  workoutDayStatus,
  type TrainingExecutionType,
  type TrainingSectionType,
  type WeightUnit,
  type WorkoutTemplateCategory,
} from '@vitruv/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError, pgErrorCode, PG_UNIQUE_VIOLATION } from '../../lib/errors';
import { recordEvent } from '../auth/auth.service';
import { clientAccessible } from '../management/management.service';
import { assertExtendedTypesAllowed } from './capabilities';
import type { TrainingDeps } from './exercises.service';
import { nextPosition } from './ordering';
import { storagePrescription, type PrescriptionInput } from './prescription-storage';
import {
  assertEditable,
  berlinToday,
  mutate,
  programOf,
  requireClientInScope,
  snapshot,
} from './programs.service';
import { loadRowMedia, requireTrainingMediaRows } from './row-media';
import { copyTemplateForDay, type TemplateSource } from './template-copy';

/**
 * Sprint 3 — Workout-Bibliothek (docs/ios-training-sprint3-implementation.md).
 *
 * OWNERSHIP: a template belongs to the coach/admin who created it. COACH sees and changes only own
 * templates; ADMIN sees all (no studio-wide sharing for coaches). Out-of-scope ids are a 404.
 *
 * ISOLATION BY COPY: "Teilnehmer zuweisen" copies the template into ONE client's canonical program
 * (training_days → sections → exercise assignments, new ids). The day keeps only the lineage
 * (source_template_id / version). Template edits bump the version and never reach a copy; a copy
 * edit never reaches the template or another client; sessions read their own snapshot.
 */
const {
  workoutTemplates: T,
  workoutTemplateSections: TS,
  workoutTemplateExercises: TE,
  exercises: E,
  users: U,
  trainingPrograms: P,
  trainingWeeks: W,
  trainingDays: D,
  trainingSections: S,
  trainingExerciseAssignments: A,
  workoutSessions: WS,
  clientPlans: CP,
  clientPlanItems: CPI,
} = schema;

type TemplateRow = typeof T.$inferSelect;
type ProgramRow = typeof P.$inferSelect;
const PG_CHECK_VIOLATION = '23514';
const OFFSET = 1_000_000;
const MAX_PROGRAM_WEEKS = 104;
const notFound = () => AppError.notFound('Not found.');
const nowOf = (deps: Pick<TrainingDeps, 'now'>) => deps.now?.() ?? new Date();

/** Prescription as the editors send it (template rows always carry an execution type). */
type ExerciseInput = PrescriptionInput & { exerciseId: string };
type SectionInput<X> = { type: TrainingSectionType; title?: string | null; exercises: X[] };

const ownerScope = (actor: Principal): SQL | undefined =>
  actor.role === 'ADMIN' ? undefined : eq(T.ownerUserId, actor.userId);

const checkViolationAsValidation = (error: unknown): never => {
  if (pgErrorCode(error) === PG_CHECK_VIOLATION) {
    throw AppError.validation([{ path: 'form', message: 'Ungültige Werte.' }]);
  }
  throw error;
};

// ---------------------------------------------------------------------------------------------
// Calendar helpers (plain YYYY-MM-DD, UTC arithmetic — no time zone drift)
// ---------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) =>
  toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
export const daysBetween = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const isoWeekday = (iso: string) => ((toDate(iso).getUTCDay() + 6) % 7) + 1;
export const mondayOf = (iso: string) => addDays(iso, 1 - isoWeekday(iso));

/** Date of a day inside a program week (weeks are 7-day blocks from startsOn, like currentWeekId). */
function dateOf(startsOn: string | null, weekOrder: number, weekday: number | null): string | null {
  if (!startsOn || weekday === null) return null;
  const weekStart = addDays(startsOn, weekOrder * 7);
  // The weekday's first occurrence on/after the block start.
  return addDays(weekStart, (weekday - isoWeekday(weekStart) + 7) % 7);
}

// ---------------------------------------------------------------------------------------------
// Template tree + DTOs
// ---------------------------------------------------------------------------------------------

async function loadTemplateTree(db: DbExecutor, templateId: string) {
  const sections = await db
    .select()
    .from(TS)
    .where(eq(TS.templateId, templateId))
    .orderBy(asc(TS.sortOrder));
  const exercises = sections.length
    ? await db
        .select({ row: TE, exercise: E })
        .from(TE)
        .innerJoin(E, eq(E.id, TE.exerciseId))
        .where(
          inArray(
            TE.sectionId,
            sections.map((s) => s.id),
          ),
        )
        .orderBy(asc(TE.sortOrder))
    : [];
  return { sections, exercises };
}
type TemplateTree = Awaited<ReturnType<typeof loadTemplateTree>>;

function exerciseDto(
  row: {
    id: string;
    sortOrder: number;
    sets: number | null;
    reps: number | null;
    repsMax: boolean;
    totalReps: number | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    targetWeight: number | null;
    weightUnit: WeightUnit | null;
    prescriptionText: string | null;
    instructionsOverride: string | null;
    executionType: TrainingExecutionType | null;
    mediaAssetId: string | null;
  },
  exercise: typeof E.$inferSelect,
  media: ReadonlyMap<string, ExerciseMedia>,
): WorkoutExercise {
  return {
    id: row.id,
    order: row.sortOrder,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      active: exercise.active,
      hasMedia: Boolean(exercise.mediaAssetId),
    },
    sets: row.sets,
    reps: row.reps,
    repsMax: row.repsMax,
    totalReps: row.totalReps,
    durationSeconds: row.durationSeconds,
    restSeconds: row.restSeconds,
    targetWeight: row.targetWeight,
    weightUnit: row.weightUnit,
    // The warm-up compatibility text is storage-only (Sprint 2 shim) — never shown as a target.
    prescriptionText:
      row.executionType === 'CHECKLIST' && row.prescriptionText === 'Abhaken'
        ? null
        : row.prescriptionText,
    instructionsOverride: row.instructionsOverride,
    executionType: row.executionType,
    // Sprint 7: this row's own medium (null = the library medium of the exercise)
    media: row.mediaAssetId ? (media.get(row.mediaAssetId) ?? null) : null,
  };
}

function templateSections(
  tree: TemplateTree,
  media: ReadonlyMap<string, ExerciseMedia>,
): WorkoutSection[] {
  return tree.sections.map((section) => ({
    id: section.id,
    order: section.sortOrder,
    type: section.type,
    title: section.title,
    exercises: tree.exercises
      .filter((e) => e.row.sectionId === section.id)
      .map((e) => exerciseDto(e.row, e.exercise, media)),
  }));
}

function summaryOf(
  actor: Principal,
  row: TemplateRow,
  ownerName: string,
  stats: { exerciseCount: number; executionTypes: TrainingExecutionType[] },
): WorkoutTemplateSummary {
  return {
    id: row.id,
    title: row.title,
    category: (row.category as WorkoutTemplateCategory | null) ?? null,
    description: row.description,
    version: row.version,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    exerciseCount: stats.exerciseCount,
    executionTypes: stats.executionTypes,
    ownerName,
    ownedByMe: row.ownerUserId === actor.userId,
  };
}

const ownerNameSql = sql<string>`coalesce(${U.displayName}, ${U.username}, 'Coach')`;
const TYPE_ORDER: TrainingExecutionType[] = ['STRENGTH', 'TOTAL_REPS', 'INTERVAL', 'CHECKLIST'];
const sortTypes = (types: Iterable<TrainingExecutionType>) =>
  [...new Set(types)].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));

async function scopedTemplate(
  db: DbExecutor,
  actor: Principal,
  templateId: string,
  lock = false,
): Promise<{ row: TemplateRow; ownerName: string }> {
  const query = db
    .select({ row: T, ownerName: ownerNameSql })
    .from(T)
    .innerJoin(U, eq(U.id, T.ownerUserId))
    .where(and(eq(T.id, templateId), ownerScope(actor)))
    .limit(1);
  const [found] = lock ? await query.for('update', { of: T }) : await query;
  if (!found) throw notFound();
  return found;
}

function toTemplate(
  actor: Principal,
  row: TemplateRow,
  ownerName: string,
  tree: TemplateTree,
  media: ReadonlyMap<string, ExerciseMedia>,
): WorkoutTemplate {
  return {
    ...summaryOf(actor, row, ownerName, {
      exerciseCount: tree.exercises.length,
      executionTypes: sortTypes(tree.exercises.map((e) => e.row.executionType)),
    }),
    sections: templateSections(tree, media),
  };
}

// ---------------------------------------------------------------------------------------------
// Library: list / get / create / update / duplicate / archive
// ---------------------------------------------------------------------------------------------

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listTemplates(
  deps: TrainingDeps,
  actor: Principal,
  query: {
    q?: string;
    category?: WorkoutTemplateCategory;
    status: 'active' | 'archived';
    page: number;
    pageSize: number;
  },
): Promise<WorkoutTemplateList> {
  const conditions: (SQL | undefined)[] = [
    ownerScope(actor),
    query.status === 'archived' ? isNotNull(T.archivedAt) : isNull(T.archivedAt),
  ];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(or(ilike(T.title, pattern), ilike(T.description, pattern)));
  }
  if (query.category) conditions.push(eq(T.category, query.category));
  const where = and(...conditions);
  return snapshot(deps, async (tx) => {
    const [totalRow] = await tx.select({ total: count() }).from(T).where(where);
    const rows = await tx
      .select({ row: T, ownerName: ownerNameSql })
      .from(T)
      .innerJoin(U, eq(U.id, T.ownerUserId))
      .where(where)
      .orderBy(desc(T.updatedAt), desc(T.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const ids = rows.map((r) => r.row.id);
    const stats = ids.length
      ? await tx
          .select({ templateId: TS.templateId, executionType: TE.executionType, n: count() })
          .from(TE)
          .innerJoin(TS, eq(TS.id, TE.sectionId))
          .where(inArray(TS.templateId, ids))
          .groupBy(TS.templateId, TE.executionType)
      : [];
    return {
      items: rows.map(({ row, ownerName }) => {
        const own = stats.filter((s) => s.templateId === row.id);
        return summaryOf(actor, row, ownerName, {
          exerciseCount: own.reduce((sum, s) => sum + Number(s.n), 0),
          executionTypes: sortTypes(own.map((s) => s.executionType)),
        });
      }),
      total: Number(totalRow?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}

export async function getTemplate(
  deps: TrainingDeps,
  actor: Principal,
  templateId: string,
): Promise<WorkoutTemplate> {
  return snapshot(deps, async (tx) => {
    const { row, ownerName } = await scopedTemplate(tx, actor, templateId);
    const tree = await loadTemplateTree(tx, templateId);
    const media = await loadRowMedia(
      deps.urls,
      tx,
      tree.exercises.map((e) => e.row.mediaAssetId),
    );
    return toTemplate(actor, row, ownerName, tree, media);
  });
}

/** Every exercise must exist; NEW ones must be active (rows that already use one may keep it). */
async function requireUsableExercises(
  db: DbExecutor,
  sections: SectionInput<ExerciseInput>[],
  alreadyUsed: ReadonlySet<string> = new Set(),
) {
  const ids = [...new Set(sections.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  if (ids.length === 0) return;
  const rows = await db.select({ id: E.id, active: E.active }).from(E).where(inArray(E.id, ids));
  const usable = new Set(rows.filter((r) => r.active || alreadyUsed.has(r.id)).map((r) => r.id));
  sections.forEach((section, si) =>
    section.exercises.forEach((exercise, ei) => {
      if (!usable.has(exercise.exerciseId)) {
        throw AppError.validation([
          {
            path: `sections.${si}.exercises.${ei}.exerciseId`,
            message: 'Diese Übung ist nicht (mehr) verfügbar.',
          },
        ]);
      }
    }),
  );
  // Sprint 7: a row's own video must be a TRAINING library image/video
  await requireTrainingMediaRows(
    db,
    sections.flatMap((section, si) =>
      section.exercises.map((exercise, ei) => ({
        assetId: exercise.mediaAssetId,
        path: `sections.${si}.exercises.${ei}.mediaAssetId`,
      })),
    ),
  );
}

const flagRows = <X extends ExerciseInput>(sections: SectionInput<X>[]) =>
  sections.flatMap((section, si) =>
    section.exercises.map((exercise, ei) => ({
      ...exercise,
      path: `sections.${si}.exercises.${ei}.executionType`,
    })),
  );

/** Template row values; INTERVAL gets the explicit Core defaults (never a code default later). */
function templateExerciseValues(exercise: ExerciseInput, sectionId: string, sortOrder: number) {
  const values = {
    sectionId,
    sortOrder,
    exerciseId: exercise.exerciseId,
    executionType: exercise.executionType as TrainingExecutionType,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    repsMax: exercise.repsMax ?? false,
    totalReps: exercise.totalReps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
    restSeconds: exercise.restSeconds ?? null,
    targetWeight: exercise.targetWeight ?? null,
    weightUnit: exercise.weightUnit ?? null,
    prescriptionText: exercise.prescriptionText ?? null,
    instructionsOverride: exercise.instructionsOverride ?? null,
    mediaAssetId: exercise.mediaAssetId ?? null,
  };
  return values.executionType === 'INTERVAL'
    ? { ...values, ...storagePrescription(values) }
    : values;
}

async function insertTemplateContent(
  tx: DbExecutor,
  templateId: string,
  sections: SectionInput<ExerciseInput>[],
) {
  for (const [index, section] of sections.entries()) {
    const [inserted] = await tx
      .insert(TS)
      .values({ templateId, type: section.type, title: section.title ?? null, sortOrder: index })
      .returning({ id: TS.id });
    if (!inserted) throw new Error('insert returned nothing');
    if (section.exercises.length > 0) {
      await tx
        .insert(TE)
        .values(section.exercises.map((e, i) => templateExerciseValues(e, inserted.id, i)));
    }
  }
}

type TemplateContent = {
  title: string;
  category?: WorkoutTemplateCategory | null;
  description?: string | null;
  sections: SectionInput<ExerciseInput>[];
};

export async function createTemplate(
  deps: TrainingDeps,
  actor: Principal,
  input: TemplateContent,
): Promise<WorkoutTemplate> {
  assertExtendedTypesAllowed(deps, flagRows(input.sections));
  await requireUsableExercises(deps.db, input.sections);
  const id = await deps.db
    .transaction(async (tx) => {
      const [row] = await tx
        .insert(T)
        .values({
          ownerUserId: actor.userId,
          title: input.title,
          category: input.category ?? null,
          description: input.description ?? null,
        })
        .returning({ id: T.id });
      if (!row) throw new Error('insert returned nothing');
      await insertTemplateContent(tx, row.id, input.sections);
      return row.id;
    })
    .catch(checkViolationAsValidation);
  deps.logger.info(
    { event: 'workout_template_created', templateId: id, actorUserId: actor.userId },
    'workout template created',
  );
  return getTemplate(deps, actor, id);
}

export async function updateTemplate(
  deps: TrainingDeps,
  actor: Principal,
  templateId: string,
  input: TemplateContent & { expectedVersion: number },
): Promise<WorkoutTemplate> {
  assertExtendedTypesAllowed(deps, flagRows(input.sections));
  await deps.db
    .transaction(async (tx) => {
      const { row } = await scopedTemplate(tx, actor, templateId, true);
      if (row.archivedAt) {
        throw AppError.conflict('Archivierte Vorlagen können nicht bearbeitet werden.');
      }
      if (row.version !== input.expectedVersion) {
        throw AppError.conflict(
          'Diese Vorlage wurde inzwischen geändert. Bitte neu laden und die Änderungen erneut vornehmen.',
          [{ path: 'expectedVersion', message: `Aktuelle Version: ${row.version}` }],
        );
      }
      const used = await tx
        .select({ id: TE.exerciseId })
        .from(TE)
        .innerJoin(TS, eq(TS.id, TE.sectionId))
        .where(eq(TS.templateId, templateId));
      await requireUsableExercises(tx, input.sections, new Set(used.map((u) => u.id)));
      // Template rows are referenced by nothing (copies hold their own rows) → replace content.
      await tx.delete(TS).where(eq(TS.templateId, templateId));
      await insertTemplateContent(tx, templateId, input.sections);
      await tx
        .update(T)
        .set({
          title: input.title,
          category: input.category ?? null,
          description: input.description ?? null,
          version: row.version + 1,
          updatedAt: nowOf(deps),
        })
        .where(eq(T.id, templateId));
    })
    .catch(checkViolationAsValidation);
  return getTemplate(deps, actor, templateId);
}

const copyTitle = (title: string) => {
  const suffix = ' (Kopie)';
  return `${title.slice(0, 120 - suffix.length)}${suffix}`;
};

/** New template (new id, version 1, owned by the actor) with the same content; original unchanged. */
export async function duplicateTemplate(
  deps: TrainingDeps,
  actor: Principal,
  templateId: string,
): Promise<WorkoutTemplate> {
  const id = await deps.db
    .transaction(async (tx) => {
      const { row } = await scopedTemplate(tx, actor, templateId);
      const tree = await loadTemplateTree(tx, templateId);
      assertExtendedTypesAllowed(
        deps,
        tree.exercises.map((e) => e.row),
      );
      const [copy] = await tx
        .insert(T)
        .values({
          ownerUserId: actor.userId,
          title: copyTitle(row.title),
          category: row.category,
          description: row.description,
        })
        .returning({ id: T.id });
      if (!copy) throw new Error('insert returned nothing');
      for (const section of tree.sections) {
        const [s] = await tx
          .insert(TS)
          .values({
            templateId: copy.id,
            type: section.type,
            title: section.title,
            sortOrder: section.sortOrder,
          })
          .returning({ id: TS.id });
        if (!s) throw new Error('insert returned nothing');
        const rows = tree.exercises.filter((e) => e.row.sectionId === section.id);
        if (rows.length > 0) {
          await tx.insert(TE).values(
            rows.map(({ row: e }) => {
              const { id: _id, createdAt: _c, updatedAt: _u, sectionId: _s, ...rest } = e;
              return { ...rest, sectionId: s.id };
            }),
          );
        }
      }
      return copy.id;
    })
    .catch(checkViolationAsValidation);
  deps.logger.info(
    { event: 'workout_template_duplicated', templateId: id, sourceTemplateId: templateId },
    'workout template duplicated',
  );
  return getTemplate(deps, actor, id);
}

/** Archive (true) or restore (false). Assigned copies are independent and stay untouched. */
export async function setTemplateArchived(
  deps: TrainingDeps,
  actor: Principal,
  templateId: string,
  archived: boolean,
): Promise<WorkoutTemplate> {
  await deps.db.transaction(async (tx) => {
    const { row } = await scopedTemplate(tx, actor, templateId, true);
    if (Boolean(row.archivedAt) === archived) return;
    await tx
      .update(T)
      .set({ archivedAt: archived ? nowOf(deps) : null, updatedAt: nowOf(deps) })
      .where(eq(T.id, templateId));
  });
  return getTemplate(deps, actor, templateId);
}

// ---------------------------------------------------------------------------------------------
// Assignment: template → independent copy in one client's program
// ---------------------------------------------------------------------------------------------

async function assignmentResult(
  db: DbExecutor,
  dayId: string,
  created: boolean,
  programCreated: boolean,
): Promise<AssignTemplateResponse> {
  const [row] = await db
    .select({ day: D, week: W, program: P })
    .from(D)
    .innerJoin(W, eq(W.id, D.weekId))
    .innerJoin(P, eq(P.id, W.programId))
    .where(eq(D.id, dayId))
    .limit(1);
  if (!row || !row.day.sourceTemplateId || row.day.sourceTemplateVersion === null) throw notFound();
  return {
    created,
    clientId: row.program.clientUserId,
    programId: row.program.id,
    programTitle: row.program.title,
    programStatus: row.program.status,
    programCreated,
    weekId: row.week.id,
    dayId: row.day.id,
    title: row.day.title,
    date: dateOf(row.program.startsOn, row.week.sortOrder, row.day.scheduledWeekday),
    scheduledWeekday: row.day.scheduledWeekday,
    sourceTemplateId: row.day.sourceTemplateId,
    sourceTemplateVersion: row.day.sourceTemplateVersion,
  };
}

/** A request id seen before: same client + template → the stored result; anything else → 409. */
async function replayAssignment(
  db: DbExecutor,
  actor: Principal,
  templateId: string,
  clientId: string,
  requestId: string,
): Promise<AssignTemplateResponse | null> {
  const [existing] = await db
    .select({ dayId: D.id, clientId: P.clientUserId, templateId: D.sourceTemplateId })
    .from(D)
    .innerJoin(W, eq(W.id, D.weekId))
    .innerJoin(P, eq(P.id, W.programId))
    .where(and(eq(D.assignmentRequestId, requestId), clientAccessible(actor, P.clientUserId)))
    .limit(1);
  if (!existing) {
    // Used outside the actor's scope (or deleted together with its day): never reveal which.
    const [foreign] = await db
      .select({ id: D.id })
      .from(D)
      .where(eq(D.assignmentRequestId, requestId))
      .limit(1);
    if (foreign) throw AppError.conflict('Diese Anfrage-ID wurde bereits verwendet.');
    return null;
  }
  if (existing.clientId !== clientId || existing.templateId !== templateId) {
    throw AppError.conflict('Diese Anfrage-ID wurde bereits für eine andere Zuweisung verwendet.');
  }
  return assignmentResult(db, existing.dayId, false, false);
}

async function lockProgram(tx: DbExecutor, programId: string): Promise<ProgramRow> {
  const [program] = await tx.select().from(P).where(eq(P.id, programId)).for('update').limit(1);
  if (!program) throw notFound();
  return program;
}

/** ACTIVE program, otherwise the most recently changed DRAFT (locked), or null. */
async function targetProgram(tx: DbExecutor, clientId: string): Promise<ProgramRow | null> {
  const [candidate] = await tx
    .select({ id: P.id })
    .from(P)
    .where(and(eq(P.clientUserId, clientId), inArray(P.status, ['ACTIVE', 'DRAFT'])))
    .orderBy(sql`case when ${P.status} = 'ACTIVE' then 0 else 1 end`, desc(P.updatedAt))
    .limit(1);
  return candidate ? lockProgram(tx, candidate.id) : null;
}

async function ensureWeek(tx: DbExecutor, programId: string, weekIndex: number): Promise<string> {
  const weeks = await tx
    .select({ id: W.id, sortOrder: W.sortOrder })
    .from(W)
    .where(eq(W.programId, programId))
    .orderBy(asc(W.sortOrder));
  for (let order = weeks.length; order <= weekIndex; order++) {
    const [week] = await tx
      .insert(W)
      .values({ programId, sortOrder: order })
      .returning({ id: W.id, sortOrder: W.sortOrder });
    if (!week) throw new Error('insert returned nothing');
    weeks.push(week);
  }
  const week = weeks[weekIndex];
  if (!week) throw new Error('week missing');
  return week.id;
}

async function insertDayCopy(
  tx: DbExecutor,
  weekId: string,
  source: TemplateSource,
  options: { title: string; scheduledWeekday: number | null; requestId: string },
): Promise<string> {
  const copy = copyTemplateForDay(source, options.title);
  const [day] = await tx
    .insert(D)
    .values({
      weekId,
      sortOrder: await nextPosition(tx, 'day', weekId),
      title: copy.day.title,
      scheduledWeekday: options.scheduledWeekday,
      sourceTemplateId: copy.day.sourceTemplateId,
      sourceTemplateVersion: copy.day.sourceTemplateVersion,
      assignmentRequestId: options.requestId,
    })
    .returning({ id: D.id });
  if (!day) throw new Error('insert returned nothing');
  for (const section of copy.sections) {
    const [s] = await tx
      .insert(S)
      .values({
        dayId: day.id,
        type: section.type,
        title: section.title,
        sortOrder: section.sortOrder,
      })
      .returning({ id: S.id });
    if (!s) throw new Error('insert returned nothing');
    if (section.assignments.length > 0) {
      await tx.insert(A).values(section.assignments.map((a) => ({ ...a, sectionId: s.id })));
    }
  }
  return day.id;
}

export async function assignTemplate(
  deps: TrainingDeps,
  actor: Principal,
  templateId: string,
  input: {
    clientId: string;
    requestId: string;
    date?: string;
    weekId?: string;
    scheduledWeekday?: number | null;
    title?: string;
  },
): Promise<AssignTemplateResponse> {
  const replay = await replayAssignment(
    deps.db,
    actor,
    templateId,
    input.clientId,
    input.requestId,
  );
  if (replay) return replay;
  await requireClientInScope(deps.db, actor, input.clientId);
  let programCreated = false;
  try {
    const dayId = await deps.db.transaction(async (tx) => {
      // One assignment per client at a time: no two parallel requests create two DRAFT programs.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`vitruv.template-assign:${input.clientId}`}))`,
      );
      const { row } = await scopedTemplate(tx, actor, templateId);
      if (row.archivedAt) {
        throw AppError.conflict('Archivierte Vorlagen können nicht zugewiesen werden.');
      }
      const tree = await loadTemplateTree(tx, templateId);
      if (tree.exercises.length === 0) {
        throw AppError.conflict('Diese Vorlage enthält keine Übungen.');
      }
      assertExtendedTypesAllowed(
        deps,
        tree.exercises.map((e) => e.row),
      );
      const inactive = tree.exercises.filter((e) => !e.exercise.active);
      if (inactive.length > 0) {
        throw AppError.conflict(
          `Die Vorlage enthält deaktivierte Übungen: ${inactive.map((e) => e.exercise.name).join(', ')}.`,
        );
      }

      let program: ProgramRow;
      let weekId: string;
      let weekday: number | null;
      if (input.weekId) {
        const [week] = await tx
          .select({ id: W.id, programId: W.programId })
          .from(W)
          .innerJoin(P, eq(P.id, W.programId))
          .where(
            and(
              eq(W.id, input.weekId),
              eq(P.clientUserId, input.clientId),
              clientAccessible(actor, P.clientUserId),
            ),
          )
          .limit(1);
        if (!week) throw notFound();
        program = await lockProgram(tx, week.programId);
        assertEditable(program);
        weekId = week.id;
        weekday = input.scheduledWeekday ?? null;
      } else {
        const date = input.date as string;
        const existing = await targetProgram(tx, input.clientId);
        if (existing) {
          program = existing;
        } else {
          const [created] = await tx
            .insert(P)
            .values({
              clientUserId: input.clientId,
              title: 'Trainingsplan',
              startsOn: mondayOf(date),
              createdByUserId: actor.userId,
            })
            .returning();
          if (!created) throw new Error('insert returned nothing');
          await recordEvent(tx, 'PROGRAM_CREATED', {
            userId: input.clientId,
            actorUserId: actor.userId,
            entityId: created.id,
          });
          program = created;
          programCreated = true;
        }
        assertEditable(program);
        if (!program.startsOn) {
          throw AppError.conflict(
            'Der Trainingsplan hat noch kein Startdatum. Bitte zuerst ein Startdatum festlegen oder eine Trainingswoche wählen.',
          );
        }
        const offset = daysBetween(program.startsOn, date);
        if (offset < 0) {
          throw AppError.validation([
            { path: 'date', message: 'Das Datum liegt vor dem Planstart.' },
          ]);
        }
        if (program.endsOn && date > program.endsOn) {
          throw AppError.validation([
            { path: 'date', message: 'Das Datum liegt nach dem Planende.' },
          ]);
        }
        const weekIndex = Math.floor(offset / 7);
        if (weekIndex >= MAX_PROGRAM_WEEKS) {
          throw AppError.validation([
            { path: 'date', message: 'Das Datum liegt zu weit in der Zukunft.' },
          ]);
        }
        weekId = await ensureWeek(tx, program.id, weekIndex);
        weekday = isoWeekday(date);
      }

      const source: TemplateSource = {
        id: row.id,
        version: row.version,
        title: row.title,
        sections: tree.sections.map((section) => ({
          type: section.type,
          title: section.title,
          sortOrder: section.sortOrder,
          exercises: tree.exercises
            .filter((e) => e.row.sectionId === section.id)
            .map(({ row: e }) => ({
              exerciseId: e.exerciseId,
              sortOrder: e.sortOrder,
              executionType: e.executionType,
              sets: e.sets,
              reps: e.reps,
              repsMax: e.repsMax,
              totalReps: e.totalReps,
              durationSeconds: e.durationSeconds,
              restSeconds: e.restSeconds,
              targetWeight: e.targetWeight,
              weightUnit: e.weightUnit,
              prescriptionText: e.prescriptionText,
              instructionsOverride: e.instructionsOverride,
              mediaAssetId: e.mediaAssetId,
            })),
        })),
      };
      const newDayId = await insertDayCopy(tx, weekId, source, {
        title: input.title ?? row.title,
        scheduledWeekday: weekday,
        requestId: input.requestId,
      });
      await tx
        .update(P)
        .set({ updatedAt: nowOf(deps) })
        .where(eq(P.id, program.id));
      return newDayId;
    });
    deps.logger.info(
      {
        event: 'workout_template_assigned',
        templateId,
        dayId,
        clientUserId: input.clientId,
        actorUserId: actor.userId,
      },
      'workout template assigned',
    );
    return await assignmentResult(deps.db, dayId, true, programCreated);
  } catch (error) {
    // A parallel retry with the same request id won the race → answer with its result.
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      const winner = await replayAssignment(
        deps.db,
        actor,
        templateId,
        input.clientId,
        input.requestId,
      );
      if (winner) return winner;
    }
    return checkViolationAsValidation(error);
  }
}

// ---------------------------------------------------------------------------------------------
// "Für Teilnehmer bearbeiten" — one client day (the copy), never the template
// ---------------------------------------------------------------------------------------------

export async function getClientWorkout(
  deps: TrainingDeps,
  actor: Principal,
  dayId: string,
): Promise<ClientWorkout> {
  await programOf(deps.db, actor, 'day', dayId);
  return snapshot(deps, async (tx) => {
    const [row] = await tx
      .select({ day: D, week: W, program: P })
      .from(D)
      .innerJoin(W, eq(W.id, D.weekId))
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(D.id, dayId), clientAccessible(actor, P.clientUserId)))
      .limit(1);
    if (!row) throw notFound();
    const sections = await tx.select().from(S).where(eq(S.dayId, dayId)).orderBy(asc(S.sortOrder));
    const assignments = sections.length
      ? await tx
          .select({ row: A, exercise: E })
          .from(A)
          .innerJoin(E, eq(E.id, A.exerciseId))
          .where(
            inArray(
              A.sectionId,
              sections.map((s) => s.id),
            ),
          )
          .orderBy(asc(A.sortOrder))
      : [];
    const media = await loadRowMedia(
      deps.urls,
      tx,
      assignments.map((a) => a.row.mediaAssetId),
    );
    const sessionRows = await tx
      .select({ status: WS.status, n: count() })
      .from(WS)
      .where(eq(WS.trainingDayId, dayId))
      .groupBy(WS.status);
    const sessionsOf = (status: string) =>
      Number(sessionRows.find((s) => s.status === status)?.n ?? 0);
    let sourceTemplate: ClientWorkout['sourceTemplate'] = null;
    if (row.day.sourceTemplateId && row.day.sourceTemplateVersion !== null) {
      // The template title only when the template is in the actor's own scope.
      const [template] = await tx
        .select({ title: T.title })
        .from(T)
        .where(and(eq(T.id, row.day.sourceTemplateId), ownerScope(actor)))
        .limit(1);
      sourceTemplate = {
        id: row.day.sourceTemplateId,
        version: row.day.sourceTemplateVersion,
        title: template?.title ?? null,
      };
    }
    return {
      dayId: row.day.id,
      clientId: row.program.clientUserId,
      programId: row.program.id,
      programTitle: row.program.title,
      programStatus: row.program.status,
      weekId: row.week.id,
      weekOrder: row.week.sortOrder,
      title: row.day.title,
      notes: row.day.notes,
      scheduledWeekday: row.day.scheduledWeekday,
      date: dateOf(row.program.startsOn, row.week.sortOrder, row.day.scheduledWeekday),
      version: row.program.updatedAt.toISOString(),
      editable: row.program.status === 'DRAFT' || row.program.status === 'ACTIVE',
      sourceTemplate,
      sessions: { inProgress: sessionsOf('IN_PROGRESS'), completed: sessionsOf('COMPLETED') },
      sections: sections.map((section) => ({
        id: section.id,
        order: section.sortOrder,
        type: section.type,
        title: section.title,
        exercises: assignments
          .filter((a) => a.row.sectionId === section.id)
          .map((a) => exerciseDto(a.row, a.exercise, media)),
      })),
    };
  });
}

type ClientExerciseInput = ExerciseInput & { id?: string };
const PRESCRIPTION_COLUMNS = [
  'sets',
  'reps',
  'totalReps',
  'durationSeconds',
  'restSeconds',
  'targetWeight',
  'weightUnit',
  'prescriptionText',
  'instructionsOverride',
  'executionType',
  'mediaAssetId',
] as const;

/** The complete prescription of a row (absent field = cleared), plus the Sprint 2 storage rules. */
function fullPrescription(input: ClientExerciseInput) {
  const values: PrescriptionInput & { repsMax: boolean } = { repsMax: input.repsMax ?? false };
  for (const key of PRESCRIPTION_COLUMNS) {
    (values as Record<string, unknown>)[key] = input[key] ?? null;
  }
  return { ...values, ...storagePrescription(values) };
}

/**
 * Replaces the content of ONE client day. Optimistic concurrency on the program's last change
 * (every structural mutation touches it): a stale `expectedVersion` → 409, nothing is written.
 * Existing rows are updated in place (stable ids for sessions and day status); the whole save is
 * one transaction (no partial result). Started/finished sessions keep their own snapshot.
 */
export async function updateClientWorkout(
  deps: TrainingDeps,
  actor: Principal,
  dayId: string,
  input: {
    expectedVersion: string;
    title: string;
    notes?: string | null;
    sections: (SectionInput<ClientExerciseInput> & { id?: string })[];
  },
): Promise<ClientWorkout> {
  const { programId } = await programOf(deps.db, actor, 'day', dayId);
  await mutate(deps, actor, programId, async (tx, program) => {
    if (program.updatedAt.toISOString() !== input.expectedVersion) {
      throw AppError.conflict(
        'Dieses Workout wurde inzwischen geändert. Bitte neu laden und die Änderungen erneut vornehmen.',
        [{ path: 'expectedVersion', message: 'Veraltete Version.' }],
      );
    }
    const currentSections = await tx.select().from(S).where(eq(S.dayId, dayId));
    const sectionIds = currentSections.map((s) => s.id);
    const currentAssignments = sectionIds.length
      ? await tx.select().from(A).where(inArray(A.sectionId, sectionIds))
      : [];
    const assignmentById = new Map(currentAssignments.map((a) => [a.id, a]));

    // Ids must belong to THIS day (no moving rows in from another client or day).
    const seenSections = new Set<string>();
    const seenAssignments = new Set<string>();
    input.sections.forEach((section, si) => {
      if (section.id && (!sectionIds.includes(section.id) || seenSections.has(section.id))) {
        throw AppError.validation([
          { path: `sections.${si}.id`, message: 'Unbekannter Abschnitt.' },
        ]);
      }
      if (section.id) seenSections.add(section.id);
      section.exercises.forEach((exercise, ei) => {
        if (exercise.id && (!assignmentById.has(exercise.id) || seenAssignments.has(exercise.id))) {
          throw AppError.validation([
            { path: `sections.${si}.exercises.${ei}.id`, message: 'Unbekannte Übung.' },
          ]);
        }
        if (exercise.id) seenAssignments.add(exercise.id);
      });
    });

    // Flag: no NEW extended type/MAX; an unchanged row created while the flag was on may stay.
    assertExtendedTypesAllowed(
      deps,
      flagRows(input.sections).filter((row) => {
        const current = row.id ? assignmentById.get(row.id) : undefined;
        return !(
          current &&
          current.executionType === (row.executionType ?? null) &&
          current.repsMax === (row.repsMax ?? false) &&
          usesExtendedTraining(current)
        );
      }),
    );
    await requireUsableExercises(
      tx,
      input.sections,
      new Set(currentAssignments.map((a) => a.exerciseId)),
    );

    // Two-phase ordering: move everything out of the way, then write the final positions.
    await tx
      .update(S)
      .set({ sortOrder: sql`${S.sortOrder} + ${OFFSET}` })
      .where(eq(S.dayId, dayId));
    if (sectionIds.length) {
      await tx
        .update(A)
        .set({ sortOrder: sql`${A.sortOrder} + ${OFFSET}` })
        .where(inArray(A.sectionId, sectionIds));
    }
    for (const [si, section] of input.sections.entries()) {
      let targetSectionId = section.id;
      if (targetSectionId) {
        await tx
          .update(S)
          .set({
            type: section.type,
            title: section.title ?? null,
            sortOrder: si,
            updatedAt: nowOf(deps),
          })
          .where(eq(S.id, targetSectionId));
      } else {
        const [inserted] = await tx
          .insert(S)
          .values({ dayId, type: section.type, title: section.title ?? null, sortOrder: si })
          .returning({ id: S.id });
        if (!inserted) throw new Error('insert returned nothing');
        targetSectionId = inserted.id;
      }
      for (const [ei, exercise] of section.exercises.entries()) {
        const values = {
          sectionId: targetSectionId,
          sortOrder: ei,
          exerciseId: exercise.exerciseId,
          ...fullPrescription(exercise),
        };
        if (exercise.id) {
          await tx
            .update(A)
            .set({ ...values, updatedAt: nowOf(deps) })
            .where(eq(A.id, exercise.id));
        } else {
          await tx.insert(A).values(values);
        }
      }
    }
    const removedAssignments = currentAssignments
      .map((a) => a.id)
      .filter((id) => !seenAssignments.has(id));
    if (removedAssignments.length) await tx.delete(A).where(inArray(A.id, removedAssignments));
    const removedSections = sectionIds.filter((id) => !seenSections.has(id));
    if (removedSections.length) await tx.delete(S).where(inArray(S.id, removedSections));
    await tx
      .update(D)
      .set({
        title: input.title,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: nowOf(deps),
      })
      .where(eq(D.id, dayId));
  });
  return getClientWorkout(deps, actor, dayId);
}

// ---------------------------------------------------------------------------------------------
// "Trainingswoche" — one calendar week of a client (canonical program + legacy list label)
// ---------------------------------------------------------------------------------------------

export async function clientWeek(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
  date: string | undefined,
): Promise<ClientTrainingWeek> {
  await requireClientInScope(deps.db, actor, clientId);
  const anchor = date ?? berlinToday(nowOf(deps));
  const weekStart = mondayOf(anchor);
  const calendar = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return snapshot(deps, async (tx) => {
    const [program] = await tx
      .select()
      .from(P)
      .where(and(eq(P.clientUserId, clientId), inArray(P.status, ['ACTIVE', 'DRAFT'])))
      .orderBy(sql`case when ${P.status} = 'ACTIVE' then 0 else 1 end`, desc(P.updatedAt))
      .limit(1);

    const [legacy] = await tx.select().from(CP).where(eq(CP.clientUserId, clientId)).limit(1);
    const [legacyCount] = await tx
      .select({ n: count() })
      .from(CPI)
      .where(eq(CPI.clientUserId, clientId));
    const itemCount = Number(legacyCount?.n ?? 0);
    const legacyPlan =
      legacy || itemCount > 0
        ? {
            itemCount,
            startsOn: legacy?.startsOn ?? null,
            endsOn: legacy?.endsOn ?? null,
            updatedAt: legacy?.updatedAt.toISOString() ?? null,
          }
        : null;

    const empty: ClientTrainingWeek = {
      clientId,
      weekStart,
      weekEnd: addDays(weekStart, 6),
      program: program
        ? {
            id: program.id,
            title: program.title,
            status: program.status,
            startsOn: program.startsOn,
            endsOn: program.endsOn,
          }
        : null,
      weekIndex: null,
      weekId: null,
      days: calendar.map((d) => ({ date: d, weekday: isoWeekday(d), workouts: [] })),
      unscheduled: [],
      legacyPlan,
      stats: weekStats([]),
    };
    if (!program?.startsOn) return empty;
    const startsOn = program.startsOn;

    const weeks = await tx
      .select()
      .from(W)
      .where(eq(W.programId, program.id))
      .orderBy(asc(W.sortOrder));
    const days = weeks.length
      ? await tx
          .select()
          .from(D)
          .where(
            inArray(
              D.weekId,
              weeks.map((w) => w.id),
            ),
          )
          .orderBy(asc(D.sortOrder))
      : [];
    const dayIds = days.map((d) => d.id);
    const stats = dayIds.length
      ? await tx
          .select({ dayId: S.dayId, executionType: A.executionType, n: count() })
          .from(A)
          .innerJoin(S, eq(S.id, A.sectionId))
          .where(inArray(S.dayId, dayIds))
          .groupBy(S.dayId, A.executionType)
      : [];
    const sessions = dayIds.length
      ? await tx
          .select({ dayId: WS.trainingDayId, status: WS.status })
          .from(WS)
          .where(and(eq(WS.trainingProgramId, program.id), eq(WS.clientUserId, clientId)))
      : [];

    const toWorkout = (day: (typeof days)[number]): WeekWorkout => {
      const own = stats.filter((s) => s.dayId === day.id);
      return {
        dayId: day.id,
        title: day.title,
        scheduledWeekday: day.scheduledWeekday,
        sourceTemplateId: day.sourceTemplateId,
        sourceTemplateVersion: day.sourceTemplateVersion,
        exerciseCount: own.reduce((sum, s) => sum + Number(s.n), 0),
        executionTypes: sortTypes(
          own.map((s) => s.executionType).filter((t): t is TrainingExecutionType => t !== null),
        ),
        workoutStatus: workoutDayStatus(sessions.filter((s) => s.dayId === day.id)),
      };
    };
    const weekAt = (iso: string) => {
      const offset = daysBetween(startsOn, iso);
      if (offset < 0 || (program.endsOn && iso > program.endsOn)) return undefined;
      return weeks[Math.floor(offset / 7)];
    };
    const anchorWeek = weekAt(anchor);
    const weekDays = calendar.map((iso) => {
      const week = weekAt(iso);
      const weekday = isoWeekday(iso);
      return {
        date: iso,
        weekday,
        workouts: week
          ? days
              .filter((d) => d.weekId === week.id && d.scheduledWeekday === weekday)
              .map(toWorkout)
          : [],
      };
    });
    return {
      ...empty,
      weekIndex: anchorWeek ? anchorWeek.sortOrder : null,
      weekId: anchorWeek?.id ?? null,
      days: weekDays,
      // Sprint 7: the app's week counts (dated workouts only), one rule for coach and client
      stats: weekStats(weekDays.flatMap((d) => d.workouts)),
      unscheduled: anchorWeek
        ? days
            .filter((d) => d.weekId === anchorWeek.id && d.scheduledWeekday === null)
            .map(toWorkout)
        : [],
    };
  });
}
