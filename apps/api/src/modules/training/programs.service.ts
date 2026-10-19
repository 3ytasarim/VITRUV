import type {
  AdminAssignment,
  AdminProgram,
  AdminProgramSummary,
  ClientActiveTrainingResponse,
  ClientTrainingProgram,
  ResolvedMedia,
} from '@vitruv/contracts';
import { prescriptionIssues } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import type { TrainingSectionType } from '@vitruv/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError, pgErrorCode } from '../../lib/errors';
import { recordEvent } from '../auth/auth.service';
import { clientAccessible } from '../management/management.service';
import type { TrainingDeps } from './exercises.service';
import { nextPosition, normalize, placeAfter, reorder, type Level } from './ordering';

/**
 * Client training programs (Sprint 6, docs/TRAINING-ARCHITECTURE.md).
 *
 * OBJECT SCOPE: every lookup — program, week, day, section, assignment — joins up to the
 * program's client and applies clientAccessible() in SQL (ADMIN: all clients; COACH: only clients
 * actively assigned to them). Anything outside the scope is the same generic 404 as a missing id,
 * so nested ids can not be probed. Mutations lock the program row (FOR UPDATE) and run in one
 * transaction; the response is always the complete, re-read program tree.
 */
const {
  trainingPrograms: P,
  trainingWeeks: W,
  trainingDays: D,
  trainingSections: S,
  trainingExerciseAssignments: A,
  exercises: E,
  mediaAssets: M,
  users,
} = schema;

type ProgramRow = typeof P.$inferSelect;
const PG_CHECK_VIOLATION = '23514';
const notFound = () => AppError.notFound('Not found.');
const nowOf = (deps: Pick<TrainingDeps, 'now'>) => deps.now?.() ?? new Date();
const DEFAULT_SECTIONS: TrainingSectionType[] = ['WARMUP', 'MAIN', 'FINISHER'];

// ---------------------------------------------------------------------------------------------
// Scoped lookups
// ---------------------------------------------------------------------------------------------

async function scopedProgram(db: DbExecutor, actor: Principal, programId: string, lock = false) {
  const query = db
    .select()
    .from(P)
    .where(and(eq(P.id, programId), clientAccessible(actor, P.clientUserId)))
    .limit(1);
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw notFound();
  return row;
}

/** Resolves a nested id to its program — through the scope — and returns the owning program id. */
async function programOf(db: DbExecutor, actor: Principal, level: Level, id: string) {
  const scope = clientAccessible(actor, P.clientUserId);
  let rows: { programId: string; parentId: string }[];
  if (level === 'week') {
    rows = await db
      .select({ programId: P.id, parentId: P.id })
      .from(W)
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(W.id, id), scope))
      .limit(1);
  } else if (level === 'day') {
    rows = await db
      .select({ programId: P.id, parentId: W.id })
      .from(D)
      .innerJoin(W, eq(W.id, D.weekId))
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(D.id, id), scope))
      .limit(1);
  } else if (level === 'section') {
    rows = await db
      .select({ programId: P.id, parentId: D.id })
      .from(S)
      .innerJoin(D, eq(D.id, S.dayId))
      .innerJoin(W, eq(W.id, D.weekId))
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(S.id, id), scope))
      .limit(1);
  } else {
    rows = await db
      .select({ programId: P.id, parentId: S.id })
      .from(A)
      .innerJoin(S, eq(S.id, A.sectionId))
      .innerJoin(D, eq(D.id, S.dayId))
      .innerJoin(W, eq(W.id, D.weekId))
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(A.id, id), scope))
      .limit(1);
  }
  const [row] = rows;
  if (!row) throw notFound();
  return row;
}

function assertEditable(program: ProgramRow) {
  if (program.status !== 'DRAFT' && program.status !== 'ACTIVE') {
    throw AppError.conflict('Abgeschlossene oder archivierte Pläne sind schreibgeschützt.');
  }
}

/**
 * Runs a structural change: program row locked, editability checked, changes applied, program
 * `updated_at` touched — all in one transaction. Returns the fresh tree.
 */
async function mutate(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
  change: (tx: DbExecutor, program: ProgramRow) => Promise<void>,
): Promise<AdminProgram> {
  try {
    await deps.db.transaction(async (tx) => {
      const program = await scopedProgram(tx, actor, programId, true);
      assertEditable(program);
      await change(tx, program);
      await tx
        .update(P)
        .set({ updatedAt: nowOf(deps) })
        .where(eq(P.id, programId));
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_CHECK_VIOLATION) {
      throw AppError.validation([{ path: 'form', message: 'Ungültige Werte.' }]);
    }
    throw error;
  }
  return getProgram(deps, actor, programId);
}

// ---------------------------------------------------------------------------------------------
// Tree loading + DTOs
// ---------------------------------------------------------------------------------------------

async function loadTree(db: DbExecutor, programId: string) {
  const weeks = await db
    .select()
    .from(W)
    .where(eq(W.programId, programId))
    .orderBy(asc(W.sortOrder));
  const weekIds = weeks.map((w) => w.id);
  const days = weekIds.length
    ? await db.select().from(D).where(inArray(D.weekId, weekIds)).orderBy(asc(D.sortOrder))
    : [];
  const dayIds = days.map((d) => d.id);
  const sections = dayIds.length
    ? await db.select().from(S).where(inArray(S.dayId, dayIds)).orderBy(asc(S.sortOrder))
    : [];
  const sectionIds = sections.map((s) => s.id);
  const assignments = sectionIds.length
    ? await db
        .select({ assignment: A, exercise: E })
        .from(A)
        .innerJoin(E, eq(E.id, A.exerciseId))
        .where(inArray(A.sectionId, sectionIds))
        .orderBy(asc(A.sortOrder))
    : [];
  return { weeks, days, sections, assignments };
}

type Tree = Awaited<ReturnType<typeof loadTree>>;
const byParent = <T, K extends keyof T>(rows: T[], key: K) => {
  const map = new Map<T[K], T[]>();
  for (const row of rows) map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  return map;
};

function toAdminAssignment(row: Tree['assignments'][number]): AdminAssignment {
  const { assignment: a, exercise: e } = row;
  return {
    id: a.id,
    order: a.sortOrder,
    exercise: { id: e.id, name: e.name, active: e.active, hasMedia: Boolean(e.mediaAssetId) },
    sets: a.sets,
    reps: a.reps,
    totalReps: a.totalReps,
    durationSeconds: a.durationSeconds,
    restSeconds: a.restSeconds,
    targetWeight: a.targetWeight,
    weightUnit: a.weightUnit,
    prescriptionText: a.prescriptionText,
    instructionsOverride: a.instructionsOverride,
  };
}

function summary(
  program: ProgramRow,
  tree: Pick<Tree, 'weeks' | 'assignments'>,
): AdminProgramSummary {
  return {
    id: program.id,
    clientId: program.clientUserId,
    title: program.title,
    status: program.status,
    startsOn: program.startsOn,
    endsOn: program.endsOn,
    activatedAt: program.activatedAt?.toISOString() ?? null,
    retiredAt: program.retiredAt?.toISOString() ?? null,
    weekCount: tree.weeks.length,
    assignmentCount: tree.assignments.length,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  };
}

function toAdminProgram(program: ProgramRow, tree: Tree): AdminProgram {
  const daysByWeek = byParent(tree.days, 'weekId');
  const sectionsByDay = byParent(tree.sections, 'dayId');
  const assignmentsBySection = new Map<string, Tree['assignments']>();
  for (const row of tree.assignments) {
    const list = assignmentsBySection.get(row.assignment.sectionId) ?? [];
    list.push(row);
    assignmentsBySection.set(row.assignment.sectionId, list);
  }
  return {
    ...summary(program, tree),
    description: program.description,
    weeks: tree.weeks.map((week) => ({
      id: week.id,
      order: week.sortOrder,
      title: week.title,
      notes: week.notes,
      days: (daysByWeek.get(week.id) ?? []).map((day) => ({
        id: day.id,
        order: day.sortOrder,
        title: day.title,
        notes: day.notes,
        scheduledWeekday: day.scheduledWeekday,
        sections: (sectionsByDay.get(day.id) ?? []).map((section) => ({
          id: section.id,
          order: section.sortOrder,
          type: section.type,
          title: section.title,
          assignments: (assignmentsBySection.get(section.id) ?? []).map(toAdminAssignment),
        })),
      })),
    })),
  };
}

/** Today's date in Europe/Berlin as YYYY-MM-DD. */
const berlinToday = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now);

/**
 * The client-facing shape (also the coach preview). Media: only PUBLIC training assets, resolved
 * to delivery URLs — never storage keys. No author ids, no internal notes of other domains.
 */
async function toClientProgram(
  deps: TrainingDeps,
  db: DbExecutor,
  program: ProgramRow,
  tree: Tree,
): Promise<ClientTrainingProgram> {
  const mediaIds = [
    ...new Set(
      tree.assignments
        .map((row) => row.exercise.mediaAssetId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const assets = mediaIds.length
    ? await db
        .select()
        .from(M)
        .where(
          and(inArray(M.id, mediaIds), eq(M.visibility, 'PUBLIC'), eq(M.purpose, 'TRAINING_VIDEO')),
        )
    : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const media = (exercise: Tree['assignments'][number]['exercise']): ResolvedMedia | null => {
    const asset = exercise.mediaAssetId ? assetById.get(exercise.mediaAssetId) : undefined;
    if (!asset || (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO')) return null;
    return {
      assetId: asset.id,
      kind: asset.kind,
      url: deps.urls.publicUrl(asset.storageKey),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      altText: asset.altText ?? exercise.name,
    };
  };

  const admin = toAdminProgram(program, tree);
  const assignmentRows = new Map(tree.assignments.map((row) => [row.assignment.id, row]));
  let currentWeekId: string | null = null;
  if (program.startsOn && admin.weeks.length > 0) {
    const days = Math.floor(
      (Date.parse(berlinToday(nowOf(deps))) - Date.parse(program.startsOn)) / 86_400_000,
    );
    if (days >= 0) currentWeekId = admin.weeks[Math.floor(days / 7)]?.id ?? null;
  }
  return {
    id: program.id,
    title: program.title,
    description: program.description,
    startsOn: program.startsOn,
    endsOn: program.endsOn,
    currentWeekId,
    weeks: admin.weeks.map((week) => ({
      id: week.id,
      order: week.order,
      title: week.title,
      notes: week.notes,
      days: week.days.map((day) => ({
        id: day.id,
        order: day.order,
        title: day.title,
        notes: day.notes,
        scheduledWeekday: day.scheduledWeekday,
        sections: day.sections.map((section) => ({
          id: section.id,
          order: section.order,
          type: section.type,
          title: section.title,
          exercises: section.assignments.map((a) => {
            const row = assignmentRows.get(a.id);
            const exercise = row?.exercise;
            return {
              assignmentId: a.id,
              exerciseId: a.exercise.id,
              order: a.order,
              name: a.exercise.name,
              description: exercise?.description ?? null,
              media: exercise ? media(exercise) : null,
              sets: a.sets,
              reps: a.reps,
              totalReps: a.totalReps,
              durationSeconds: a.durationSeconds,
              restSeconds: a.restSeconds,
              targetWeight: a.targetWeight,
              weightUnit: a.weightUnit,
              prescriptionText: a.prescriptionText,
              instructions: a.instructionsOverride ?? exercise?.description ?? null,
            };
          }),
        })),
      })),
    })),
  };
}

/** Consistent snapshot for multi-query reads (never a half-applied change). */
const snapshot = <T>(deps: TrainingDeps, read: (tx: DbExecutor) => Promise<T>) =>
  deps.db.transaction(read, { isolationLevel: 'repeatable read', accessMode: 'read only' });

// ---------------------------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------------------------

async function requireClientInScope(db: DbExecutor, actor: Principal, clientId: string) {
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, clientId), clientAccessible(actor, users.id)))
    .limit(1);
  if (!client) throw notFound();
}

export async function listPrograms(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
): Promise<{ items: AdminProgramSummary[] }> {
  await requireClientInScope(deps.db, actor, clientId);
  const rows = await deps.db
    .select({
      program: P,
      weekCount:
        sql<number>`(select count(*) from training_weeks w where w.program_id = training_programs.id)`.mapWith(
          Number,
        ),
      assignmentCount:
        sql<number>`(select count(*) from training_exercise_assignments a join training_sections s on s.id = a.section_id join training_days d on d.id = s.day_id join training_weeks w on w.id = d.week_id where w.program_id = training_programs.id)`.mapWith(
          Number,
        ),
    })
    .from(P)
    .where(eq(P.clientUserId, clientId))
    .orderBy(desc(P.createdAt));
  return {
    items: rows.map((row) => ({
      ...summary(row.program, { weeks: [], assignments: [] }),
      weekCount: row.weekCount,
      assignmentCount: row.assignmentCount,
    })),
  };
}

export async function getProgram(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
): Promise<AdminProgram> {
  return snapshot(deps, async (tx) => {
    const program = await scopedProgram(tx, actor, programId);
    return toAdminProgram(program, await loadTree(tx, programId));
  });
}

/** Coach/Admin preview: exactly what the client would receive (any status). */
export async function previewProgram(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
): Promise<ClientTrainingProgram> {
  return snapshot(deps, async (tx) => {
    const program = await scopedProgram(tx, actor, programId);
    return toClientProgram(deps, tx, program, await loadTree(tx, programId));
  });
}

export async function createProgram(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
  input: {
    title: string;
    description?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
  },
): Promise<AdminProgram> {
  await requireClientInScope(deps.db, actor, clientId);
  assertPeriod(input.startsOn ?? null, input.endsOn ?? null);
  const id = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(P)
      .values({
        clientUserId: clientId,
        title: input.title,
        description: input.description ?? null,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        createdByUserId: actor.userId,
      })
      .returning({ id: P.id });
    if (!row) throw new Error('insert returned nothing');
    await recordEvent(tx, 'PROGRAM_CREATED', {
      userId: clientId,
      actorUserId: actor.userId,
      entityId: row.id,
    });
    return row.id;
  });
  deps.logger.info(
    { event: 'program_created', programId: id, actorUserId: actor.userId },
    'training program created',
  );
  return getProgram(deps, actor, id);
}

function assertPeriod(startsOn: string | null, endsOn: string | null) {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw AppError.validation([
      { path: 'endsOn', message: 'Das Ende darf nicht vor dem Start liegen.' },
    ]);
  }
}

export async function updateProgram(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
  input: {
    title?: string;
    description?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
  },
): Promise<AdminProgram> {
  return mutate(deps, actor, programId, async (tx, program) => {
    assertPeriod(
      input.startsOn !== undefined ? input.startsOn : program.startsOn,
      input.endsOn !== undefined ? input.endsOn : program.endsOn,
    );
    await tx
      .update(P)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
      })
      .where(eq(P.id, programId));
  });
}

/** Only DRAFT programs can be deleted (with their structure). Others are completed/archived. */
export async function deleteProgram(deps: TrainingDeps, actor: Principal, programId: string) {
  await deps.db.transaction(async (tx) => {
    const program = await scopedProgram(tx, actor, programId, true);
    if (program.status !== 'DRAFT') {
      throw AppError.conflict(
        'Nur Entwürfe können gelöscht werden. Aktive Pläne werden abgeschlossen oder archiviert.',
      );
    }
    await tx.delete(P).where(eq(P.id, programId));
  });
}

async function structureCounts(db: DbExecutor, programId: string) {
  const [counts] = await db
    .select({
      weeks:
        sql<number>`(select count(*) from training_weeks w where w.program_id = ${programId})`.mapWith(
          Number,
        ),
      days: sql<number>`(select count(*) from training_days d join training_weeks w on w.id = d.week_id where w.program_id = ${programId})`.mapWith(
        Number,
      ),
      assignments:
        sql<number>`(select count(*) from training_exercise_assignments a join training_sections s on s.id = a.section_id join training_days d on d.id = s.day_id join training_weeks w on w.id = d.week_id where w.program_id = ${programId})`.mapWith(
          Number,
        ),
    })
    .from(sql`(select 1) as one`);
  return counts ?? { weeks: 0, days: 0, assignments: 0 };
}

/**
 * DRAFT → ACTIVE. Validates the structure (title, ≥1 week, ≥1 day, ≥1 exercise) and, in ONE
 * transaction serialised per client, retires the client's current ACTIVE program to ARCHIVED
 * (replaced, not finished — COMPLETED is reserved for a deliberate "done") before activating.
 * The partial unique index guarantees there can never be two ACTIVE programs.
 */
export async function activateProgram(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
): Promise<{ program: AdminProgram; retiredProgramId: string | null }> {
  const now = nowOf(deps);
  const retiredProgramId = await deps.db.transaction(async (tx) => {
    const program = await scopedProgram(tx, actor, programId, true);
    if (program.status !== 'DRAFT') {
      throw AppError.conflict('Nur Entwürfe können aktiviert werden.');
    }
    const counts = await structureCounts(tx, programId);
    const problems: { path: string; message: string }[] = [];
    if (counts.weeks === 0)
      problems.push({ path: 'weeks', message: 'Mindestens eine Woche anlegen.' });
    if (counts.days === 0)
      problems.push({ path: 'days', message: 'Mindestens einen Trainingstag anlegen.' });
    if (counts.assignments === 0) {
      problems.push({ path: 'assignments', message: 'Mindestens eine Übung zuweisen.' });
    }
    if (problems.length > 0)
      throw AppError.validation(problems, 'Der Plan ist noch nicht vollständig.');

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`vitruv.training.active:${program.clientUserId}`}))`,
    );
    const retired = await tx
      .update(P)
      .set({ status: 'ARCHIVED', retiredAt: now })
      .where(and(eq(P.clientUserId, program.clientUserId), eq(P.status, 'ACTIVE')))
      .returning({ id: P.id });
    for (const row of retired) {
      await recordEvent(tx, 'PROGRAM_ARCHIVED', {
        userId: program.clientUserId,
        actorUserId: actor.userId,
        entityId: row.id,
      });
    }
    await tx
      .update(P)
      .set({ status: 'ACTIVE', activatedAt: now, retiredAt: null })
      .where(eq(P.id, programId));
    await recordEvent(tx, 'PROGRAM_ACTIVATED', {
      userId: program.clientUserId,
      actorUserId: actor.userId,
      entityId: programId,
    });
    return retired[0]?.id ?? null;
  });
  deps.logger.info(
    { event: 'program_activated', programId, retiredProgramId, actorUserId: actor.userId },
    'training program activated',
  );
  return { program: await getProgram(deps, actor, programId), retiredProgramId };
}

/** ACTIVE → COMPLETED (deliberately finished) or DRAFT/ACTIVE/COMPLETED → ARCHIVED. */
export async function retireProgram(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
  target: 'COMPLETED' | 'ARCHIVED',
): Promise<AdminProgram> {
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    const program = await scopedProgram(tx, actor, programId, true);
    const allowed =
      target === 'COMPLETED' ? program.status === 'ACTIVE' : program.status !== 'ARCHIVED';
    if (!allowed) {
      throw AppError.conflict(
        target === 'COMPLETED'
          ? 'Nur der aktive Plan kann abgeschlossen werden.'
          : 'Der Plan ist bereits archiviert.',
      );
    }
    await tx
      .update(P)
      .set({ status: target, retiredAt: program.status === 'DRAFT' ? null : now })
      .where(eq(P.id, programId));
    await recordEvent(tx, target === 'COMPLETED' ? 'PROGRAM_COMPLETED' : 'PROGRAM_ARCHIVED', {
      userId: program.clientUserId,
      actorUserId: actor.userId,
      entityId: programId,
    });
  });
  return getProgram(deps, actor, programId);
}

// ---------------------------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------------------------

export function addWeek(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
  input: { title?: string | null; notes?: string | null },
) {
  return mutate(deps, actor, programId, async (tx) => {
    await tx.insert(W).values({
      programId,
      sortOrder: await nextPosition(tx, 'week', programId),
      title: input.title ?? null,
      notes: input.notes ?? null,
    });
  });
}

export async function updateWeek(
  deps: TrainingDeps,
  actor: Principal,
  weekId: string,
  input: { title?: string | null; notes?: string | null },
) {
  const { programId } = await programOf(deps.db, actor, 'week', weekId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx
      .update(W)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(and(eq(W.id, weekId), eq(W.programId, programId)));
  });
}

export async function deleteWeek(deps: TrainingDeps, actor: Principal, weekId: string) {
  const { programId } = await programOf(deps.db, actor, 'week', weekId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.delete(W).where(and(eq(W.id, weekId), eq(W.programId, programId)));
    await normalize(tx, 'week', programId);
  });
}

export function reorderWeeks(
  deps: TrainingDeps,
  actor: Principal,
  programId: string,
  ids: string[],
) {
  return mutate(deps, actor, programId, (tx) => reorder(tx, 'week', programId, ids));
}

async function copyDay(
  tx: DbExecutor,
  source: typeof D.$inferSelect,
  weekId: string,
  sortOrder: number,
  title: string,
): Promise<string> {
  const [day] = await tx
    .insert(D)
    .values({
      weekId,
      sortOrder,
      title,
      notes: source.notes,
      scheduledWeekday: source.scheduledWeekday,
    })
    .returning({ id: D.id });
  if (!day) throw new Error('copy failed');
  const sections = await tx
    .select()
    .from(S)
    .where(eq(S.dayId, source.id))
    .orderBy(asc(S.sortOrder));
  for (const section of sections) {
    const [copy] = await tx
      .insert(S)
      .values({
        dayId: day.id,
        type: section.type,
        title: section.title,
        sortOrder: section.sortOrder,
      })
      .returning({ id: S.id });
    if (!copy) throw new Error('copy failed');
    const assignments = await tx
      .select()
      .from(A)
      .where(eq(A.sectionId, section.id))
      .orderBy(asc(A.sortOrder));
    if (assignments.length > 0) {
      await tx.insert(A).values(
        assignments.map(({ id: _id, createdAt: _c, updatedAt: _u, sectionId: _s, ...rest }) => ({
          ...rest,
          sectionId: copy.id,
        })),
      );
    }
  }
  return day.id;
}

/** Copies a week with all days, sections and assignments (new ids) right after the original. */
export async function duplicateWeek(deps: TrainingDeps, actor: Principal, weekId: string) {
  const { programId } = await programOf(deps.db, actor, 'week', weekId);
  return mutate(deps, actor, programId, async (tx) => {
    const [source] = await tx.select().from(W).where(eq(W.id, weekId));
    if (!source) throw notFound();
    const [week] = await tx
      .insert(W)
      .values({
        programId,
        sortOrder: await nextPosition(tx, 'week', programId),
        title: source.title,
        notes: source.notes,
      })
      .returning({ id: W.id });
    if (!week) throw new Error('copy failed');
    const days = await tx.select().from(D).where(eq(D.weekId, weekId)).orderBy(asc(D.sortOrder));
    for (const day of days) await copyDay(tx, day, week.id, day.sortOrder, day.title);
    await placeAfter(tx, 'week', programId, weekId, week.id);
  });
}

// ---------------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------------

export async function addDay(
  deps: TrainingDeps,
  actor: Principal,
  weekId: string,
  input: {
    title: string;
    notes?: string | null;
    scheduledWeekday?: number | null;
    withDefaultSections: boolean;
  },
) {
  const { programId } = await programOf(deps.db, actor, 'week', weekId);
  return mutate(deps, actor, programId, async (tx) => {
    const [day] = await tx
      .insert(D)
      .values({
        weekId,
        sortOrder: await nextPosition(tx, 'day', weekId),
        title: input.title,
        notes: input.notes ?? null,
        scheduledWeekday: input.scheduledWeekday ?? null,
      })
      .returning({ id: D.id });
    if (!day) throw new Error('insert failed');
    if (input.withDefaultSections) {
      await tx
        .insert(S)
        .values(DEFAULT_SECTIONS.map((type, index) => ({ dayId: day.id, type, sortOrder: index })));
    }
  });
}

export async function updateDay(
  deps: TrainingDeps,
  actor: Principal,
  dayId: string,
  input: { title?: string; notes?: string | null; scheduledWeekday?: number | null },
) {
  const { programId, parentId } = await programOf(deps.db, actor, 'day', dayId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx
      .update(D)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.scheduledWeekday !== undefined
          ? { scheduledWeekday: input.scheduledWeekday }
          : {}),
      })
      .where(and(eq(D.id, dayId), eq(D.weekId, parentId)));
  });
}

export async function deleteDay(deps: TrainingDeps, actor: Principal, dayId: string) {
  const { programId, parentId } = await programOf(deps.db, actor, 'day', dayId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.delete(D).where(and(eq(D.id, dayId), eq(D.weekId, parentId)));
    await normalize(tx, 'day', parentId);
  });
}

export async function reorderDays(
  deps: TrainingDeps,
  actor: Principal,
  weekId: string,
  ids: string[],
) {
  const { programId } = await programOf(deps.db, actor, 'week', weekId);
  return mutate(deps, actor, programId, (tx) => reorder(tx, 'day', weekId, ids));
}

export async function duplicateDay(deps: TrainingDeps, actor: Principal, dayId: string) {
  const { programId, parentId } = await programOf(deps.db, actor, 'day', dayId);
  return mutate(deps, actor, programId, async (tx) => {
    const [source] = await tx.select().from(D).where(eq(D.id, dayId));
    if (!source) throw notFound();
    const title = `${source.title} (Kopie)`.slice(0, 120);
    const copyId = await copyDay(
      tx,
      source,
      parentId,
      await nextPosition(tx, 'day', parentId),
      title,
    );
    await placeAfter(tx, 'day', parentId, dayId, copyId);
  });
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

export async function addSection(
  deps: TrainingDeps,
  actor: Principal,
  dayId: string,
  input: { type: TrainingSectionType; title?: string | null },
) {
  const { programId } = await programOf(deps.db, actor, 'day', dayId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.insert(S).values({
      dayId,
      type: input.type,
      title: input.title ?? null,
      sortOrder: await nextPosition(tx, 'section', dayId),
    });
  });
}

export async function updateSection(
  deps: TrainingDeps,
  actor: Principal,
  sectionId: string,
  input: { type?: TrainingSectionType; title?: string | null },
) {
  const { programId, parentId } = await programOf(deps.db, actor, 'section', sectionId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx
      .update(S)
      .set({
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      })
      .where(and(eq(S.id, sectionId), eq(S.dayId, parentId)));
  });
}

/** Deletes a section with its assignments (cascade) in one transaction. */
export async function deleteSection(deps: TrainingDeps, actor: Principal, sectionId: string) {
  const { programId, parentId } = await programOf(deps.db, actor, 'section', sectionId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.delete(S).where(and(eq(S.id, sectionId), eq(S.dayId, parentId)));
    await normalize(tx, 'section', parentId);
  });
}

export async function reorderSections(
  deps: TrainingDeps,
  actor: Principal,
  dayId: string,
  ids: string[],
) {
  const { programId } = await programOf(deps.db, actor, 'day', dayId);
  return mutate(deps, actor, programId, (tx) => reorder(tx, 'section', dayId, ids));
}

// ---------------------------------------------------------------------------------------------
// Exercise assignments
// ---------------------------------------------------------------------------------------------

type PrescriptionInput = {
  sets?: number | null;
  reps?: number | null;
  totalReps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  targetWeight?: number | null;
  weightUnit?: 'KG' | null;
  prescriptionText?: string | null;
  instructionsOverride?: string | null;
};
const PRESCRIPTION_KEYS = [
  'sets',
  'reps',
  'totalReps',
  'durationSeconds',
  'restSeconds',
  'targetWeight',
  'weightUnit',
  'prescriptionText',
  'instructionsOverride',
] as const;

/** Only ACTIVE exercises can be newly assigned (inactive ones stay valid where already used). */
async function requireAssignableExercise(db: DbExecutor, exerciseId: string) {
  const [exercise] = await db
    .select({ id: E.id })
    .from(E)
    .where(and(eq(E.id, exerciseId), eq(E.active, true)))
    .limit(1);
  if (!exercise) {
    throw AppError.validation([
      { path: 'exerciseId', message: 'Diese Übung ist nicht (mehr) verfügbar.' },
    ]);
  }
}

const pickPrescription = (input: PrescriptionInput) =>
  Object.fromEntries(
    PRESCRIPTION_KEYS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
  ) as PrescriptionInput;

export async function addAssignment(
  deps: TrainingDeps,
  actor: Principal,
  sectionId: string,
  input: { exerciseId: string } & PrescriptionInput,
) {
  const { programId } = await programOf(deps.db, actor, 'section', sectionId);
  await requireAssignableExercise(deps.db, input.exerciseId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.insert(A).values({
      sectionId,
      exerciseId: input.exerciseId,
      sortOrder: await nextPosition(tx, 'assignment', sectionId),
      ...pickPrescription(input),
    });
  });
}

export async function updateAssignment(
  deps: TrainingDeps,
  actor: Principal,
  assignmentId: string,
  input: { exerciseId?: string } & PrescriptionInput,
) {
  const { programId, parentId } = await programOf(deps.db, actor, 'assignment', assignmentId);
  return mutate(deps, actor, programId, async (tx) => {
    const [current] = await tx.select().from(A).where(eq(A.id, assignmentId));
    if (!current) throw notFound();
    if (input.exerciseId && input.exerciseId !== current.exerciseId) {
      await requireAssignableExercise(tx, input.exerciseId);
    }
    const patch = pickPrescription(input);
    const merged = { ...current, ...patch };
    const issues = prescriptionIssues(merged);
    if (issues.length > 0) throw AppError.validation(issues);
    await tx
      .update(A)
      .set({ ...(input.exerciseId ? { exerciseId: input.exerciseId } : {}), ...patch })
      .where(and(eq(A.id, assignmentId), eq(A.sectionId, parentId)));
  });
}

export async function deleteAssignment(deps: TrainingDeps, actor: Principal, assignmentId: string) {
  const { programId, parentId } = await programOf(deps.db, actor, 'assignment', assignmentId);
  return mutate(deps, actor, programId, async (tx) => {
    await tx.delete(A).where(and(eq(A.id, assignmentId), eq(A.sectionId, parentId)));
    await normalize(tx, 'assignment', parentId);
  });
}

export async function reorderAssignments(
  deps: TrainingDeps,
  actor: Principal,
  sectionId: string,
  ids: string[],
) {
  const { programId } = await programOf(deps.db, actor, 'section', sectionId);
  return mutate(deps, actor, programId, (tx) => reorder(tx, 'assignment', sectionId, ids));
}

// ---------------------------------------------------------------------------------------------
// Client self read (future Flutter)
// ---------------------------------------------------------------------------------------------

/**
 * The signed-in CLIENT's ACTIVE program — identity from the session only (no client id input).
 * DRAFT, COMPLETED and ARCHIVED programs are never returned. `program: null` when none.
 */
export async function clientActiveProgram(
  deps: TrainingDeps,
  actor: Principal,
): Promise<ClientActiveTrainingResponse> {
  return snapshot(deps, async (tx) => {
    const [client] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, actor.userId), eq(users.role, 'CLIENT')))
      .limit(1);
    if (!client) throw AppError.notFound('No client account.');
    const [program] = await tx
      .select()
      .from(P)
      .where(and(eq(P.clientUserId, actor.userId), eq(P.status, 'ACTIVE')))
      .limit(1);
    if (!program) return { program: null };
    return { program: await toClientProgram(deps, tx, program, await loadTree(tx, program.id)) };
  });
}
