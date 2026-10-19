# VITRUV — Workout Sessions (Sprint 7)

What a client actually trains, recorded against an immutable snapshot of the plan. Server: API
`/v1/client/workouts` (self context) + read-only coach summaries. App: Flutter live workout.

Related: [TRAINING-ARCHITECTURE.md](TRAINING-ARCHITECTURE.md) (plans), [MOBILE-ARCHITECTURE.md](MOBILE-ARCHITECTURE.md)
(app, auth, timer), [CLIENT-MANAGEMENT.md](CLIENT-MANAGEMENT.md) (scoping).

## 1. Data model (`0006_workout_sessions.sql`, additive)

```
workout_sessions (client, program, day, snapshot titles, status, started/completed/abandoned)
  └─ workout_session_exercises (SNAPSHOT of each assignment + execution state)
       └─ workout_exercise_sets (only for SETS_REPS exercises)
```

| Table                       | Key points                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout_sessions`          | `client_user_id` → users RESTRICT; `training_program_id` → programs RESTRICT; `training_day_id` → days **SET NULL**; `program_title_snapshot`, `day_title_snapshot`, `week_order_snapshot`, `day_order_snapshot`; status + timestamps                                           |
| `workout_session_exercises` | `training_exercise_assignment_id` → assignments **SET NULL**; `exercise_id` → exercises RESTRICT; `sort_order` (unique per session), `section_type`, `section_title_snapshot`, `section_order`; full prescription snapshot; `execution_mode`; `status`, `completed_at`, actuals |
| `workout_exercise_sets`     | `set_number ≥ 1` (unique per exercise), `target_reps`, `target_duration_seconds`, `target_weight`, `actual_reps`, `actual_weight`, `completed_at`                                                                                                                               |

Enums: `workout_session_status` (IN_PROGRESS, COMPLETED, ABANDONED), `workout_execution_mode`
(SETS_REPS, TOTAL_REPS, DURATION, CUSTOM), `workout_exercise_status` (PENDING, COMPLETED, SKIPPED).

Constraints: partial unique `workout_sessions_one_in_progress (client_user_id) WHERE status='IN_PROGRESS'`;
status ⇔ timestamps (`IN_PROGRESS` → no end; `COMPLETED` → `completed_at` only; `ABANDONED` →
`abandoned_at` only); end ≥ start; exercise `status='COMPLETED'` ⇔ `completed_at`; actuals ≥ 0;
weight ⇔ unit; name length.

## 2. Lifecycle & uniqueness

```
(start) → IN_PROGRESS ──"Training abschließen"──▶ COMPLETED
                      └─"Training abbrechen" (confirmed)─▶ ABANDONED   (row kept, never deleted)
```

- **One IN_PROGRESS session per client** (DB index + per-client advisory lock in the start
  transaction). Rationale: one phone, one workout at a time; resume is unambiguous.
- Completion is allowed with skipped **and** open exercises — recorded exactly as they are
  (open = still PENDING). Nobody is trapped by one skipped exercise.
- `complete`/`abandon` are retry-safe: repeating the same call returns the same summary; the other
  transition on a finished session answers 409. Finished sessions are read-only (409 on updates).
- Abandon exists because of the one-current rule: without it a client who wants another day would
  have to "complete" a workout they did not do.

## 3. Snapshot (historical integrity)

ACTIVE programs stay editable (coaches adjust running plans), so a session **never** reads its
targets from the live plan after the start. At start, one `INSERT … SELECT` copies, per assignment
of the day (sections in order, then assignments in order):

- exercise name, section type/title/order, position
- `sets`, `reps`, `totalReps`, `durationSeconds`, `restSeconds`, `targetWeight`, `weightUnit`,
  `prescriptionText`
- instructions = plan override ?? exercise description
- execution mode (§4); SETS_REPS also gets one set row per set (`target_reps/duration/weight`)

and the session copies program title, day title, week/day position. The live program row is locked
`FOR SHARE` during the start, so the copy is consistent with concurrent builder edits.

Consequences (all tested against DB/API):

- Coach changes 4 × 12 / rest 60 → 5 × 8 / rest 90 while a session runs: the running session keeps
  4 × 12 / 60; the next session gets 5 × 8 / 90.
- Renaming an exercise, deleting an assignment or a whole day, archiving the program: history stays
  complete (links become `null`, names/titles/targets remain).
- **Media**: not copied. The DTO resolves the exercise's _current_ demonstration media (PUBLIC
  `TRAINING_VIDEO`) through `exercise_id`. Media is illustration, not the prescription, so no binary
  duplication and no extra delete protection is needed; if a coach removes a video later, an old
  session simply shows none. Exercises themselves are never hard-deleted (RESTRICT).

Coach UI: the builder of an ACTIVE plan says "Änderungen gelten ab der nächsten Trainingseinheit.
Bereits gestartete Einheiten behalten ihre Vorgaben." No locking system.

## 4. Execution model

The mode is derived by the API from structured fields only (`executionModeOf` in
`packages/shared/src/workout.ts`, same rule in SQL) — free text is never parsed:

| Mode         | Rule                                      | Recording                                                                                          |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SETS_REPS`  | `sets` or `reps` set (reps alone = 1 set) | set rows: tick each set (+ optional `actualReps`/`actualWeight`); exercise status follows its sets |
| `TOTAL_REPS` | `totalReps`                               | exercise `actualReps` (e.g. 70) + COMPLETED                                                        |
| `DURATION`   | `durationSeconds`                         | exercise `actualDurationSeconds` + COMPLETED (app timer optional)                                  |
| `CUSTOM`     | only `prescriptionText` (e.g. AMRAP)      | mark COMPLETED, no numbers forced                                                                  |

Set rows exist **only** for SETS_REPS — 70 total reps or 45 s do not map to sets. Every exercise
can be SKIPPED or re-opened (PENDING). Set rule: all sets done → COMPLETED; otherwise PENDING (a
SKIPPED exercise stays skipped while none of its sets is done). Exercise-level `actualReps` /
`actualDurationSeconds` are rejected for SETS_REPS (400, recorded per set). Targets are never
writable (strict contracts).

## 5. API

Client — `/v1/client/workouts`, permission `training.self.workout` (CLIENT), self context:

| Endpoint                                                 | Behaviour                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /` `{ trainingDayId }`                             | same day running → **200** `{ session, resumed: true }`; other day running → **409 `WORKOUT_IN_PROGRESS`** (`details: [{path:'sessionId', message:<id>}]`); day not in own ACTIVE plan (draft, archived, other client, unknown) → 404; day without exercises → 409; else **201** |
| `GET /current`                                           | `{ session \| null }` — resume after restart / another device                                                                                                                                                                                                                    |
| `GET /?limit=` (1–100, default 20)                       | history summaries, newest first                                                                                                                                                                                                                                                  |
| `GET /:sessionId`                                        | full session (any status)                                                                                                                                                                                                                                                        |
| `PATCH /:sessionId/exercises/:exerciseId`                | `{ status?, actualReps?, actualDurationSeconds?, actualWeight? }` → `{ exercise, progress }`                                                                                                                                                                                     |
| `PATCH /:sessionId/exercises/:exerciseId/sets/:n`        | `{ completed?, actualReps?, actualWeight? }` → `{ exercise, progress }`                                                                                                                                                                                                          |
| `POST /:sessionId/complete` · `POST /:sessionId/abandon` | → `{ summary }`                                                                                                                                                                                                                                                                  |

Coach/Admin — `GET /v1/admin/training/clients/:clientId/workouts` (`training.sessions.read`, read-only
summaries; COACH only for actively assigned clients). Coaches cannot change recorded execution.

Responses: `workoutSessionSchema` (header + `progress {total, completed, skipped, currentExerciseId}`

- exercises with `target`, `executionMode`, `status`, actuals, `sets[]`, resolved `media`),
  `workoutSessionSummarySchema` (header + counts + `durationSeconds`). Execution updates return only
  the changed exercise + progress (no program/session refetch). Progress is always derived from
  stored state. Contracts: `packages/contracts/src/workout.ts`.

**Authorization.** Every query is `client_user_id = principal.userId`; a session/exercise/set id of
another client is the same 404 as a missing id; coaches/admins have no self workouts (403/404). No
endpoint accepts a client id for self operations (strict bodies reject `clientId`).

## 6. Rest timer (Flutter, local only)

`features/workout/countdown.dart` + `countdown_panel.dart`. The backend never ticks.

- Starts after a ticked set or a completed exercise when `restSeconds > 0`; manual "Pause starten".
- Pause/resume, skip, **+30 Sek.**, "Pause beendet" + haptic at zero, then "Weiter". The rest of the
  screen stays usable while it runs.
- **Absolute target time**: only `endsAt` is stored; remaining = `endsAt − now`. 20 s in the
  background → 20 s less on return; device sleep does not stop it. On `resumed` the panel re-reads
  immediately. (Wall-clock based, so a manual clock change during a rest would shift it — accepted.)
- The ticker lives inside the panel and rebuilds only the panel, at most once per displayed second.
- Screen readers: digits are excluded from live updates (no announcement per second); start and end
  are announced once; reduced motion removes the digit transition.
- **No notification** while the app is in the background: no local-notification/push
  infrastructure was added just for the timer (permission prompt, platform setup). On return the
  timer shows the correct state. Can be added later with a local notification plugin.
- Timed exercises (DURATION) use the same countdown as an optional work timer.

## 7. Resume & offline

- Server is the source of truth: the app loads `GET /current` on start and after sign-in; "Heute"
  shows **Training fortsetzen**; the workout opens at `progress.currentExerciseId`.
- Leaving the workout screen (back) keeps the session IN_PROGRESS ("Dein Training läuft weiter").
- Mutations are optimistic and serialised; on failure the exercise is rolled back to its last
  server-confirmed version, an error with **Erneut versuchen** is shown — nothing is silently lost.
  An already loaded workout stays usable when one request fails.
- No offline queue / sync in Sprint 7: actions taken offline are not stored; the client retries
  when online. Documented limitation.

## 8. Exercise feedback — future FK model (not built)

Feedback (comment, later video) belongs to what was actually trained:

```
exercise_feedback
  id
  workout_session_exercise_id → workout_session_exercises  (RESTRICT)   ← the concrete execution
  workout_session_id          → workout_sessions           (RESTRICT)   (denormalised for listing)
  client_user_id              → users                      (RESTRICT)   (= session.client, checked)
  training_exercise_assignment_id (nullable, informational — copied from the session exercise)
  body text, media_asset_id → PRIVATE media (FEEDBACK_VIDEO), created_at, coach_read_at …
```

The session exercise already carries everything (snapshot name/target, assignment link, client
via session), so no schema change of Sprint 7 tables is needed. Not created now: no UI/consumer yet.

## 8a. Client notes & web client area (owner request 2026-10-18)

Clients use the **web** ("Mein Training", `/mein-training`, same login as the panel); the Flutter
client is suspended and unchanged. Migration `0010_workout_client_notes.sql` (additive):
`client_note text` + `client_note_updated_at` on `workout_sessions` (note on the whole session)
and `workout_session_exercises` (note under one exercise), `char_length 1..2000` checks.

| Endpoint                                                       | Behaviour                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PUT /v1/client/workouts/:sessionId/note`                      | `{ note }` (trimmed; empty/null removes) → `{ clientNote, clientNoteUpdatedAt }` |
| `PUT /v1/client/workouts/:sessionId/exercises/:id/note`        | same, for one exercise of the own session                                        |
| `GET /v1/admin/training/clients/:clientId/workouts/:sessionId` | full session incl. notes, **read-only** (`training.sessions.read`, client scope) |

- Notes are a remark, not a recorded result: writable for the own session in **any** status
  (also after completing/abandoning); recorded execution stays read-only after the end.
- Coach/Admin have **no write path** for client notes (coach replies are not part of this).
- Summaries carry `notesCount`; the admin history links each session to its detail page
  (`/admin/kunden/[id]/training/einheit/[sessionId]`), which shows which note sits under which
  exercise.
- Web: `/mein-training` is a protected path (proxy session gate, no-store, noindex). CLIENT logins
  land there (`safePortalPath`), panel accounts are never sent there and clients are redirected
  away from `/admin`. Server actions forward to the API; no client id is ever sent.

## 9. Not in Sprint 7

Coach feedback center, video feedback, nutrition, coach messages, check-ins, charts/analytics,
offline sync, local notifications, editing recorded execution by coaches.
