import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { is } from 'drizzle-orm';
import { getTableConfig, isPgEnum, PgTable } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertIsolatedServer,
  migrateIsolated,
  migrationJournal,
  recreateIsolatedDatabase,
  verifiedIsolatedBase,
} from '../src/isolated-test-database';
import * as schema from '../src/schema/index';

/**
 * Sprint 2.5 (+ Sprint 3: 0024) — migrations 0000–0024 on a REAL, ISOLATED PostgreSQL (never production).
 *  A. fresh: every migration on an empty database + Drizzle schema parity
 *  B. upgrade: 0000–0021 → synthetic legacy rows → 0022–0023 → legacy rows intact
 */

const here = dirname(fileURLToPath(import.meta.url));
const legacyFixture = readFileSync(join(here, 'fixtures', 'legacy-0021.sql'), 'utf8');

/** PostgreSQL silently truncates identifiers to 63 bytes (NAMEDATALEN − 1). */
const pgIdentifier = (name: string) => Buffer.from(name).subarray(0, 63).toString();

async function open(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await assertIsolatedServer(client);
  return client;
}

const tables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable[];
const enums = Object.values(schema).filter((value) => isPgEnum(value)) as unknown as {
  enumName: string;
  enumValues: string[];
}[];

describe('A. fresh database — all migrations', () => {
  let db: pg.Client;
  let applied = 0;

  beforeAll(async () => {
    const base = await verifiedIsolatedBase();
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_fresh');
    applied = await migrateIsolated(url);
    db = await open(url);
  });
  afterAll(async () => db?.end());

  it('applies every journal entry exactly once, in order', async () => {
    const journal = migrationJournal();
    expect(journal).toHaveLength(25);
    expect(journal.map((entry) => entry.idx)).toEqual(journal.map((_, index) => index));
    expect(applied).toBe(25);
    const { rows } = await db.query(
      'select created_at::bigint as at from drizzle.__drizzle_migrations order by id',
    );
    const at = rows.map((row) => Number(row.at));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('enums match the Drizzle schema (labels and order)', async () => {
    for (const enumDef of enums) {
      const { rows } = await db.query(
        `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
         where t.typname = '${enumDef.enumName}' order by e.enumsortorder`,
      );
      expect(
        rows.map((row) => row.enumlabel),
        enumDef.enumName,
      ).toEqual(enumDef.enumValues);
    }
    const { rows } = await db.query(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'workout_execution_mode' order by e.enumsortorder`,
    );
    expect(rows.map((row) => row.enumlabel)).toEqual([
      'SETS_REPS',
      'TOTAL_REPS',
      'DURATION',
      'CUSTOM',
      'INTERVAL',
      'CHECKLIST',
    ]);
  });

  it('every Drizzle table exists with the same columns, nullability and defaults', async () => {
    const { rows: dbTables } = await db.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    const dbTableNames = new Set(dbTables.map((row) => String(row.table_name)));
    const drizzleNames = tables.map((table) => getTableConfig(table).name).sort();
    expect([...dbTableNames].sort()).toEqual(drizzleNames);

    const mismatches: string[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      const { rows } = await db.query(
        `select column_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = '${config.name}'`,
      );
      const byName = new Map(rows.map((row) => [String(row.column_name), row]));
      if (byName.size !== config.columns.length) {
        mismatches.push(`${config.name}: ${byName.size} db columns vs ${config.columns.length}`);
      }
      for (const column of config.columns) {
        const dbColumn = byName.get(column.name);
        if (!dbColumn) {
          mismatches.push(`${config.name}.${column.name} missing`);
          continue;
        }
        const notNull = dbColumn.is_nullable === 'NO';
        if (notNull !== column.notNull)
          mismatches.push(`${config.name}.${column.name} nullability`);
        const dbHasDefault = dbColumn.column_default !== null;
        const drizzleHasDefault = column.hasDefault && column.default !== undefined;
        // $defaultFn/$onUpdate defaults live only in the app — the DB must have none there.
        if (drizzleHasDefault !== dbHasDefault && !(column.defaultFn || column.onUpdateFn)) {
          mismatches.push(`${config.name}.${column.name} default`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every Drizzle index, unique, check and foreign key exists under its name', async () => {
    const { rows: indexes } = await db.query(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const indexNames = new Set(indexes.map((row) => String(row.indexname)));
    const { rows: constraints } = await db.query(
      `select conname, contype from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'public'`,
    );
    const byType = (type: string) =>
      new Set(constraints.filter((row) => row.contype === type).map((row) => String(row.conname)));
    const checks = byType('c');
    const foreignKeys = byType('f');
    const uniques = byType('u');

    const missing: string[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const index of config.indexes) {
        if (!indexNames.has(index.config.name ?? ''))
          missing.push(`index ${index.config.name ?? '?'}`);
      }
      for (const check of config.checks) {
        if (!checks.has(check.name)) missing.push(`check ${check.name}`);
      }
      for (const fk of config.foreignKeys) {
        if (!foreignKeys.has(pgIdentifier(fk.getName()))) missing.push(`fk ${fk.getName()}`);
      }
      for (const unique of config.uniqueConstraints) {
        if (unique.name && !uniques.has(unique.name)) missing.push(`unique ${unique.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('identifiers over 63 bytes are truncated by PostgreSQL (4 FKs, 3 of them pre-Sprint-2)', async () => {
    const long = tables
      .flatMap((table) => getTableConfig(table).foreignKeys.map((fk) => fk.getName()))
      .filter((name) => Buffer.byteLength(name) > 63)
      .sort();
    expect(long).toEqual([
      'training_exercise_assignments_section_id_training_sections_id_fk',
      'workout_exercise_sets_session_exercise_id_workout_session_exercises_id_fk',
      'workout_session_exercises_training_exercise_assignment_id_training_exercise_assignments_id_fk',
      'workout_template_exercises_section_id_workout_template_sections_id_fk',
    ]);
    const { rows } = await db.query(
      `select conname from pg_constraint where contype = 'f' and conname = any($1::text[])`.replace(
        '$1',
        `array[${long.map((name) => `'${pgIdentifier(name)}'`).join(',')}]`,
      ),
    );
    expect(rows).toHaveLength(4);
  });

  it('client_set_id index is UNIQUE and PARTIAL (only non-null ids)', async () => {
    const { rows } = await db.query(
      "select indexdef from pg_indexes where indexname = 'workout_exercise_sets_client_set_unique'",
    );
    expect(rows).toHaveLength(1);
    const definition = String(rows[0]?.indexdef);
    expect(definition).toMatch(/CREATE UNIQUE INDEX/);
    expect(definition).toMatch(/\(session_exercise_id, client_set_id\)/);
    expect(definition).toMatch(/WHERE \(client_set_id IS NOT NULL\)/);
  });

  it('template foreign keys: inner CASCADE, users/exercises RESTRICT', async () => {
    const { rows } = await db.query(
      `select conname, confdeltype from pg_constraint where contype = 'f' and conrelid::regclass::text like 'workout_template%'
       order by conname`,
    );
    const actions = Object.fromEntries(rows.map((row) => [row.conname, row.confdeltype]));
    expect(actions).toEqual({
      workout_template_exercises_exercise_id_exercises_id_fk: 'r',
      // 69 chars in the SQL → PostgreSQL keeps the first 63 (NAMEDATALEN − 1)
      workout_template_exercises_section_id_workout_template_sections: 'c',
      workout_template_sections_template_id_workout_templates_id_fk: 'c',
      workout_templates_owner_user_id_users_id_fk: 'r',
    });
  });

  it('CHECKs behave on real rows (warm-up constraint unchanged, template type fields)', async () => {
    await db.query('begin');
    try {
      await db.query(
        "insert into users (id, email, username, role) values ('20000000-0000-4000-8000-000000000001', 'chk@vitruv.invalid', null, 'COACH'), ('20000000-0000-4000-8000-000000000002', null, 'chk.client', 'CLIENT')",
      );
      await db.query(
        "insert into exercises (id, name, code) values ('20000000-0000-4000-8000-0000000000e1', 'Check Übung', 'CHK-01')",
      );
      await db.query(
        `insert into training_programs (id, client_user_id, title) values ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-000000000002', 'Check');
         insert into training_weeks (id, program_id, sort_order) values ('20000000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-0000000000d1', 0);
         insert into training_days (id, week_id, sort_order, title) values ('20000000-0000-4000-8000-000000000081', '20000000-0000-4000-8000-000000000071', 0, 'Tag');
         insert into training_sections (id, day_id, type, sort_order) values ('20000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000081', 'WARMUP', 0);`,
      );
      const assign = (extra: string, values: string, sort: number) =>
        db.query(
          `insert into training_exercise_assignments (section_id, exercise_id, sort_order${extra})
           values ('20000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-0000000000e1', ${sort}${values})`,
        );
      const rejects = async (run: () => Promise<unknown>, constraint: string) => {
        await db.query('savepoint s');
        await expect(run()).rejects.toMatchObject({ constraint });
        await db.query('rollback to savepoint s');
      };

      // Production CHECK unchanged: an empty CHECKLIST row is still rejected …
      await rejects(
        () => assign(', execution_type', ", 'CHECKLIST'", 0),
        'training_assignments_meaningful',
      );
      // … the API's hidden fallback text satisfies it.
      await assign(', execution_type, prescription_text', ", 'CHECKLIST', 'Abhaken'", 0);
      await assign(', execution_type, sets, reps_max', ", 'STRENGTH', 3, true", 1);
      await rejects(
        () => assign(', execution_type, sets, reps, reps_max', ", 'STRENGTH', 3, 8, true", 2),
        'training_assignments_reps_max_without_reps',
      );

      await db.query(
        `insert into workout_templates (id, owner_user_id, title) values ('20000000-0000-4000-8000-0000000007a1', '20000000-0000-4000-8000-000000000001', 'Vorlage');
         insert into workout_template_sections (id, template_id, type, sort_order) values ('20000000-0000-4000-8000-0000000007b1', '20000000-0000-4000-8000-0000000007a1', 'MAIN', 0);`,
      );
      const templateExercise = (columns: string, values: string, sort: number) =>
        db.query(
          `insert into workout_template_exercises (section_id, exercise_id, sort_order, ${columns})
           values ('20000000-0000-4000-8000-0000000007b1', '20000000-0000-4000-8000-0000000000e1', ${sort}, ${values})`,
        );
      // Template CHECKLIST may be truly empty (its own constraint, not the production one).
      await templateExercise('execution_type', "'CHECKLIST'", 0);
      await rejects(
        () => templateExercise('execution_type, sets', "'CHECKLIST', 2", 1),
        'workout_template_exercises_type_fields',
      );
      await rejects(
        () => templateExercise('execution_type, sets', "'STRENGTH', 3", 1),
        'workout_template_exercises_type_fields',
      );
      await rejects(
        () => templateExercise('execution_type', "'TOTAL_REPS'", 1),
        'workout_template_exercises_type_fields',
      );
      await templateExercise('execution_type, total_reps, rest_seconds', "'TOTAL_REPS', 60, 60", 1);
      await templateExercise('execution_type', "'INTERVAL'", 2);
      await templateExercise('execution_type, sets, reps_max', "'STRENGTH', 3, true", 3);
      // Template owner cannot be deleted while it owns templates (RESTRICT).
      await rejects(
        () => db.query("delete from users where id = '20000000-0000-4000-8000-000000000001'"),
        'workout_templates_owner_user_id_users_id_fk',
      );
    } finally {
      await db.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------------------------

const LEGACY_TABLES = [
  'users',
  'coach_client_assignments',
  'exercises',
  'training_programs',
  'training_weeks',
  'training_days',
  'training_sections',
  'training_exercise_assignments',
  'workout_sessions',
  'workout_session_exercises',
  'workout_exercise_sets',
  'client_plans',
  'client_plan_items',
] as const;

/** New columns added by 0022, with the value every existing row must get. */
const NEW_COLUMNS: Record<string, Record<string, unknown>> = {
  training_days: {
    source_template_id: null,
    source_template_version: null,
    // Sprint 3 (0024)
    assignment_request_id: null,
  },
  training_exercise_assignments: { execution_type: null, reps_max: false },
  workout_exercise_sets: {
    client_set_id: null,
    actual_duration_seconds: null,
    client_recorded_at: null,
  },
  workout_session_exercises: { reps_max: false },
  workout_sessions: { source_template_id: null, source_template_version: null },
};

async function snapshot(db: pg.Client): Promise<Record<string, Record<string, unknown>[]>> {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const table of LEGACY_TABLES) {
    const { rows } = await db.query(
      `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
    );
    result[table] = rows.map((row) => row.row as Record<string, unknown>);
  }
  return result;
}

describe('B. upgrade — 0000–0021 + legacy data, then 0022–0023', () => {
  let db: pg.Client;
  let before: Record<string, Record<string, unknown>[]>;
  let after: Record<string, Record<string, unknown>[]>;
  let appliedBefore = 0;
  let appliedAfter = 0;

  beforeAll(async () => {
    const base = await verifiedIsolatedBase();
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_upgrade');
    appliedBefore = await migrateIsolated(url, '0021_welcome_videos');
    db = await open(url);
    await db.query(legacyFixture);
    before = await snapshot(db);
    appliedAfter = await migrateIsolated(url);
    after = await snapshot(db);
  });
  afterAll(async () => db?.end());

  it('stopped at 0021, then applied exactly 0022, 0023 and 0024', () => {
    expect(appliedBefore).toBe(22);
    expect(appliedAfter).toBe(25);
  });

  it('legacy fixture is present (sanity)', () => {
    expect(before.users).toHaveLength(3);
    expect(before.training_exercise_assignments).toHaveLength(5);
    expect(before.workout_sessions).toHaveLength(2);
    expect(before.workout_session_exercises).toHaveLength(5);
    expect(before.workout_exercise_sets).toHaveLength(4);
  });

  it('no row lost or changed; new columns are NULL/false on every old row', () => {
    for (const table of LEGACY_TABLES) {
      const added = NEW_COLUMNS[table] ?? {};
      expect(after[table], table).toHaveLength(before[table]?.length ?? -1);
      const stripped = (after[table] ?? []).map((row) => {
        for (const [column, expected] of Object.entries(added)) {
          expect(row[column], `${table}.${column}`).toEqual(expected);
        }
        return Object.fromEntries(Object.entries(row).filter(([column]) => !(column in added)));
      });
      // to_jsonb ordering is by the full row text, so re-sort the stripped rows the same way.
      const sort = (rows: Record<string, unknown>[]) =>
        [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      expect(sort(stripped), table).toEqual(sort(before[table] ?? []));
    }
  });

  it('old execution modes are still readable and new types are absent', async () => {
    const { rows } = await db.query(
      'select execution_mode::text as mode, count(*)::int as n from workout_session_exercises group by 1 order by 1',
    );
    expect(rows).toEqual([
      { mode: 'CUSTOM', n: 1 },
      { mode: 'DURATION', n: 1 },
      { mode: 'SETS_REPS', n: 1 },
      { mode: 'TOTAL_REPS', n: 2 },
    ]);
    const { rows: types } = await db.query(
      'select count(*)::int as n from training_exercise_assignments where execution_type is not null or reps_max',
    );
    expect(types[0]?.n).toBe(0);
  });

  it('completed and in-progress sessions survive with their snapshot and results', async () => {
    const { rows } = await db.query(
      `select s.status::text, s.completed_at, count(e.id)::int as exercises, sum(e.actual_reps)::int as reps
       from workout_sessions s left join workout_session_exercises e on e.session_id = s.id
       group by s.id order by s.status::text`,
    );
    expect(rows.map((row) => [row.status, row.exercises, row.reps])).toEqual([
      ['COMPLETED', 4, 50],
      ['IN_PROGRESS', 1, 30],
    ]);
    const { rows: sets } = await db.query(
      "select set_number, actual_reps, actual_weight::text from workout_exercise_sets where session_exercise_id = '10000000-0000-4000-8000-0000000006a2' order by 1",
    );
    expect(sets).toEqual(
      [1, 2, 3, 4].map((n) => ({ set_number: n, actual_reps: 8, actual_weight: '60.50' })),
    );
  });

  it('new columns and constraints work on the upgraded database', async () => {
    await db.query('begin');
    try {
      const id = 'aaaaaaaa-0000-4000-8000-000000000001';
      // Legacy set rows (client_set_id NULL) never collide with each other …
      await db.query(
        "insert into workout_exercise_sets (session_exercise_id, set_number, actual_reps) values ('10000000-0000-4000-8000-0000000006b1', 1, 10)",
      );
      await db.query(
        `insert into workout_exercise_sets (session_exercise_id, set_number, actual_reps, client_set_id)
         values ('10000000-0000-4000-8000-0000000006b1', 2, 10, '${id}')`,
      );
      await db.query('savepoint s');
      // … but the same client_set_id twice on one exercise is rejected by the partial unique index.
      await expect(
        db.query(
          `insert into workout_exercise_sets (session_exercise_id, set_number, actual_reps, client_set_id)
           values ('10000000-0000-4000-8000-0000000006b1', 3, 10, '${id}')`,
        ),
      ).rejects.toMatchObject({ constraint: 'workout_exercise_sets_client_set_unique' });
      await db.query('rollback to savepoint s');
      // The appended enum values are usable after the migration transaction committed.
      await db.query(
        "update workout_session_exercises set execution_mode = 'INTERVAL' where id = '10000000-0000-4000-8000-0000000006b1'",
      );
      await expect(
        db.query(
          "insert into workout_exercise_sets (session_exercise_id, set_number, actual_duration_seconds) values ('10000000-0000-4000-8000-0000000006b1', 9, -1)",
        ),
      ).rejects.toMatchObject({ constraint: 'workout_exercise_sets_actual_duration_nonnegative' });
    } finally {
      await db.query('rollback');
    }
  });

  it('the dated client plan (PlanEditor) is untouched', () => {
    expect(after.client_plans).toEqual(before.client_plans);
    expect(after.client_plan_items).toEqual(before.client_plan_items);
  });
});
