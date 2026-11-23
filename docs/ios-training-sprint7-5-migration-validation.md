# iOS Training — Sprint 7.5 Migration Validation (0022–0025) + Neon Runbook

All runs on the **isolated local cluster** (`vitruv-it`, PostgreSQL 18.6 embedded,
`127.0.0.1:55433`, `vitruv_it_*` databases, fail-closed guard of Sprint 2.5). **No connection to
Neon, no Neon branch, no production credentials.** A green local run is **not** a Neon approval.

## 1. What was run

| Suite | Scenario | Result |
|---|---|---|
| `migrations.pg.test.ts` A | fresh database, all 26 migrations (0000–0025), Drizzle schema parity (tables, columns, nullability, defaults, indexes, uniques, checks, FKs, enum labels + order), journal order | ✅ |
| `migrations.pg.test.ts` B | 0000–0021 → synthetic legacy users/coach/clients/exercises/program/sessions/sets/plan → 0022–0025 → no row lost or changed, new columns NULL/false, old execution modes readable, new constraints work | ✅ |
| `migrations.pg.test.ts` C | 0000–0024 + legacy rows with a library video → 0025 snapshots that video; RESTRICT (23001) / SET NULL behaviour | ✅ |
| **new** `migration-rehearsal.pg.test.ts` D | 0000–0024 + legacy fixture + **20 005** synthetic snapshot rows (200 exercises, half with a library video, 2 000 sessions) → 0025 | ✅ **357 ms** |
| D | row-by-row: every snapshot got exactly the video its exercise showed before; all other columns identical (canonical JSON hash per row); row counts of 7 tables unchanged; plan/template rows stay NULL; FKs validated, no orphan; history query uses `workout_sessions_client_completed_idx` | ✅ |
| E | migrator again → no-op (26 recorded, data identical); backfill statement again → **0 rows**; a later-set snapshot is never overwritten (`IS NULL` guard) | ✅ |
| F | **atomicity**: 0021 state + legacy data, then 0022–0025 with a forced failure at the end of 0025 → nothing of 0022–0025 remains (history 22, enum labels INTERVAL/CHECKLIST gone, new tables/types/columns absent, legacy rows intact); then the unchanged migrations apply cleanly (26) | ✅ |
| G | locks held by 0025 (inside a transaction, read from `pg_locks`) | ✅ documented below |

Counts: DB PG **29/29** (17 → 29), DB unit 24/24.

## 2. Drizzle migrator behaviour (drizzle-orm 0.45.4, read from `pg-core/dialect.js`)

- `pnpm db:migrate` → `migrate()` reads the journal, takes the **last applied `created_at`**, and
  runs **all newer migrations in ONE transaction** (`session.transaction(...)`), one statement per
  `--> statement-breakpoint`, inserting each hash into `drizzle.__drizzle_migrations`.
- Consequences: 0022–0025 commit **together or not at all** (F proves the rollback). Every lock
  taken by any of them is held **until the final commit**. A migration whose journal `when` is not
  newer than the last applied one would be skipped silently — test A asserts strictly increasing
  `created_at`.
- The repo's destructive-SQL guard runs before (`assertMigrationsAreSafe`); 0022–0025 are additive.

## 3. `ALTER TYPE … ADD VALUE` (0022: `workout_execution_mode` + INTERVAL, CHECKLIST)

- Allowed inside a transaction since PostgreSQL 12; the new label **cannot be used in the same
  transaction** before commit ("unsafe use of new value"). 0022–0025 never use the new
  `workout_execution_mode` labels (0023's checks use `training_execution_type`, a type *created*
  in 0022 — allowed). Fresh and upgrade runs prove it.
- Rolled back with the transaction (F). After commit a label cannot be removed without recreating
  the type → treat 0022 as **not reversible** in place.

## 4. Locks (G) and expected impact

| Statement (0025) | Lock | Effect while the batch runs |
|---|---|---|
| `ADD COLUMN media_asset_id uuid` (3 tables) | ACCESS EXCLUSIVE on `training_exercise_assignments`, `workout_session_exercises`, `workout_template_exercises` | blocks reads and writes of these tables; metadata-only (nullable, no default) |
| `ADD CONSTRAINT … FOREIGN KEY` (validated) | SHARE ROW EXCLUSIVE on the table + `media_assets` | scan of the new (all-NULL) column — fast; `media_assets` stays readable |
| `CREATE INDEX workout_sessions_client_completed_idx` (not CONCURRENTLY) | SHARE on `workout_sessions` | blocks writes to sessions for the build time |
| backfill `UPDATE` | ROW EXCLUSIVE + row locks | rewrites only snapshot rows whose exercise has a library video |

0022–0024 add similar ACCESS EXCLUSIVE locks (ADD COLUMN with constant defaults = metadata-only
since PG 11; new tables). Because all four run in one transaction, **the training tables are
unavailable to the API for the whole batch** (local: well under a second for 20 k snapshot rows;
production volume unknown — run the read-only counts below first). Plan a short maintenance
window; do not use `CREATE INDEX CONCURRENTLY` (not allowed in a transaction).

## 5. Neon runbook (for the owner — NOT executed)

**Preconditions**
1. Owner approval for the production migration (CLAUDE.md: never without it).
2. Version compatibility: on Neon run `select version();` — needs PostgreSQL ≥ 13
   (`gen_random_uuid()` built in; ADD VALUE in a transaction needs ≥ 12; fast ADD COLUMN with
   default ≥ 11). Local validation ran on 18.6.
3. API build that understands 0022–0025 is ready but **not yet deployed**; `TRAINING_EXTENDED_TYPES`
   stays `disabled`; old apps keep working (additive API fields, capability 2 unchanged).
4. Read-only sizing (direct host, never the pooler for migrations — see project note on the Neon
   pooler and multi-statement transactions):
   `select count(*) from workout_session_exercises; select count(*) from workout_sessions;`
   `select count(*) from workout_session_exercises we join exercises e on e.id = we.exercise_id where e.media_asset_id is not null;`
5. `select hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;` → last
   applied must be **0021_welcome_videos** (22 rows). Anything else: stop.

**Backup / isolation**
6. Create a Neon **branch of production right before** the run as restore point (and note the LSN
   / timestamp for point-in-time restore). Optional dry run: run steps 9–11 against that branch
   first, then delete the dry-run branch.

**Execution**
7. Announce a maintenance window (a few minutes); stop or pause the API (or accept 503s on training
   routes); no coach edits during the window.
8. Use the **direct** (non-pooler) connection string; set a lock timeout so the batch fails fast
   instead of queueing behind long transactions: append
   `options=-c%20lock_timeout%3D10s%20-c%20statement_timeout%3D300s` to the URL used for the run.
9. `pnpm db:migrate` (guard → one transaction → 26 recorded).
10. If it fails: nothing was applied (one transaction). Read the error code (never print the URL),
    fix the cause (usually a lock timeout → retry in a quieter moment). No partial state to repair.

**Verification**
11. `pnpm db:inspect`; `select count(*) from drizzle.__drizzle_migrations` = 26; enum labels of
    `workout_execution_mode` include INTERVAL, CHECKLIST; the three `media_asset_id` columns + FKs +
    `workout_sessions_client_completed_idx` exist; row counts from step 4 unchanged; backfilled rows
    = the join count from step 4.
12. Deploy the matching API, smoke test with a **test** coach/client (not real customers): login,
    library, history, assign. Flag stays OFF.

**Roll-forward / rollback**
- Preferred: **roll forward** (fix in a new migration 0026+). Never edit 0022–0025 once applied.
- Data rollback = restore the pre-run branch / point-in-time (loses writes since the window) —
  only with owner approval. No down migrations; enum labels and new tables are not dropped in place
  (destructive guard).
- Expected (not tested against the old build in this sprint): the previous API build keeps working
  against the migrated schema — Drizzle selects explicit columns, the new columns are
  nullable/defaulted, new tables/labels are unused while the flag is OFF. Verify on the dry-run
  branch (step 6) before relying on an API-only rollback.
