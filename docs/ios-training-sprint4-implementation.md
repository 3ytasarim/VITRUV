# iOS Training — Sprint 4: Home, weekly plan, workout overview, Warm-up checklist

Status: implemented and tested locally on `feature/ios-training`. **Not deployed, not pushed, no
production migration.** `TRAINING_EXTENDED_TYPES` stays OFF in production.

## Scope

| Area              | Result                                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home              | Running workout card (unchanged) + new plan overview: "Nächstes Training", current training week Mo–So with stats, Trainingsübersicht link, Trainingsverlauf link                                                                                                                                                                |
| Weekly plan       | Built only from `GET /v1/client/training/active` (the client's ACTIVE program copy). No static/fake cards. Previous / next week, "Zur aktuellen Woche", "Kein Training geplant" for free days, several workouts per day                                                                                                          |
| Workout overview  | Date ("Geplant am …" / "Ohne festen Termin"), type, exercise count, status badge, coach-ordered sections, Warm-up preview as checklist, video badge. Completed day: info text + disabled "Abgeschlossen" (no accidental restart)                                                                                                 |
| Warm-up checklist | One screen with all CHECKLIST items of the section below each other: name, optional instructions, optional video/image, checkbox. No reps, no timer, no rest. Progress "x von y erledigt", "Aufwärmen abgeschlossen" badge, "Training fortsetzen" to the next section or "Training abschließen" when the workout is Warm-up only |
| Persistence       | Each tick = `PATCH /v1/client/workouts/:id/exercises/:eid {status}` (existing endpoint). Optimistic with rollback; a failed save is never shown as saved                                                                                                                                                                         |
| Video             | Button only when the exercise has media. iOS/macOS: WebM/Ogg are not played (message instead of crash). Sprint 7 media pipeline untouched                                                                                                                                                                                        |
| Lifecycle         | Loading / empty / error (German) / retry, pull to refresh, app resume refetches plan + session, expired token → refresh (existing interceptor)                                                                                                                                                                                   |
| Capability        | Header `X-Vitruv-App-Capability: 2` on every request — informational only; the server never trusts it                                                                                                                                                                                                                            |

No new endpoint, no new migration, no contract change.

## Date logic (no time-zone shift)

`lib/features/training/training_schedule.dart`

- Plan dates are calendar strings (`startsOn` "YYYY-MM-DD") parsed to **UTC midnight**; all
  arithmetic is whole days on UTC values → no DST effects.
- Week _i_ of the program covers `startsOn + 7·i … +6`. A day with ISO weekday _w_ is the date in
  that block with weekday _w_ (works for a mid-week start date).
- "Today" = the device's local year/month/day taken as a calendar date (never converted).
- A day without weekday or a program without `startsOn` gets **no** invented date; the Home then
  says "Dein Plan hat noch keine festen Termine" and lists the workouts without a date.
- Status per day comes from the server-derived `workoutStatus` (Sprint 2); a running session
  overrides it to "In Bearbeitung".
- "Nächstes Training": running workout first; else the earliest not-completed dated workout from
  today on (date, then day order); undated plans → first open workout in plan order.

## Files

New:

- `apps/mobile/lib/features/training/training_schedule.dart` — calendar + schedule + stats + next workout
- `apps/mobile/lib/features/training/week_schedule_view.dart` — status badge, workout card, stats row, week view
- `apps/mobile/lib/features/workout/warmup_checklist.dart` — checklist group detection + checklist UI + media sheet
- `apps/mobile/lib/features/training/training_resume_refresher.dart` — app-resume refetch

Changed (mobile): `home_screen.dart`, `training_day_screen.dart`, `training_day_tile.dart`,
`training_models.dart` (`DayStatus`, `ExecutionType`, `startsOn/endsOn`, `executionType`,
`repsMax`, `workoutStatus` — all optional), `workout_models.dart` (`sectionOrder`),
`workout_screen.dart` (checklist mode), `exercise_media.dart` (`canPlayVideo`), `api_client.dart`
(capability header), `app.dart`, `json_reader.dart`, `training_format.dart`, ARB de/en (+46 keys,
generated files regenerated). All styling via `VitruvSpace`/`VitruvColors`/theme tokens.

Changed (API): `apps/api/src/modules/workouts/workouts.service.ts` — `updateWorkoutExercise`
keeps the first `completedAt` when an already COMPLETED exercise is ticked again (idempotent, no
duplicate timestamp); un-ticking clears it. No schema change.

## Security

- Plan/session endpoints are client self context (`requireClient`, principal-scoped SQL); client B
  gets 404 for A's data (PG test 23).
- COACH → 403 (no `training.self.*`), ADMIN → 404 (has all permissions but is not a client
  account); the app additionally refuses non-CLIENT logins (sprint1_auth T8/T9).
- The client can only send `{status}` for a CHECKLIST item; values/sets are rejected with 400 by
  the strict schema. Type, order, sets, reps come from the session snapshot only.
- The "Abhaken" storage prescription is never shown (API `visiblePrescription` + UI test).

## Legacy `client_plans`

Not touched, not converted, never shown as an executable workout. The app does not call
`GET /v1/client/training/plan` (asserted in the widget tests); the API keeps it separate (PG test 27).

## Known behaviour worth noting

- The server does not refuse starting a session for an already completed day — the guard is in
  the UI (disabled "Abgeschlossen"). See remaining work.
- No offline queue: a tick without network is rolled back and offered for retry.
