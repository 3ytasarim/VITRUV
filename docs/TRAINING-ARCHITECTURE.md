# VITRUV — Training Engine (Sprint 6)

Exercise library, client training plans (program builder) and the client-facing read endpoint the
Flutter app will consume. Native structured data only — no PDF training plans.

Related: [CLIENT-MANAGEMENT.md](CLIENT-MANAGEMENT.md) (scoping), [CMS-ARCHITECTURE.md](CMS-ARCHITECTURE.md)
(media system), [MOBILE-ARCHITECTURE.md](MOBILE-ARCHITECTURE.md) (client DTO), [AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md) (events).

## 1. Hierarchy

```
Exercise library (shared, reusable)
        ▲ referenced by
Program (one client) → Week → Day → Section (WARMUP | MAIN | FINISHER) → Exercise assignment
```

| Layer      | Table                           | Notes                                                                                  |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| Exercise   | `exercises`                     | unique `lower(name)`, description, optional `media_asset_id`, `active`                 |
| Program    | `training_programs`             | `client_user_id`, title, description, status, `starts_on`/`ends_on` (date), timestamps |
| Week       | `training_weeks`                | optional title/notes                                                                   |
| Day        | `training_days`                 | title (required), notes, optional `scheduled_weekday` 1–7 (Mo–So)                      |
| Section    | `training_sections`             | `type` + optional title; labels Warm-up / Hauptteil / Abschluss                        |
| Assignment | `training_exercise_assignments` | exercise + prescription for this plan                                                  |

Migration `packages/db/migrations/0005_training_engine.sql` (additive only: 3 enum types, new enum
values for audit events, 6 tables, `auth_events.entity_id`, FKs, indexes). Structure below a program
cascades on delete (only DRAFT programs can be deleted); `exercises`, `media_assets` and the client
user are `RESTRICT` — a referenced exercise or medium can never disappear underneath a plan.

## 2. Prescriptions

All optional, at least one "what to do" field is required (DB check `training_assignments_meaningful`
\+ the same rule in the Zod contract `prescriptionIssues()`):

| Field                  | Meaning                                                  | Limits (shared `PRESCRIPTION_LIMITS`) |
| ---------------------- | -------------------------------------------------------- | ------------------------------------- |
| `sets`, `reps`         | e.g. 4 × 12                                              | 1–50, 1–1000                          |
| `totalReps`            | e.g. "70 Wiederholungen gesamt"                          | 1–10 000                              |
| `durationSeconds`      | timed work (UI accepts `45` or `0:45`)                   | 1–86 400                              |
| `restSeconds`          | **structured seconds**, never free text (UI `1:30`)      | 0–3600                                |
| `targetWeight` + unit  | optional, unit `KG` (weight ⇔ unit enforced by DB check) | 0–1000                                |
| `prescriptionText`     | free one-liner ("bis kurz vor Muskelversagen")           | 1–200 chars, single line              |
| `instructionsOverride` | plan-specific instructions, replaces the exercise text   | ≤ 2000                                |

The client DTO exposes `instructions` = override ?? exercise description.

## 3. Lifecycle

```
DRAFT ──activate──▶ ACTIVE ──complete──▶ COMPLETED
  │                   │  └──archive───▶ ARCHIVED
  └──archive──────────┴──────────────────▲   (DRAFT/COMPLETED can be archived too)
DRAFT ──delete (hard, cascade)
```

- **One ACTIVE plan per client**: partial unique index `training_programs_one_active WHERE status='ACTIVE'`.
- **Activation** runs in one transaction with a per-client advisory lock: validate (≥ 1 week, every
  week ≥ 1 day, ≥ 1 assignment overall), retire the previous ACTIVE plan to **ARCHIVED**
  (`retired_at`), set the new one ACTIVE (`activated_at`), write audit events. The UI shows a
  checklist and a confirmation dialog naming the plan that will be archived.
- Editable: DRAFT and ACTIVE (coaches adjust running plans). COMPLETED/ARCHIVED are read-only (409).
- Clients see **only** the ACTIVE plan; drafts and retired plans are never returned.
- `currentWeekId` (client DTO) is computed only when `starts_on` is set: week index =
  ⌊(today in Europe/Berlin − starts_on) / 7⌋; `null` before the start and after the last week.

## 4. Authorization

Permission **and** relationship (same model as client management):

| Permission                   | ADMIN | COACH              | CLIENT                    |
| ---------------------------- | ----- | ------------------ | ------------------------- |
| `training.exercises.read`    | ✓     | ✓ (shared library) | –                         |
| `training.exercises.write`   | ✓     | ✓                  | –                         |
| `training.media.delete`      | ✓     | –                  | –                         |
| `training.programs.read`     | ✓ all | ✓ assigned clients | –                         |
| `training.programs.create`   | ✓     | ✓ assigned clients | –                         |
| `training.programs.update`   | ✓     | ✓ assigned clients | –                         |
| `training.programs.activate` | ✓     | ✓ assigned clients | –                         |
| `training.self.read`         | –     | –                  | ✓ (`/v1/client/training`) |
| `training.sessions.read`     | ✓     | ✓ assigned clients | –                         |
| `training.self.workout`      | –¹    | –                  | ✓ (`/v1/client/workouts`) |

¹ ADMIN holds every permission, but self workouts require a CLIENT account (404 otherwise).

COACH has no `website.*` permission (permanent rule, see CLIENT-MANAGEMENT §3).

- **Every nested id is scoped in SQL.** A week/day/section/assignment id is resolved by joining up to
  its program and applying `clientAccessible(actor, training_programs.client_user_id)` (ADMIN: all;
  COACH: active assignment exists). Anything out of scope — or non-existent — answers **404**, so ids
  of another coach's clients reveal nothing. Covered by 26 cross-coach probes in
  `apps/api/test/training.int.test.ts` and the E2E (step 24).
- Reorder requests must contain **exactly** the current sibling set (no foreign ids, no omissions).
- Moving items across parents is not supported (no cross-program leakage path).
- The client endpoint uses only the authenticated principal (`self` context, no client id in the URL).

## 5. Ordering

Dense `sort_order` 0..n−1 per parent with `unique(parent_id, sort_order)`. Writes are two-phase
(shift by +1 000 000, then final positions) inside the program transaction, so the unique
constraint never trips mid-update. Inserts append; deletes re-normalise; duplicate (week/day)
inserts the copy directly after the source ("(Kopie)" suffix on titled items). All program
mutations lock the program row (`FOR UPDATE`) and touch `updated_at`.

## 6. Media

One media system, two libraries (`media.service.ts` `…LibraryMedia(deps, library, …)`):

| Library  | Purpose          | Storage prefix   | Visibility | Permissions                                                        |
| -------- | ---------------- | ---------------- | ---------- | ------------------------------------------------------------------ |
| WEBSITE  | `WEBSITE`        | (existing)       | PUBLIC     | `website.media.*`                                                  |
| TRAINING | `TRAINING_VIDEO` | `training-video` | PUBLIC     | read/upload `training.exercises.*`; delete `training.media.delete` |

- Exercises accept only TRAINING_VIDEO, PUBLIC, image or video assets (website media → 400).
- Delete protection: a referenced asset answers 409 and names its usages (`exercise/<id>`); the
  media detail lists `exerciseUsages`.
- The client DTO resolves media to `{assetId, kind, url, mimeType, width, height, altText}` (alt
  falls back to the exercise name) — no storage keys or internal fields.
- Exercise demo videos are coaching content, not private client data, hence PUBLIC. Private client
  uploads (feedback videos, nutrition PDFs) will use PRIVATE media with signed URLs (later sprints).

## 7. API

Admin (`/v1/admin/training`, Bearer, permissions above):

```
GET/POST  /exercises                     PATCH /exercises/:id    POST /exercises/:id/(de|re)activate
GET       /exercises/:id
GET/POST  /clients/:clientId/programs
GET/PATCH/DELETE /programs/:id           GET /programs/:id/preview
POST      /programs/:id/(activate|complete|archive)
POST      /programs/:id/weeks            POST /programs/:id/weeks/reorder
PATCH/DELETE /weeks/:id                  POST /weeks/:id/duplicate   POST /weeks/:id/days(/reorder)
PATCH/DELETE /days/:id                   POST /days/:id/duplicate    POST /days/:id/sections(/reorder)
PATCH/DELETE /sections/:id               POST /sections/:id/assignments(/reorder)
PATCH/DELETE /assignments/:id
GET/POST  /v1/admin/training/media …     (training media library; DELETE needs training.media.delete)
```

Structure mutations return the full admin program tree (one round trip for the builder).

Client: `GET /v1/client/training/active` → `{ program: ClientTrainingProgram | null }`
(`clientActiveTrainingResponseSchema` in `packages/contracts/src/training.ts`). Reads (client and
preview) run in a REPEATABLE READ read-only transaction, so a plan is never returned half-updated.

Inactive exercises: hidden from the builder search and the library default filter, rejected for
new assignments, but existing assignments stay valid and keep rendering. Exercises are never
hard-deleted.

## 8. Audit

`auth_events` (with the new `entity_id`): `EXERCISE_CREATED`, `EXERCISE_DEACTIVATED`,
`EXERCISE_REACTIVATED`, `PROGRAM_CREATED`, `PROGRAM_ACTIVATED`, `PROGRAM_COMPLETED`,
`PROGRAM_ARCHIVED` (actor, client as subject, entity id). Edits of the structure are not audited
individually (high volume; `updated_at` is maintained).

## 9. Web (Admin)

- **Coaching & Training → Übungen** (`/admin/training/uebungen`): search, active/inactive filter,
  media presence, usage count; create/edit with the training media picker; deactivate/reactivate.
- **Kund:in → Training** (`/admin/kunden/[id]/training`): active plan, drafts, completed/archived;
  "Plan als Entwurf anlegen".
- **Program builder** (`…/training/[programId]`): plan data form with unsaved-changes state and
  `beforeunload` guard; collapsible weeks; days; sections; assignment dialog (exercise search,
  structured fields, discard confirmation). Every item has keyboard-reachable ↑/↓/duplicate/delete
  buttons with explicit labels ("Klimmzüge nach oben verschieben"); results are announced in a
  live status region. Activation checklist + confirmation dialog.
- **Vorschau** (`…/vorschau`): renders the client DTO exactly as the app receives it (web
  representation only, not the Flutter design).

## 10. Workout sessions (Sprint 7) and future attachment points

- **Workout sessions** are built ([WORKOUT-ARCHITECTURE.md](WORKOUT-ARCHITECTURE.md)): a session
  snapshots the day's assignments at start, so editing an ACTIVE plan never changes a running or
  finished session — the next session gets the new prescription. Session links to
  `training_days` / `training_exercise_assignments` are `SET NULL`, so coaches can still delete
  parts of an ACTIVE plan. Programs with sessions can not be deleted (only DRAFTs are deletable;
  sessions additionally RESTRICT).
- **Exercise feedback** will reference the workout session exercise (FK model in
  WORKOUT-ARCHITECTURE §8); videos as PRIVATE media.
- Retired programs are kept (ARCHIVED/COMPLETED), so history stays referenceable.
- Flutter consumes `/v1/client/training/active` and `/v1/client/workouts` (Sprint 7 UI).

## Dated client plan (2026-10-19)

A simpler alternative to week/day programs, requested by the owner: the coach drags exercises
from the shared library onto a client's plan, gives each a **period (from – to)** and a **note the
client sees**, and saves the whole list.

- Table `client_plan_items` (migration 0013, additive): `client_user_id` (RESTRICT),
  `exercise_id` (RESTRICT), `scheduled_on date` (first day), `ends_on date` (last day, null = single
  day, ≥ scheduled_on; migration 0015), `note ≤ 1000`, `sort_order`, `created_by_user_id`.
- API: `GET|PUT /v1/admin/training/clients/:clientId/plan` (`training.programs.read|update`,
  scoped with `clientAccessible()` — out of scope = 404); `PUT` replaces the list in one
  transaction under a per-client advisory lock and records `CLIENT_PLAN_SAVED` (migration 0014).
  New entries must reference an active exercise; already planned inactive ones may stay.
  `GET /v1/client/training/plan` (`training.self.read`) — self context only.
- Web: `PlanEditor` on the client's Training tab (library ↔ plan, drag & drop or "+", date +
  note per row, explicit "Speichern", unsaved-changes guard); portal: `DatedPlan` on
  /mein-training/plan and the "Heute / Als Nächstes geplant" card on the dashboard.
- No workout sessions are created from these entries (programs keep that role).

### Update 2026-10-21 — exercise catalogue + plan period

- Exercises carry the catalogue columns of the owner's exercise library: `category_id`
  (`exercise_categories`, ordered), `code` (unique, e.g. `OK-01`), `capture_type` ("Erfassung"),
  `standard`, `usage` ("Einsatz"); `description` is the "Ausführung" (migration 0017, additive).
  `GET|POST /v1/admin/training/exercise-categories`; the list is sorted by code, search matches
  name or code. The 49 catalogue exercises were imported through the API (idempotent by code/name).
- The client plan has ONE period on `client_plans` (`starts_on`, `ends_on`); items are only
  exercise + coach note + order (`client_plan_items.scheduled_on` is legacy and now null).
  `PUT …/plan` takes `{ startsOn, endsOn, items: [{ exerciseId, note }] }`.
- PlanEditor: plan (period, rows with code, category, Standard · Erfassung, coach note) on the
  left, library on the right as a category accordion — drag one exercise or a whole category
  (already planned exercises are skipped), or use +. Portal groups the plan by category.
