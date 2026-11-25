import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertIsolatedServer,
  migrateIsolated,
  recreateIsolatedDatabase,
  verifiedIsolatedBase,
} from '../src/isolated-test-database';
import { assertMigrationsAreSafe } from '../src/migration-guard';

/**
 * Sprint 7.5 — production rehearsal of 0022–0025 on a REAL, ISOLATED PostgreSQL (never Neon).
 *  D. volume: 0000–0024 + legacy fixture + 20 000 synthetic snapshot rows → 0025; before/after
 *     comparison row by row, duration
 *  E. rerun: migrator again (no-op) and the backfill statement again (0 rows, never overwrites)
 *  F. atomicity: drizzle applies ALL pending migrations in ONE transaction — a failure in 0025
 *     rolls back 0022–0024 too (including `ALTER TYPE … ADD VALUE`); a clean retry then succeeds
 *  G. locks taken by 0025 (documented for the Neon runbook)
 * Synthetic, fictional data only.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, '..', 'migrations');
const legacyFixture = readFileSync(join(here, 'fixtures', 'legacy-0021.sql'), 'utf8');
const sql0025 = readFileSync(join(MIGRATIONS, '0025_sprint7_video_history.sql'), 'utf8');
const BACKFILL = sql0025
  .split('--> statement-breakpoint')
  .map((stmt) => stmt.trim())
  .find((stmt) => stmt.includes('UPDATE "workout_session_exercises"'));

const SESSIONS = 2000;
const PER_SESSION = 10;
const EXERCISES = 200;

async function open(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await assertIsolatedServer(client);
  return client;
}

/** Synthetic bulk history: 200 exercises (every 2nd with a library video), 2000 sessions x 10. */
async function seedVolume(db: pg.Client) {
  await db.query(`
    insert into media_assets (id, kind, purpose, visibility, storage_key, file_name, mime_type, size_bytes)
    select ('bbbbbbbb-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'VIDEO', 'TRAINING_VIDEO', 'PUBLIC',
           'public/training-video/bulk-' || n || '.mp4', 'bulk-' || n || '.mp4', 'video/mp4', 10
    from generate_series(1, ${EXERCISES / 2}) as n;
    insert into exercises (id, name, code, media_asset_id)
    select ('cccccccc-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Bulk Übung ' || n, 'BULK-' || n,
           case when n % 2 = 0 then ('bbbbbbbb-0000-4000-8000-' || lpad((n / 2)::text, 12, '0'))::uuid end
    from generate_series(1, ${EXERCISES}) as n;
    insert into workout_sessions (id, client_user_id, training_program_id, program_title_snapshot, day_title_snapshot,
      week_order_snapshot, day_order_snapshot, status, started_at, completed_at)
    select ('dddddddd-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid, '10000000-0000-4000-8000-0000000000a1',
           '10000000-0000-4000-8000-0000000000d1', 'Bulk Plan', 'Bulk Tag', 0, 0, 'COMPLETED',
           timestamptz '2025-01-01 08:00:00+00' + make_interval(hours => s),
           timestamptz '2025-01-01 09:00:00+00' + make_interval(hours => s)
    from generate_series(1, ${SESSIONS}) as s;
    insert into workout_session_exercises (session_id, exercise_id, sort_order, section_type, section_order,
      exercise_name_snapshot, sets, reps, execution_mode, status, completed_at)
    select ('dddddddd-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid,
           ('cccccccc-0000-4000-8000-' || lpad(((s * ${PER_SESSION} + k) % ${EXERCISES} + 1)::text, 12, '0'))::uuid,
           k, 'MAIN', 0, 'Bulk Übung', 3, 10, 'SETS_REPS', 'COMPLETED',
           timestamptz '2025-01-01 08:30:00+00' + make_interval(hours => s)
    from generate_series(1, ${SESSIONS}) as s, generate_series(0, ${PER_SESSION - 1}) as k;
  `);
}

/** Every row as canonical JSON without the new column — equal before and after = nothing else changed. */
const rowHashes = async (db: pg.Client) =>
  new Map(
    (
      await db.query<{ id: string; h: string }>(
        `select id, md5((to_jsonb(we) - 'media_asset_id')::text) as h from workout_session_exercises we`,
      )
    ).rows.map((row) => [row.id, row.h]),
  );

const counts = async (db: pg.Client) =>
  (
    await db.query(
      `select (select count(*) from users)::int as users, (select count(*) from exercises)::int as exercises,
              (select count(*) from media_assets)::int as media, (select count(*) from workout_sessions)::int as sessions,
              (select count(*) from workout_session_exercises)::int as session_exercises,
              (select count(*) from workout_exercise_sets)::int as sets,
              (select count(*) from training_exercise_assignments)::int as assignments`,
    )
  ).rows[0];

describe('D/E. 0025 on 20 000 legacy snapshot rows', () => {
  let db: pg.Client;
  let url: string;
  let expected: Map<string, string | null>;
  let beforeHashes: Map<string, string>;
  let beforeCounts: unknown;
  let ms = 0;

  beforeAll(async () => {
    const base = await verifiedIsolatedBase();
    url = await recreateIsolatedDatabase(base, 'vitruv_it_rehearsal');
    expect(await migrateIsolated(url, '0024_sprint3_template_library')).toBe(25);
    db = await open(url);
    await db.query(legacyFixture);
    await seedVolume(db);
    expected = new Map(
      (
        await db.query<{ id: string; media: string | null }>(
          `select we.id, e.media_asset_id as media from workout_session_exercises we join exercises e on e.id = we.exercise_id`,
        )
      ).rows.map((row) => [row.id, row.media]),
    );
    beforeHashes = await rowHashes(db);
    beforeCounts = await counts(db);
    const started = performance.now();
    expect(await migrateIsolated(url)).toBe(26);
    ms = performance.now() - started;
    console.warn(
      `[rehearsal] 0025 on ${expected.size} snapshot rows: ${Math.round(ms)} ms (local PG 18)`,
    );
  }, 120_000);
  afterAll(async () => db?.end());

  it('the backfill copied exactly the library video that each row showed before (row by row)', async () => {
    expect(expected.size).toBe(SESSIONS * PER_SESSION + 5);
    const { rows } = await db.query<{ id: string; media: string | null }>(
      'select id, media_asset_id as media from workout_session_exercises',
    );
    const wrong = rows.filter((row) => expected.get(row.id) !== row.media);
    expect(wrong).toEqual([]);
    const withVideo = rows.filter((row) => row.media !== null).length;
    // half of the bulk rows; the legacy fixture's exercises have no library video here
    expect(withVideo).toBe((SESSIONS * PER_SESSION) / 2);
  });

  it('no other column of any snapshot row changed, no row appeared or disappeared', async () => {
    const after = await rowHashes(db);
    expect(after.size).toBe(beforeHashes.size);
    const changed = [...beforeHashes].filter(([id, hash]) => after.get(id) !== hash);
    expect(changed).toEqual([]);
    expect(await counts(db)).toEqual(beforeCounts);
  });

  it('plan and template rows stay NULL (they resolve to the library video at read time)', async () => {
    const { rows } = await db.query(
      `select (select count(*) from training_exercise_assignments where media_asset_id is not null)::int as a,
              (select count(*) from workout_template_exercises where media_asset_id is not null)::int as t`,
    );
    expect(rows[0]).toEqual({ a: 0, t: 0 });
  });

  it('every snapshot reference is valid (FKs validated, no orphan)', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from workout_session_exercises we
       left join media_assets m on m.id = we.media_asset_id
       where we.media_asset_id is not null and m.id is null`,
    );
    expect(rows[0]?.n).toBe(0);
    const { rows: fks } = await db.query(
      `select conname, convalidated from pg_constraint where conname like '%media_asset_id_media_assets_id_fk'
       and conrelid::regclass::text in ('training_exercise_assignments','workout_session_exercises','workout_template_exercises')
       order by 1`,
    );
    expect(fks).toHaveLength(3);
    expect(fks.every((fk) => fk.convalidated)).toBe(true);
  });

  it('E. running the migrator again is a no-op (26 recorded, data unchanged)', async () => {
    const hashes = await rowHashes(db);
    expect(await migrateIsolated(url)).toBe(26);
    expect(await rowHashes(db)).toEqual(hashes);
  });

  it('E. the backfill statement is idempotent and never overwrites an existing snapshot', async () => {
    expect(BACKFILL).toBeDefined();
    await db.query('begin');
    try {
      const again = await db.query(String(BACKFILL));
      expect(again.rowCount).toBe(0);
      // a row whose snapshot was set later (e.g. a coach row video) keeps it on a rerun
      const row = [...expected].find(([, media]) => media !== null)?.[0];
      await db.query(
        `update workout_session_exercises set media_asset_id = 'bbbbbbbb-0000-4000-8000-000000000001' where id = $1`,
        [row],
      );
      await db.query(String(BACKFILL));
      const { rows } = await db.query(
        'select media_asset_id from workout_session_exercises where id = $1',
        [row],
      );
      expect(rows[0]?.media_asset_id).toBe('bbbbbbbb-0000-4000-8000-000000000001');
    } finally {
      await db.query('rollback');
    }
  });

  it('history queries use the new index', async () => {
    await db.query('analyze workout_sessions');
    const { rows } = await db.query(
      `explain (format json) select id from workout_sessions
       where client_user_id = '10000000-0000-4000-8000-0000000000a1' and completed_at is not null
       order by completed_at desc limit 20`,
    );
    expect(JSON.stringify(rows[0])).toContain('workout_sessions_client_completed_idx');
  });
});

/** Copy of the migrations folder; `mutate` may change one file (the repository is never touched). */
function migrationsCopy(mutate: (tag: string, sql: string) => string): string {
  const folder = mkdtempSync(join(tmpdir(), 'vitruv-it-rehearsal-'));
  mkdirSync(join(folder, 'meta'));
  copyFileSync(join(MIGRATIONS, 'meta', '_journal.json'), join(folder, 'meta', '_journal.json'));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    writeFileSync(join(folder, file), mutate(file.replace(/\.sql$/, ''), sql));
  }
  return folder;
}

async function migrateFolder(url: string, folder: string) {
  const files = readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => ({ file, sql: readFileSync(join(folder, file), 'utf8') }));
  assertMigrationsAreSafe(
    files,
    new Set(
      JSON.parse(readFileSync(join(MIGRATIONS, 'APPROVED_DESTRUCTIVE.json'), 'utf8')) as string[],
    ),
  );
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const probe = await pool.connect();
    try {
      await assertIsolatedServer(probe);
    } finally {
      probe.release();
    }
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

describe('F. one transaction for all pending migrations (failure in 0025)', () => {
  let db: pg.Client;
  let url: string;
  let failure: unknown;

  beforeAll(async () => {
    const base = await verifiedIsolatedBase();
    url = await recreateIsolatedDatabase(base, 'vitruv_it_atomic');
    expect(await migrateIsolated(url, '0021_welcome_videos')).toBe(22);
    db = await open(url);
    await db.query(legacyFixture);
    const folder = migrationsCopy((tag, sql) =>
      tag === '0025_sprint7_video_history'
        ? `${sql}--> statement-breakpoint\nSELECT 1 / 0;` // simulated failure at the very end
        : sql,
    );
    try {
      await migrateFolder(url, folder);
    } catch (error) {
      failure = error;
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 120_000);
  afterAll(async () => db?.end());

  it('the batch failed', () => {
    expect(failure).toBeDefined();
    const code =
      (failure as { code?: string; cause?: { code?: string } }).code ??
      (failure as { cause?: { code?: string } }).cause?.code;
    expect(code).toBe('22012'); // division_by_zero
  });

  it('nothing of 0022–0025 remains: history, enum values, tables, columns', async () => {
    const { rows } = await db.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    expect(rows[0]?.n).toBe(22);
    const { rows: labels } = await db.query(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'workout_execution_mode' and e.enumlabel in ('INTERVAL','CHECKLIST')`,
    );
    expect(labels).toEqual([]); // ALTER TYPE … ADD VALUE rolled back with the transaction
    const { rows: rel } = await db.query(
      `select to_regclass('public.workout_templates') as t, to_regtype('public.training_execution_type') as e,
         (select count(*)::int from information_schema.columns
          where table_name = 'workout_session_exercises' and column_name = 'media_asset_id') as c`,
    );
    expect(rel[0]).toEqual({ t: null, e: null, c: 0 });
  });

  it('legacy data is untouched by the failed attempt', async () => {
    const { rows } = await db.query(
      `select (select count(*) from workout_session_exercises)::int as we, (select count(*) from workout_exercise_sets)::int as s`,
    );
    expect(rows[0]).toEqual({ we: 5, s: 4 });
  });

  it('roll-forward: the unchanged migrations then apply cleanly (26)', async () => {
    expect(await migrateIsolated(url)).toBe(26);
  });
});

describe('G. locks held by 0025 (for the Neon runbook)', () => {
  let db: pg.Client;

  beforeAll(async () => {
    const base = await verifiedIsolatedBase();
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_locks');
    await migrateIsolated(url, '0024_sprint3_template_library');
    db = await open(url);
  }, 120_000);
  afterAll(async () => db?.end());

  it('ACCESS EXCLUSIVE on the three plan/snapshot tables, SHARE on workout_sessions (index build)', async () => {
    await db.query('begin');
    try {
      for (const stmt of sql0025.split('--> statement-breakpoint')) await db.query(stmt);
      const { rows } = await db.query<{ rel: string; mode: string }>(
        `select relation::regclass::text as rel, mode from pg_locks
         where pid = pg_backend_pid() and locktype = 'relation' and granted
         and relation::regclass::text in ('training_exercise_assignments','workout_session_exercises',
           'workout_template_exercises','workout_sessions','media_assets','exercises')`,
      );
      const modes = (rel: string) => rows.filter((r) => r.rel === rel).map((r) => r.mode);
      for (const rel of [
        'training_exercise_assignments',
        'workout_session_exercises',
        'workout_template_exercises',
      ]) {
        expect(modes(rel), rel).toContain('AccessExclusiveLock');
      }
      expect(modes('workout_sessions')).toContain('ShareLock');
      // the FK validation locks the referenced table, but never exclusively for readers
      expect(modes('media_assets')).toContain('ShareRowExclusiveLock');
      expect(modes('media_assets')).not.toContain('AccessExclusiveLock');
    } finally {
      await db.query('rollback');
    }
  });
});
