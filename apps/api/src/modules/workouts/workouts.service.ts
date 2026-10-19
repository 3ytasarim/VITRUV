import type {
  CurrentWorkoutResponse,
  FinishWorkoutResponse,
  ResolvedMedia,
  StartWorkoutResponse,
  UpdateWorkoutExerciseRequest,
  UpdateWorkoutNoteRequest,
  UpdateWorkoutSetRequest,
  WorkoutExecutionUpdateResponse,
  WorkoutNoteResponse,
  WorkoutProgress,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSessionSummary,
  WorkoutSessionSummaryList,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import type { WorkoutExerciseStatus } from '@vitruv/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError } from '../../lib/errors';
import { clientAccessible } from '../management/management.service';
import type { TrainingDeps } from '../training/exercises.service';

/**
 * Workout sessions (Sprint 7, docs/WORKOUT-ARCHITECTURE.md).
 *
 * SELF CONTEXT: every client query is `client_user_id = principal.userId` — client endpoints take
 * no client id, and a session/exercise/set id of somebody else is the same 404 as a missing id.
 * SNAPSHOT: a session's targets are copied from the live plan once, at start (one INSERT … SELECT
 * statement, so the copy is consistent even while a coach edits the plan). Reads never join the
 * live plan for targets — only the exercise for its current demonstration media.
 * Coach/Admin get read-only summaries through the same client scope as training programs.
 */
const {
  workoutSessions: WS,
  workoutSessionExercises: WE,
  workoutExerciseSets: WSET,
  trainingPrograms: P,
  trainingWeeks: W,
  trainingDays: D,
  trainingSections: S,
  trainingExerciseAssignments: A,
  exercises: E,
  mediaAssets: M,
  users,
} = schema;

type SessionRow = typeof WS.$inferSelect;
type ExerciseRow = typeof WE.$inferSelect;
type SetRow = typeof WSET.$inferSelect;

const notFound = () => AppError.notFound('Not found.');
const nowOf = (deps: Pick<TrainingDeps, 'now'>) => deps.now?.() ?? new Date();
/** The single row of an INSERT/UPDATE … RETURNING that must exist. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error('write returned nothing');
  return row;
}
const iso = (value: Date | null) => (value ? value.toISOString() : null);
const snapshotRead = <T>(deps: TrainingDeps, read: (tx: DbExecutor) => Promise<T>) =>
  deps.db.transaction(read, { isolationLevel: 'repeatable read', accessMode: 'read only' });

// ---------------------------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------------------------

function durationOf(session: SessionRow): number | null {
  const end = session.completedAt ?? session.abandonedAt;
  return end ? Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000)) : null;
}

function header(session: SessionRow) {
  return {
    id: session.id,
    status: session.status,
    programTitle: session.programTitleSnapshot,
    dayTitle: session.dayTitleSnapshot,
    weekOrder: session.weekOrderSnapshot,
    dayOrder: session.dayOrderSnapshot,
    startedAt: session.startedAt.toISOString(),
    completedAt: iso(session.completedAt),
    abandonedAt: iso(session.abandonedAt),
    durationSeconds: durationOf(session),
  };
}

function progressOf(rows: Pick<ExerciseRow, 'id' | 'status' | 'sortOrder'>[]): WorkoutProgress {
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    total: rows.length,
    completed: rows.filter((row) => row.status === 'COMPLETED').length,
    skipped: rows.filter((row) => row.status === 'SKIPPED').length,
    currentExerciseId: ordered.find((row) => row.status === 'PENDING')?.id ?? null,
  };
}

/** Current demonstration media of the exercises (PUBLIC training assets only, URLs not keys). */
async function mediaFor(deps: TrainingDeps, db: DbExecutor, exerciseIds: string[]) {
  const rows = exerciseIds.length
    ? await db
        .select({ exerciseId: E.id, asset: M })
        .from(E)
        .innerJoin(M, eq(M.id, E.mediaAssetId))
        .where(
          and(
            inArray(E.id, [...new Set(exerciseIds)]),
            eq(M.visibility, 'PUBLIC'),
            eq(M.purpose, 'TRAINING_VIDEO'),
          ),
        )
    : [];
  return (exerciseId: string, name: string): ResolvedMedia | null => {
    const asset = rows.find((row) => row.exerciseId === exerciseId)?.asset;
    if (!asset || (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO')) return null;
    return {
      assetId: asset.id,
      kind: asset.kind,
      url: deps.urls.publicUrl(asset.storageKey),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      altText: asset.altText ?? name,
    };
  };
}

function toExerciseDto(
  row: ExerciseRow,
  sets: SetRow[],
  media: ResolvedMedia | null,
): WorkoutSessionExercise {
  return {
    id: row.id,
    assignmentId: row.trainingExerciseAssignmentId,
    exerciseId: row.exerciseId,
    order: row.sortOrder,
    sectionType: row.sectionType,
    sectionTitle: row.sectionTitleSnapshot,
    sectionOrder: row.sectionOrder,
    name: row.exerciseNameSnapshot,
    instructions: row.instructionsSnapshot,
    media,
    target: {
      sets: row.sets,
      reps: row.reps,
      totalReps: row.totalReps,
      durationSeconds: row.durationSeconds,
      restSeconds: row.restSeconds,
      targetWeight: row.targetWeight,
      weightUnit: row.weightUnit,
      prescriptionText: row.prescriptionText,
    },
    executionMode: row.executionMode,
    status: row.status,
    completedAt: iso(row.completedAt),
    actualReps: row.actualReps,
    actualDurationSeconds: row.actualDurationSeconds,
    actualWeight: row.actualWeight,
    sets: sets
      .filter((set) => set.sessionExerciseId === row.id)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((set) => ({
        setNumber: set.setNumber,
        targetReps: set.targetReps,
        targetDurationSeconds: set.targetDurationSeconds,
        targetWeight: set.targetWeight,
        actualReps: set.actualReps,
        actualWeight: set.actualWeight,
        completed: set.completedAt !== null,
        completedAt: iso(set.completedAt),
      })),
    clientNote: row.clientNote,
    clientNoteUpdatedAt: iso(row.clientNoteUpdatedAt),
  };
}

async function loadSession(
  deps: TrainingDeps,
  db: DbExecutor,
  session: SessionRow,
): Promise<WorkoutSession> {
  const rows = await db
    .select()
    .from(WE)
    .where(eq(WE.sessionId, session.id))
    .orderBy(asc(WE.sortOrder));
  const sets = rows.length
    ? await db
        .select()
        .from(WSET)
        .where(
          inArray(
            WSET.sessionExerciseId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  const media = await mediaFor(
    deps,
    db,
    rows.map((row) => row.exerciseId),
  );
  return {
    ...header(session),
    programId: session.trainingProgramId,
    dayId: session.trainingDayId,
    progress: progressOf(rows),
    exercises: rows.map((row) =>
      toExerciseDto(row, sets, media(row.exerciseId, row.exerciseNameSnapshot)),
    ),
    clientNote: session.clientNote,
    clientNoteUpdatedAt: iso(session.clientNoteUpdatedAt),
  };
}

async function summaries(
  db: DbExecutor,
  clientId: string,
  limit: number,
): Promise<WorkoutSessionSummary[]> {
  const counts = db
    .select({
      sessionId: WE.sessionId,
      total: sql<number>`count(*)::int`.as('total'),
      completed: sql<number>`(count(*) filter (where ${WE.status} = 'COMPLETED'))::int`.as(
        'completed',
      ),
      skipped: sql<number>`(count(*) filter (where ${WE.status} = 'SKIPPED'))::int`.as('skipped'),
      notes: sql<number>`(count(*) filter (where ${WE.clientNote} is not null))::int`.as('notes'),
    })
    .from(WE)
    .groupBy(WE.sessionId)
    .as('counts');
  const rows = await db
    .select({
      session: WS,
      total: counts.total,
      completed: counts.completed,
      skipped: counts.skipped,
      notes: counts.notes,
    })
    .from(WS)
    .leftJoin(counts, eq(counts.sessionId, WS.id))
    .where(eq(WS.clientUserId, clientId))
    .orderBy(desc(WS.startedAt), desc(WS.id))
    .limit(limit);
  return rows.map((row) => ({
    ...header(row.session),
    programId: row.session.trainingProgramId,
    dayId: row.session.trainingDayId,
    exercisesTotal: row.total ?? 0,
    exercisesCompleted: row.completed ?? 0,
    exercisesSkipped: row.skipped ?? 0,
    notesCount: (row.notes ?? 0) + (row.session.clientNote ? 1 : 0),
  }));
}

async function summaryOf(db: DbExecutor, session: SessionRow): Promise<WorkoutSessionSummary> {
  const rows = await db
    .select({ id: WE.id, status: WE.status, sortOrder: WE.sortOrder, note: WE.clientNote })
    .from(WE)
    .where(eq(WE.sessionId, session.id));
  const progress = progressOf(rows);
  return {
    ...header(session),
    programId: session.trainingProgramId,
    dayId: session.trainingDayId,
    exercisesTotal: progress.total,
    exercisesCompleted: progress.completed,
    exercisesSkipped: progress.skipped,
    notesCount: rows.filter((row) => row.note !== null).length + (session.clientNote ? 1 : 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Scoped lookups (self context)
// ---------------------------------------------------------------------------------------------

async function requireClient(db: DbExecutor, actor: Principal) {
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, actor.userId), eq(users.role, 'CLIENT')))
    .limit(1);
  if (!client) throw AppError.notFound('No client account.');
}

async function ownSession(db: DbExecutor, actor: Principal, sessionId: string, lock = false) {
  const query = db
    .select()
    .from(WS)
    .where(and(eq(WS.id, sessionId), eq(WS.clientUserId, actor.userId)))
    .limit(1);
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw notFound();
  return row;
}

/** Locks the own session and requires it to be IN_PROGRESS (recorded state is append-only after). */
async function ownRunningSession(db: DbExecutor, actor: Principal, sessionId: string) {
  const session = await ownSession(db, actor, sessionId, true);
  if (session.status !== 'IN_PROGRESS') {
    throw AppError.conflict('Dieses Training ist bereits beendet.');
  }
  return session;
}

async function sessionExercise(db: DbExecutor, sessionId: string, exerciseId: string) {
  const [row] = await db
    .select()
    .from(WE)
    .where(and(eq(WE.id, exerciseId), eq(WE.sessionId, sessionId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

async function focused(
  deps: TrainingDeps,
  db: DbExecutor,
  session: SessionRow,
  exercise: ExerciseRow,
): Promise<WorkoutExecutionUpdateResponse> {
  await db
    .update(WS)
    .set({ updatedAt: nowOf(deps) })
    .where(eq(WS.id, session.id));
  const [sets, siblings, media] = await Promise.all([
    db.select().from(WSET).where(eq(WSET.sessionExerciseId, exercise.id)),
    db
      .select({ id: WE.id, status: WE.status, sortOrder: WE.sortOrder })
      .from(WE)
      .where(eq(WE.sessionId, session.id)),
    mediaFor(deps, db, [exercise.exerciseId]),
  ]);
  return {
    exercise: toExerciseDto(
      exercise,
      sets,
      media(exercise.exerciseId, exercise.exerciseNameSnapshot),
    ),
    progress: progressOf(siblings),
  };
}

// ---------------------------------------------------------------------------------------------
// Client: start / resume / read
// ---------------------------------------------------------------------------------------------

/**
 * Start the workout of a training day of the own ACTIVE program.
 * - an IN_PROGRESS session of the SAME day exists → it is returned (`resumed: true`)
 * - an IN_PROGRESS session of ANOTHER day exists → 409 WORKOUT_IN_PROGRESS (details: sessionId);
 *   the client finishes or abandons it first (one current workout per client)
 * - the day is not part of the caller's ACTIVE program (draft, archived, other client, unknown)
 *   → 404; a day without exercises → 409
 */
export async function startWorkout(
  deps: TrainingDeps,
  actor: Principal,
  trainingDayId: string,
): Promise<StartWorkoutResponse> {
  return deps.db.transaction(async (tx) => {
    await requireClient(tx, actor);
    // Serialises concurrent starts of the same client (double tap, two devices).
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`vitruv.workout.start:${actor.userId}`}))`,
    );
    const [current] = await tx
      .select()
      .from(WS)
      .where(and(eq(WS.clientUserId, actor.userId), eq(WS.status, 'IN_PROGRESS')))
      .limit(1);
    if (current && current.trainingDayId === trainingDayId) {
      return { session: await loadSession(deps, tx, current), resumed: true };
    }
    const [day] = await tx
      .select({
        dayId: D.id,
        dayTitle: D.title,
        dayOrder: D.sortOrder,
        weekOrder: W.sortOrder,
        programId: P.id,
        programTitle: P.title,
      })
      .from(D)
      .innerJoin(W, eq(W.id, D.weekId))
      .innerJoin(P, eq(P.id, W.programId))
      .where(and(eq(D.id, trainingDayId), eq(P.clientUserId, actor.userId), eq(P.status, 'ACTIVE')))
      .limit(1)
      // The plan can not change between this check and the snapshot below.
      .for('share', { of: P });
    if (!day) throw notFound();
    if (current) {
      throw new AppError(
        409,
        'WORKOUT_IN_PROGRESS',
        'Ein anderes Training läuft noch. Schließe es ab oder brich es ab.',
        [{ path: 'sessionId', message: current.id }],
      );
    }
    const now = nowOf(deps);
    const session = one(
      await tx
        .insert(WS)
        .values({
          clientUserId: actor.userId,
          trainingProgramId: day.programId,
          trainingDayId: day.dayId,
          programTitleSnapshot: day.programTitle,
          dayTitleSnapshot: day.dayTitle,
          weekOrderSnapshot: day.weekOrder,
          dayOrderSnapshot: day.dayOrder,
          startedAt: now,
        })
        .returning(),
    );
    // SNAPSHOT — one statement: sections in order, then assignments in order.
    const copied = await tx.execute(sql`
      insert into ${WE} (
        session_id, training_exercise_assignment_id, exercise_id, sort_order,
        section_type, section_title_snapshot, section_order,
        exercise_name_snapshot, instructions_snapshot,
        sets, reps, total_reps, duration_seconds, rest_seconds, target_weight, weight_unit,
        prescription_text, execution_mode
      )
      select ${session.id}, a.id, e.id,
        (row_number() over (order by s.sort_order, a.sort_order)) - 1,
        s.type, s.title, s.sort_order,
        e.name, coalesce(a.instructions_override, e.description),
        a.sets, a.reps, a.total_reps, a.duration_seconds, a.rest_seconds, a.target_weight, a.weight_unit,
        a.prescription_text,
        (case
          when a.sets is not null or a.reps is not null then 'SETS_REPS'
          when a.total_reps is not null then 'TOTAL_REPS'
          when a.duration_seconds is not null then 'DURATION'
          else 'CUSTOM' end)::workout_execution_mode
      from ${A} a
      join ${S} s on s.id = a.section_id
      join ${E} e on e.id = a.exercise_id
      where s.day_id = ${day.dayId}
    `);
    if ((copied.rowCount ?? 0) === 0) {
      throw AppError.conflict('Dieser Trainingstag enthält noch keine Übungen.');
    }
    await tx.execute(sql`
      insert into ${WSET} (session_exercise_id, set_number, target_reps, target_duration_seconds, target_weight)
      select we.id, n, we.reps, we.duration_seconds, we.target_weight
      from ${WE} we, generate_series(1, coalesce(we.sets, 1)) as n
      where we.session_id = ${session.id} and we.execution_mode = 'SETS_REPS'
    `);
    return { session: await loadSession(deps, tx, session), resumed: false };
  });
}

/** The client's IN_PROGRESS workout (resume after app restart / on another device), or null. */
export async function currentWorkout(
  deps: TrainingDeps,
  actor: Principal,
): Promise<CurrentWorkoutResponse> {
  return snapshotRead(deps, async (tx) => {
    await requireClient(tx, actor);
    const [current] = await tx
      .select()
      .from(WS)
      .where(and(eq(WS.clientUserId, actor.userId), eq(WS.status, 'IN_PROGRESS')))
      .limit(1);
    return { session: current ? await loadSession(deps, tx, current) : null };
  });
}

export async function getWorkout(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
): Promise<WorkoutSession> {
  return snapshotRead(deps, async (tx) =>
    loadSession(deps, tx, await ownSession(tx, actor, sessionId)),
  );
}

export async function workoutHistory(
  deps: TrainingDeps,
  actor: Principal,
  limit: number,
): Promise<WorkoutSessionSummaryList> {
  return snapshotRead(deps, async (tx) => {
    await requireClient(tx, actor);
    return { items: await summaries(tx, actor.userId, limit) };
  });
}

// ---------------------------------------------------------------------------------------------
// Client: record execution (own IN_PROGRESS session only; targets are never writable)
// ---------------------------------------------------------------------------------------------

export async function updateWorkoutExercise(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
  exerciseId: string,
  input: UpdateWorkoutExerciseRequest,
): Promise<WorkoutExecutionUpdateResponse> {
  return deps.db.transaction(async (tx) => {
    const session = await ownRunningSession(tx, actor, sessionId);
    const exercise = await sessionExercise(tx, session.id, exerciseId);
    if (
      exercise.executionMode === 'SETS_REPS' &&
      (input.actualReps !== undefined || input.actualDurationSeconds !== undefined)
    ) {
      throw AppError.badRequest('Wiederholungen werden bei Satz-Übungen pro Satz erfasst.');
    }
    const now = nowOf(deps);
    const updated = one(
      await tx
        .update(WE)
        .set({
          ...(input.status !== undefined
            ? { status: input.status, completedAt: input.status === 'COMPLETED' ? now : null }
            : {}),
          ...(input.actualReps !== undefined ? { actualReps: input.actualReps } : {}),
          ...(input.actualDurationSeconds !== undefined
            ? { actualDurationSeconds: input.actualDurationSeconds }
            : {}),
          ...(input.actualWeight !== undefined ? { actualWeight: input.actualWeight } : {}),
        })
        .where(eq(WE.id, exercise.id))
        .returning(),
    );
    return focused(deps, tx, session, updated);
  });
}

/**
 * Tick off / correct one set. The exercise status follows its sets: all sets done → COMPLETED;
 * otherwise PENDING (a SKIPPED exercise stays skipped while none of its sets is done).
 */
export async function updateWorkoutSet(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  input: UpdateWorkoutSetRequest,
): Promise<WorkoutExecutionUpdateResponse> {
  return deps.db.transaction(async (tx) => {
    const session = await ownRunningSession(tx, actor, sessionId);
    const exercise = await sessionExercise(tx, session.id, exerciseId);
    const now = nowOf(deps);
    const [set] = await tx
      .update(WSET)
      .set({
        ...(input.completed !== undefined ? { completedAt: input.completed ? now : null } : {}),
        ...(input.actualReps !== undefined ? { actualReps: input.actualReps } : {}),
        ...(input.actualWeight !== undefined ? { actualWeight: input.actualWeight } : {}),
      })
      .where(and(eq(WSET.sessionExerciseId, exercise.id), eq(WSET.setNumber, setNumber)))
      .returning();
    if (!set) throw notFound();
    const sets = await tx
      .select({ completedAt: WSET.completedAt })
      .from(WSET)
      .where(eq(WSET.sessionExerciseId, exercise.id));
    const done = sets.filter((row) => row.completedAt !== null).length;
    const status: WorkoutExerciseStatus =
      done === sets.length
        ? 'COMPLETED'
        : exercise.status === 'SKIPPED' && done === 0
          ? 'SKIPPED'
          : 'PENDING';
    let row = exercise;
    if (status !== exercise.status) {
      row = one(
        await tx
          .update(WE)
          .set({ status, completedAt: status === 'COMPLETED' ? now : null })
          .where(eq(WE.id, exercise.id))
          .returning(),
      );
    }
    return focused(deps, tx, session, row);
  });
}

// ---------------------------------------------------------------------------------------------
// Client: notes (own session; also after it ended — a note is a remark, not a recorded result)
// ---------------------------------------------------------------------------------------------

/** Note on the whole session. null/empty removes it. */
export async function setSessionNote(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
  input: UpdateWorkoutNoteRequest,
): Promise<WorkoutNoteResponse> {
  return deps.db.transaction(async (tx) => {
    const session = await ownSession(tx, actor, sessionId, true);
    const updated = one(
      await tx
        .update(WS)
        .set({ clientNote: input.note, clientNoteUpdatedAt: input.note ? nowOf(deps) : null })
        .where(eq(WS.id, session.id))
        .returning(),
    );
    return {
      clientNote: updated.clientNote,
      clientNoteUpdatedAt: iso(updated.clientNoteUpdatedAt),
    };
  });
}

/** Note under one exercise of the own session. null/empty removes it. */
export async function setExerciseNote(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
  exerciseId: string,
  input: UpdateWorkoutNoteRequest,
): Promise<WorkoutNoteResponse> {
  return deps.db.transaction(async (tx) => {
    const session = await ownSession(tx, actor, sessionId, true);
    const exercise = await sessionExercise(tx, session.id, exerciseId);
    const updated = one(
      await tx
        .update(WE)
        .set({ clientNote: input.note, clientNoteUpdatedAt: input.note ? nowOf(deps) : null })
        .where(eq(WE.id, exercise.id))
        .returning(),
    );
    return {
      clientNote: updated.clientNote,
      clientNoteUpdatedAt: iso(updated.clientNoteUpdatedAt),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Client: finish
// ---------------------------------------------------------------------------------------------

/**
 * "Training abschließen" — allowed with skipped or open exercises (recorded as they are; nobody
 * is trapped by one skipped exercise). Repeating the call on a COMPLETED session returns the same
 * summary (safe network retry); an ABANDONED session can not be completed.
 */
export async function finishWorkout(
  deps: TrainingDeps,
  actor: Principal,
  sessionId: string,
  target: 'COMPLETED' | 'ABANDONED',
): Promise<FinishWorkoutResponse> {
  return deps.db.transaction(async (tx) => {
    const session = await ownSession(tx, actor, sessionId, true);
    if (session.status === target) return { summary: await summaryOf(tx, session) };
    if (session.status !== 'IN_PROGRESS') {
      throw AppError.conflict('Dieses Training ist bereits beendet.');
    }
    const now = nowOf(deps);
    const end = now < session.startedAt ? session.startedAt : now;
    const updated = one(
      await tx
        .update(WS)
        .set(
          target === 'COMPLETED'
            ? { status: 'COMPLETED', completedAt: end }
            : { status: 'ABANDONED', abandonedAt: end },
        )
        .where(eq(WS.id, session.id))
        .returning(),
    );
    return { summary: await summaryOf(tx, updated) };
  });
}

// ---------------------------------------------------------------------------------------------
// Coach / Admin: read-only summaries (client scope as for programs)
// ---------------------------------------------------------------------------------------------

export async function clientWorkoutSummaries(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
  limit: number,
): Promise<WorkoutSessionSummaryList> {
  return snapshotRead(deps, async (tx) => {
    const [client] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, clientId), clientAccessible(actor, users.id)))
      .limit(1);
    if (!client) throw notFound();
    return { items: await summaries(tx, clientId, limit) };
  });
}

/**
 * One session of a client in full (exercises, recorded values, the client's notes) — read-only
 * for Coach/Admin. Client scope first; a session of another client is the same 404.
 */
export async function clientWorkoutDetail(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
  sessionId: string,
): Promise<WorkoutSession> {
  return snapshotRead(deps, async (tx) => {
    const [client] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, clientId), clientAccessible(actor, users.id)))
      .limit(1);
    if (!client) throw notFound();
    const [session] = await tx
      .select()
      .from(WS)
      .where(and(eq(WS.id, sessionId), eq(WS.clientUserId, client.id)))
      .limit(1);
    if (!session) throw notFound();
    return loadSession(deps, tx, session);
  });
}
