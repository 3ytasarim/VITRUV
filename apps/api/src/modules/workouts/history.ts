import type {
  ExerciseComparison,
  ExerciseProgress,
  ExerciseResultDto,
  WorkoutComparison,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { compareResults, exerciseResult, resultKindOf, resultScore } from '@vitruv/shared';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { AppError } from '../../lib/errors';

/**
 * Sprint 7 — training history read model: cursor pagination, recorded totals per session,
 * "previous vs current" per exercise and the progress series of one exercise.
 *
 * Reads ONLY session snapshots + recorded sets (template/plan/archive edits never change history).
 * Every function receives an already scoped client id (self context or coach/admin scope check
 * done by the caller). No N+1: a fixed number of queries per request.
 */
const { workoutSessions: WS, workoutSessionExercises: WE, workoutExerciseSets: WSET } = schema;

type SessionRow = typeof WS.$inferSelect;
type ExerciseRow = typeof WE.$inferSelect;
type SetRow = typeof WSET.$inferSelect;

/** Modes with a score (Strength, Total reps, Core). Warm-up/legacy have completion only. */
const SCORED_MODES = ['SETS_REPS', 'TOTAL_REPS', 'INTERVAL'] as const;

// ---------------------------------------------------------------------------------------------
// Cursor (opaque base64url of "startedAt|id"; order startedAt desc, id desc)
// ---------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HistoryCursor = { startedAt: Date; id: string };

export function encodeCursor(session: Pick<SessionRow, 'startedAt' | 'id'>): string {
  return Buffer.from(`${session.startedAt.toISOString()}|${session.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string | undefined): HistoryCursor | undefined {
  if (cursor === undefined) return undefined;
  const invalid = () => AppError.validation([{ path: 'cursor', message: 'Ungültiger Cursor.' }]);
  const [at, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!at || !id || rest.length > 0 || !UUID.test(id)) throw invalid();
  const startedAt = new Date(at);
  if (Number.isNaN(startedAt.getTime()) || startedAt.toISOString() !== at) throw invalid();
  return { startedAt, id };
}

/** Rows strictly after the cursor in "startedAt desc, id desc" order. */
export function afterCursor(cursor: HistoryCursor | undefined) {
  if (!cursor) return undefined;
  return sql`(${WS.startedAt}, ${WS.id}) < (${cursor.startedAt}, ${cursor.id}::uuid)`;
}

// ---------------------------------------------------------------------------------------------
// Recorded totals per session (one aggregate query for a page)
// ---------------------------------------------------------------------------------------------

export type SessionTotals = {
  totalReps: number | null;
  setsCompleted: number;
  roundsCompleted: number;
};

export async function sessionTotals(
  db: DbExecutor,
  sessionIds: string[],
): Promise<Map<string, SessionTotals>> {
  const result = new Map<string, SessionTotals>();
  if (sessionIds.length === 0) return result;
  // Explicit aliases (we / ps): the per-set columns must never resolve to a same-named
  // workout_session_exercises column (e.g. "reps" = the snapshot target).
  const ids = sql.join(
    sessionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const { rows } = await db.execute<{
    session_id: string;
    total_reps: number | null;
    sets_completed: number;
    rounds_completed: number;
  }>(sql`
    select we.session_id,
      -- TOTAL_REPS keeps its sum on the exercise row (also pre-Sprint-2 records without sets)
      (sum(case
        when we.execution_mode = 'TOTAL_REPS' then we.actual_reps
        when we.execution_mode = 'SETS_REPS' then ps.rep_sum end))::int as total_reps,
      (coalesce(sum(case
        when we.execution_mode = 'SETS_REPS' then coalesce(ps.recorded, 0)
        when we.execution_mode = 'TOTAL_REPS' then (case
          when coalesce(ps.recorded, 0) > 0 then ps.recorded
          when we.actual_reps is not null then 1 else 0 end)
        else 0 end), 0))::int as sets_completed,
      (coalesce(sum(case
        when we.execution_mode = 'INTERVAL' then coalesce(ps.done, 0) else 0 end), 0))::int
        as rounds_completed
    from ${WE} we
    left join (
      select s.session_exercise_id,
        sum(s.actual_reps) as rep_sum,
        count(*) filter (where s.actual_reps is not null) as recorded,
        count(*) filter (where s.completed_at is not null) as done
      from ${WSET} s
      join ${WE} e on e.id = s.session_exercise_id
      where e.session_id in (${ids})
      group by s.session_exercise_id
    ) ps on ps.session_exercise_id = we.id
    where we.session_id in (${ids})
    group by we.session_id
  `);
  for (const raw of rows) {
    const row = {
      sessionId: raw.session_id,
      totalReps: raw.total_reps,
      setsCompleted: raw.sets_completed,
      roundsCompleted: raw.rounds_completed,
    };
    result.set(row.sessionId, {
      totalReps: row.totalReps === null ? null : Number(row.totalReps),
      setsCompleted: Number(row.setsCompleted),
      roundsCompleted: Number(row.roundsCompleted),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Result of one session exercise (shared rules)
// ---------------------------------------------------------------------------------------------

function resultOf(row: ExerciseRow, sets: SetRow[]): ExerciseResultDto {
  return exerciseResult({
    executionMode: row.executionMode,
    repsMax: row.repsMax,
    target: {
      sets: row.sets,
      totalReps: row.totalReps,
      durationSeconds: row.durationSeconds,
      restSeconds: row.restSeconds,
    },
    sets: sets
      .filter((set) => set.sessionExerciseId === row.id)
      .map((set) => ({
        setNumber: set.setNumber,
        targetReps: set.targetReps,
        actualReps: set.actualReps,
        completed: set.completedAt !== null,
      })),
    legacyActualReps: row.actualReps,
  });
}

const setsOf = (db: DbExecutor, exerciseIds: string[]) =>
  exerciseIds.length
    ? db.select().from(WSET).where(inArray(WSET.sessionExerciseId, exerciseIds))
    : Promise.resolve([] as SetRow[]);

const comparisonKey = (row: Pick<ExerciseRow, 'exerciseId' | 'executionMode' | 'repsMax'>) =>
  `${row.exerciseId}|${row.executionMode}|${row.repsMax}`;

/**
 * The exercise has a real recorded result: completed, or at least one recorded set/round, or a
 * legacy total. (An exercise with one set left open stays PENDING but its sets are real data.)
 */
const hasRecordedResult = sql`(${WE.status} = 'COMPLETED' or ${WE.actualReps} is not null or exists (
  select 1 from ${WSET} rs where rs.session_exercise_id = ${WE.id}
    and (rs.actual_reps is not null or rs.completed_at is not null)))`;

// ---------------------------------------------------------------------------------------------
// Previous vs current
// ---------------------------------------------------------------------------------------------

/**
 * Every exercise of `session` next to the latest EARLIER COMPLETED session of the same client
 * that has the same exercise with the same type (and MAX flag) completed. Warm-up/legacy rows are
 * listed without a comparison (no score).
 */
export async function sessionComparison(
  db: DbExecutor,
  session: SessionRow,
): Promise<WorkoutComparison> {
  const current = await db
    .select()
    .from(WE)
    .where(eq(WE.sessionId, session.id))
    .orderBy(WE.sortOrder);
  const scored = current.filter((row) =>
    (SCORED_MODES as readonly string[]).includes(row.executionMode),
  );
  const reference = session.completedAt ?? session.startedAt;
  const previousRows = scored.length
    ? await db
        .selectDistinctOn([WE.exerciseId, WE.executionMode, WE.repsMax], {
          row: WE,
          sessionId: WS.id,
          status: WS.status,
          completedAt: WS.completedAt,
        })
        .from(WE)
        .innerJoin(WS, eq(WS.id, WE.sessionId))
        .where(
          and(
            eq(WS.clientUserId, session.clientUserId),
            eq(WS.status, 'COMPLETED'),
            ne(WS.id, session.id),
            lt(WS.completedAt, reference),
            hasRecordedResult,
            inArray(WE.exerciseId, [...new Set(scored.map((row) => row.exerciseId))]),
            inArray(WE.executionMode, [...SCORED_MODES]),
          ),
        )
        .orderBy(
          WE.exerciseId,
          WE.executionMode,
          WE.repsMax,
          desc(WS.completedAt),
          desc(WS.id),
          WE.sortOrder,
        )
    : [];
  const previousByKey = new Map(previousRows.map((p) => [comparisonKey(p.row), p]));
  const sets = await setsOf(db, [
    ...current.map((row) => row.id),
    ...previousRows.map((p) => p.row.id),
  ]);
  const date = (completedAt: Date | null, startedAt: Date) =>
    (completedAt ?? startedAt).toISOString();

  const items: ExerciseComparison[] = current.map((row) => {
    const currentResult = resultOf(row, sets);
    const previous = previousByKey.get(comparisonKey(row));
    const previousResult = previous ? resultOf(previous.row, sets) : null;
    const comparison = compareResults(currentResult, previousResult);
    return {
      sessionExerciseId: row.id,
      exerciseId: row.exerciseId,
      name: row.exerciseNameSnapshot,
      executionMode: row.executionMode,
      repsMax: row.repsMax,
      current: {
        sessionId: session.id,
        date: date(session.completedAt, session.startedAt),
        status: session.status,
        result: currentResult,
      },
      previous:
        previous && previousResult && previous.completedAt
          ? {
              sessionId: previous.sessionId,
              date: previous.completedAt.toISOString(),
              status: previous.status,
              result: previousResult,
            }
          : null,
      difference: comparison.difference,
      setDifferences: comparison.sets,
      configChanged: comparison.configChanged,
    };
  });
  return { sessionId: session.id, items };
}

// ---------------------------------------------------------------------------------------------
// Progress of one exercise
// ---------------------------------------------------------------------------------------------

/**
 * Points of one exercise from the client's COMPLETED sessions (oldest → newest), for the type of
 * its latest completed entry (Strength reps, Total reps, Core rounds are never mixed). Entries
 * without a recorded value are left out — no invented points.
 */
export async function exerciseProgress(
  db: DbExecutor,
  clientId: string,
  exerciseId: string,
  limit: number,
): Promise<ExerciseProgress> {
  const base = and(
    eq(WS.clientUserId, clientId),
    eq(WS.status, 'COMPLETED'),
    eq(WE.exerciseId, exerciseId),
    hasRecordedResult,
    inArray(WE.executionMode, [...SCORED_MODES]),
  );
  const [latest] = await db
    .select({ row: WE })
    .from(WE)
    .innerJoin(WS, eq(WS.id, WE.sessionId))
    .where(base)
    .orderBy(desc(WS.completedAt), desc(WS.id))
    .limit(1);
  if (!latest) {
    return {
      exerciseId,
      name: null,
      executionMode: null,
      repsMax: false,
      kind: 'NONE',
      points: [],
    };
  }
  const mode = latest.row.executionMode;
  const repsMax = latest.row.repsMax;
  const rows = await db
    .select({ row: WE, sessionId: WS.id, completedAt: WS.completedAt })
    .from(WE)
    .innerJoin(WS, eq(WS.id, WE.sessionId))
    .where(and(base, eq(WE.executionMode, mode), eq(WE.repsMax, repsMax)))
    .orderBy(desc(WS.completedAt), desc(WS.id), WE.sortOrder)
    .limit(limit);
  const sets = await setsOf(
    db,
    rows.map((r) => r.row.id),
  );
  const points = rows
    .map((r) => {
      const result = resultOf(r.row, sets);
      const value = resultScore(result);
      return value === null || !r.completedAt
        ? null
        : {
            sessionId: r.sessionId,
            date: r.completedAt.toISOString(),
            value,
            setCount: result.setCount,
          };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .reverse();
  return {
    exerciseId,
    name: latest.row.exerciseNameSnapshot,
    executionMode: mode,
    repsMax,
    kind: resultKindOf(mode),
    points,
  };
}
