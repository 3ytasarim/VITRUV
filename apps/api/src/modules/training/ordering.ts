import type { DbExecutor } from '@vitruv/db';
import { sql } from 'drizzle-orm';
import { AppError } from '../../lib/errors';

/**
 * Deterministic ordering for every level of the program tree.
 *
 * Strategy: children of one parent always carry the dense sequence 0, 1, 2 … (unique per parent,
 * DB constraint). Inserts append (max + 1); deletes and reorders re-normalise. A reorder receives
 * the COMPLETE new sequence of sibling ids; anything else (missing, foreign or duplicate ids) is
 * rejected. Rewrites happen in two phases inside the caller's transaction — first every row is
 * moved out of the way (+1 000 000), then the final positions are written — so the unique
 * constraint never sees a temporary collision.
 */
export const LEVELS = {
  week: { table: 'training_weeks', parent: 'program_id' },
  day: { table: 'training_days', parent: 'week_id' },
  section: { table: 'training_sections', parent: 'day_id' },
  assignment: { table: 'training_exercise_assignments', parent: 'section_id' },
} as const;
export type Level = keyof typeof LEVELS;

const OFFSET = 1_000_000;

async function childIds(db: DbExecutor, level: Level, parentId: string): Promise<string[]> {
  const { table, parent } = LEVELS[level];
  const result = await db.execute<{ id: string }>(
    sql`select id from ${sql.identifier(table)} where ${sql.identifier(parent)} = ${parentId} order by sort_order, id`,
  );
  return result.rows.map((row) => row.id);
}

/** Next position at the end of the parent's children. */
export async function nextPosition(
  db: DbExecutor,
  level: Level,
  parentId: string,
): Promise<number> {
  const { table, parent } = LEVELS[level];
  const result = await db.execute<{ next: number }>(
    sql`select coalesce(max(sort_order) + 1, 0)::int as next from ${sql.identifier(table)} where ${sql.identifier(parent)} = ${parentId}`,
  );
  return result.rows[0]?.next ?? 0;
}

async function writeOrder(db: DbExecutor, level: Level, parentId: string, ids: string[]) {
  if (ids.length === 0) return;
  const { table, parent } = LEVELS[level];
  await db.execute(
    sql`update ${sql.identifier(table)} set sort_order = sort_order + ${OFFSET} where ${sql.identifier(parent)} = ${parentId}`,
  );
  const values = sql.join(
    ids.map((id, index) => sql`(${id}::uuid, ${index}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`update ${sql.identifier(table)} as t set sort_order = v.position, updated_at = now() from (values ${values}) as v(id, position) where t.id = v.id and t.${sql.identifier(parent)} = ${parentId}`,
  );
}

/** Re-densify after a delete (gaps closed, relative order kept). */
export async function normalize(db: DbExecutor, level: Level, parentId: string): Promise<void> {
  await writeOrder(db, level, parentId, await childIds(db, level, parentId));
}

/** Applies a complete new sibling order; rejects anything that is not exactly the siblings. */
export async function reorder(
  db: DbExecutor,
  level: Level,
  parentId: string,
  ids: readonly string[],
): Promise<void> {
  const current = await childIds(db, level, parentId);
  const same =
    current.length === ids.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => current.includes(id));
  if (!same) {
    throw AppError.validation([
      {
        path: 'ids',
        message: 'Die neue Reihenfolge muss genau alle Einträge dieser Ebene enthalten.',
      },
    ]);
  }
  await writeOrder(db, level, parentId, [...ids]);
}

/** Inserts `newId` (already appended at the end) directly after `afterId`. */
export async function placeAfter(
  db: DbExecutor,
  level: Level,
  parentId: string,
  afterId: string,
  newId: string,
): Promise<void> {
  const ids = (await childIds(db, level, parentId)).filter((id) => id !== newId);
  const index = ids.indexOf(afterId);
  ids.splice(index + 1, 0, newId);
  await writeOrder(db, level, parentId, ids);
}
