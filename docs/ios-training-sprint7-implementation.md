# iOS Training — Sprint 7 Implementation

Exercise videos, training history, coach progress and data synchronisation.
Branch `feature/ios-training` (local commits only — nothing pushed, deployed or migrated).

> Status: **partially complete.** Everything below is implemented and tested on Windows with a
> fake API (Flutter) and an isolated local PostgreSQL (API/DB). Real iPhone playback, the macOS
> build and the Neon migration of 0022–0025 are still open (see the remaining-work doc).

## 1. Exercise video system

**Model.** One optional medium per plan row, in addition to the library medium of the exercise:

| Table | Column | FK on delete | Meaning |
|---|---|---|---|
| `workout_template_exercises` | `media_asset_id` | RESTRICT | video of a template row |
| `training_exercise_assignments` | `media_asset_id` | RESTRICT | video of ONE client's row |
| `workout_session_exercises` | `media_asset_id` | SET NULL | snapshot at workout start |

Resolution: row medium → library medium of the exercise → none. A session snapshots
`coalesce(assignment.media_asset_id, exercise.media_asset_id)` when it starts; later changes never
reach a started/finished session.

**Rules (API, `apps/api/src/modules/training/row-media.ts`):**

- A row medium must be a TRAINING-library asset (`requireTrainingMediaRows`); website assets or
  unknown ids are refused with "Bitte ein Bild oder Video aus der Trainings-Mediathek wählen."
- Duplicating a template and assigning it to a client copy the **reference** (the file is shared,
  never duplicated). Changing client A's row touches neither client B nor the template.
- Unlinking sends `mediaAssetId: null`; the file is never deleted by the editor.
- A file in use (library, template row, assignment) cannot be deleted (FK RESTRICT + the existing
  usage check). Session snapshots use SET NULL, so recorded results survive a later deletion.
- All execution types can carry a row video (Strength, Total reps, Core, Warm-up checklist, legacy).

**Coach web.** New `RowMediaField` (`apps/web/src/components/admin/training/row-media-field.tsx`):
choose / upload (existing TRAINING media picker), preview link, replace, remove. Used in the
workout editor (templates and the per-client copy "Für Teilnehmer bearbeiten") and in the program
builder's assignment dialog. Without a row video it states whether the library medium applies.

## 2. iOS video compatibility

- New TRAINING video uploads must be **MP4 with H.264 (avc1/avc3)** — checked server-side from the
  container (`checkTrainingVideoPlayback`). WebM and HEVC uploads are refused with a German hint.
  Images are unchanged.
- No bulk conversion of existing files (production storage untouched). Existing WebM/Ogg assets
  stay usable on Android/web; on an iPhone the app shows "Dieses Video kann auf diesem Gerät nicht
  abgespielt werden." instead of a broken player (`canPlayVideo`). The coach editor warns per row
  when a chosen video is not MP4 (`mimeType`, additive contract field).
- **Windows cannot prove iOS codec support.** AVPlayer behaviour (H.264 profile/level, AAC audio,
  moov atom position, byte ranges via the CDN) must be verified on a real iPhone.

## 3. Media security

- Training row media are resolved only from TRAINING assets with `PUBLIC` visibility — the existing
  architecture of training videos (public, unsigned object-storage URLs, no auth header needed by
  AVPlayer). This is unchanged and listed as a remaining risk: anyone with the URL can view the
  file. Private client uploads are not affected (they stay signed).
- MIME/size validation and allow-list: existing media service + the new MP4/H.264 check.
- Range requests are served by object storage (no API proxy); no crash path in the app — every
  player error ends in the error state with "Erneut versuchen".
- All admin routes keep `requirePermission` + client scoping (COACH: assigned clients only).

## 4. iPhone player (Flutter)

- `MediaButton` ("Video ansehen" / "Bild ansehen") for every exercise type — not rendered without
  a medium. Its own semantics node (Sprint 7 fix: a single button merged into the explainer text).
- `showExerciseMediaSheet` → `ExerciseMedia(controls: true)`: opens on tap, loading state,
  play/pause, seek bar (`VideoProgressIndicator`, scrubbable, semantic value "0:12 von 1:05"),
  time, 20 s open timeout, error + retry, close. The player is created only when opened and
  disposed with the sheet. In the sheet the loading/error state is part of the frame's label and
  the error text + retry sit **below** the frame (the frame excludes its children from semantics),
  so VoiceOver can reach them.
- Opening/closing the sheet never touches the session, the rest timer or the outbox (tested).

## 5. Participant history (Flutter)

- `GET /v1/client/workouts` is now cursor-paged (newest first, 20 per page, `nextCursor`).
  `HistoryState` AsyncNotifier with `loadMore` (dedupe, failure flag + "Erneut versuchen").
- Each row: date, day, status, exercises done/total, duration and **recorded** totals
  (Wiederholungen / Sätze / Runden) — values that were never recorded are not shown (never "0").
- Detail (`workout_detail_screen.dart`) per mode:
  - Strength: "Satz n: x von y Wdh.", MAX "Satz 1: 17 Wdh. (MAX)", open sets "nicht erledigt",
    "Gesamt: n Wiederholungen" (recorded sets only).
  - Total reps: Gesamtziel / Geschafft / Benötigte Sätze + every set.
  - Core: "5 Runden · 40 Sek. Belastung · 20 Sek. Pause", "Runden geschafft: x von y", rounds.
  - Warm-up: completion only ("Aufwärmen erledigt").
- **Bug fixed (pre-existing since Sprint 5):** the detail screen expected `{ session: … }` while
  the API returns the session at the root. The app now accepts both; the fake API mirrors the real
  API. Sprint 5 tests had passed only because the fake used the wrapper.

**Sync.** History, comparison and charts reload on pull-to-refresh and on app resume
(`TrainingResumeRefresher` now also invalidates them). There is **no offline queue/cache for
reads**; a failed load shows "Erneut versuchen" and keeps what is already loaded.

## 6. Exercise comparison + progress

- `GET …/workouts/:sessionId/comparison` (client + admin): per exercise the latest **earlier,
  COMPLETED** session with the same `exerciseId` + execution mode + MAX flag that has a recorded
  result. Per set previous → current (signed difference), totals, sets used (Total reps), rounds
  and "other round settings" (Core). No match → "Noch keine Vergleichsdaten". Warm-up: no score.
- `GET …/workouts/progress/exercises/:exerciseId` (client + admin): points oldest → newest from
  completed sessions, only for the type of the latest entry, entries without a value dropped.
- Shared logic: `packages/shared/src/workout-history.ts` (`exerciseResult`, `resultScore`,
  `compareResults`, `weekStats`, `resultKindOf`) — used by the API; the app and web only format.
- Charts: Flutter `CustomPainter`, web inline SVG — no chart dependency. Each has a text
  alternative ("3 Trainings. Erster Wert 15, letzter Wert 18, bester Wert 18 Wiederholungen.");
  fewer than two points → "Noch zu wenige Daten für einen Verlauf".

## 7. Coach progress dashboard (web)

Client workspace → Training (`/admin/kunden/[id]/training`):

- **Trainingsfortschritt**: Geplant / Erledigt / Offen / Läuft gerade for the week (unknown →
  "–", never 0) and the latest workout with its recorded totals.
- **Trainingsverlauf**: recorded totals per row; "Ältere Einheiten" / "Neueste Einheiten" via
  `?verlauf=<cursor>` (server-rendered).
- **Einheit** detail: result lines per set/round, comparison with the previous workout,
  "Verlauf anzeigen" (`?verlauf=<exerciseId>`) with the SVG chart. If the comparison request fails
  the recorded summary still shows.

The seven coach questions: (1) completed this week → Erledigt; (2) waiting workouts → Offen +
the existing Trainingswoche per day; (3) exercises done → Einheit detail; (4) reps per set → result
lines; (5) change vs. last time → comparison; (6) sets needed for a total target → "Benötigte
Sätze"; (7) progress over time → chart.

## 8. Weekly statistics

`clientWeek` returns an additive `stats` (`weekStats` over the dated workouts of the week, one
status per workout) — the same rule as the app's `WeekSchedule.stats` (Sprint 4). Coach and
participant therefore show the same numbers.

## 9. API endpoints (additive, existing Hono routes/contracts)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/client/workouts?limit&cursor` | + `nextCursor`, totals per item |
| GET | `/v1/client/workouts/:id/comparison` | own sessions only (404 otherwise) |
| GET | `/v1/client/workouts/progress/exercises/:exerciseId?limit` | own data only |
| GET | `/v1/admin/training/clients/:clientId/workouts?limit&cursor` | scoped client |
| GET | `/v1/admin/training/clients/:clientId/workouts/:id/comparison` | scoped client |
| GET | `/v1/admin/training/clients/:clientId/workouts/progress/exercises/:exerciseId` | scoped |
| — | template / client-workout / assignment inputs | + optional `mediaAssetId` |
| — | `media` on template rows, assignments, client workouts | additive, `mimeType` optional |

Cursor = base64url(`startedAt|id`), strict decoding (400 on garbage). Pagination fetches
`limit + 1`; totals come from one aggregate query per page (no N+1).

## 10. DB / schema

Migration `0025_sprint7_video_history.sql` (generated, read, **not applied anywhere except the
isolated test cluster**): three nullable `media_asset_id` columns + FKs, index
`workout_sessions_client_completed_idx (client_user_id, completed_at)` for history/comparison, and
a backfill of session snapshots from the library medium. Additive only; 0022–0024 untouched.

## 11. Flutter changes (summary)

`exercise_media.dart` (player controls, error/retry semantics), `warmup_checklist.dart`
(`MediaButton`, sheet), `workout_screen.dart`, `workout_models.dart`, `workout_api.dart`,
`workout_controller.dart`, `progress/history_models.dart`, `progress/progress_chart.dart`,
`progress/progress_screen.dart` (pagination; date + badge now wrap at 320 px / 200 % text),
`progress/workout_detail_screen.dart`, 32 new l10n keys (DE/EN).

## 12. Web changes (summary)

`row-media-field.tsx` (new), `training-progress.tsx` (new), `lib/workout-results.ts` (new),
`workout-editor.tsx`, `assignment-dialog.tsx`, `workout-history.tsx`, `lib/training-api.ts`,
client training page + session detail page.

## 13. Accessibility

- One-item Warm-up checklist: correct VoiceOver semantics (Sprint 6 finding) + regression tests.
- Video button is its own semantics node; player error/retry reachable; seek bar has a value.
- Chart summaries as text; history row wraps instead of overflowing at 320 px / 200 % text.
- German UI copy fix: chart summary unit "Wiederholungen" (was "Wdh.." with a doubled period).

## 14. Flag

`TRAINING_EXTENDED_TYPES` unchanged — stays **OFF** in production.
