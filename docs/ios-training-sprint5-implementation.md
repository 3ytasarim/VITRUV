# iOS Training — Sprint 5 implementation (Strength execution)

Date: 2026-11-22 · Branch `feature/ios-training` · built and tested on Windows 11 only.

Sprint 5 completes the strength-workout flow in the Flutter app (one codebase, Android + iOS) and
adds one API rule. Nothing was deployed or migrated, and nothing was pushed. No new migration
was needed: per-set rows (`workout_session_sets`, migration 0022) and `repsMax` already exist.
They are still **not applied on Neon** (see the remaining-work doc).

## Completion checklist → implementation

| #   | Requirement                                  | Where / how                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Oberkörper strength works                    | `workout_screen.dart` `_ActiveSet`: the first open set has a reps field (prefilled with the target) with −/+ buttons; later open sets are not tappable; completed sets can be reopened.                                                                                                                                                                                                                                                                        |
| 2   | Unterkörper strength works                   | Same flow; tested with Kniebeugen 4 × 8 and Ausfallschritte 3 × 12 (fictional plan).                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | Actual reps stored per set                   | The app sends `PATCH …/sets/:n {completed: true, actualReps}`. The API already stored per-set rows (`set-recording.ts`). `WorkoutApi.updateSet(actualReps:)`, `WorkoutController.toggleSet(actualReps:)`.                                                                                                                                                                                                                                                      |
| 4   | MAX target                                   | `Prescription.repsMax`. Shown as "3 × MAX" / "MAX". The reps field starts empty and must be filled ("Bitte trage deine Wiederholungen ein").                                                                                                                                                                                                                                                                                                                   |
| 5   | Rest only after "Pause starten"              | Completing a set no longer starts the rest. The rest slot offers "PAUSE STARTEN · mm:ss" (the planned rest of the exercise). Timed / total-reps / custom exercises keep their previous automatic rest.                                                                                                                                                                                                                                                         |
| 6   | Correct after background → foreground        | `Countdown` stores the absolute end time only (`endsAt − now`), no per-second decrement (unchanged design). Tested with a fake clock jump.                                                                                                                                                                                                                                                                                                                     |
| 7   | Sound / visual signal                        | Visual: the existing finished state of `CountdownPanel` + haptics. Sound: `rest_alert.dart` schedules ONE local notification at the absolute end time (`flutter_local_notifications` 22.3.2, iOS only, id 4711). "+30 Sek." reschedules; pause / skip / leaving cancel; at the end it is kept (it IS the sound). Permission is requested at the first rest, not at app start. Android: no notification (no-op scheduler, see remaining work).                  |
| 8   | Session resume                               | The running session is resumed from the API (unchanged). New: a running rest survives an app kill — `rest_timer_store.dart` saves the absolute times in platform secure storage (no plain files, guarded by `secure_token_store_test`), and restores them for the same session; entries of another session or ended > 10 min ago are dropped.                                                                                                                  |
| 9   | A completed session can not be started again | `workouts.service.ts` `startWorkout`: a COMPLETED session for the day → **409 `WORKOUT_ALREADY_COMPLETED`** (`details: [{path: 'sessionId', message: <id>}]`). A running session of the same day is still resumed first; an ABANDONED day can still be started again. Code added to `API_ERROR_CODES` in `packages/contracts`. The app shows "Dieses Training hast du bereits abgeschlossen." and refreshes the plan; the web portal shows the server message. |
| 10  | History shows the real reps                  | History rows are tappable → `/fortschritt/einheit/:sessionId` (`workout_detail_screen.dart`) loads `GET /v1/client/workouts/:id` (the session SNAPSHOT) and lists every set: "Satz 2: 7 von 8 Wdh.", "Satz 1: 17 Wdh. (MAX)", "Satz 3: nicht erledigt".                                                                                                                                                                                                        |
| 11  | Apple Watch bridge does not break strength   | `CountdownSync` (02eff9e) still mirrors the one rest countdown; with the manual rest the watch receives the timer only after "Pause starten". `watch_timer_flow_test.dart` was adapted and passes. No native watch code (Sprint 5.5).                                                                                                                                                                                                                          |
| 12  | All tests + analyze                          | See `ios-training-sprint5-test-results.md`.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Files

API / contracts

- `apps/api/src/modules/workouts/workouts.service.ts` — completed-day guard in `startWorkout`.
- `packages/contracts/src/http.ts` — `WORKOUT_ALREADY_COMPLETED`.
- Tests adapted to the new rule (intent kept, nothing removed):
  - `apps/api/test/workouts.int.test.ts` "MANDATORY: coach edits … a later session gets the new prescription" now abandons the first session before the restart (an abandoned day stays restartable), then completes the second session and asserts the third start → 409 and exactly two rows.
  - `apps/api/test/workouts-v2.pg.test.ts` "coach edits during and after the session …": the restart of the completed day now asserts 409 + no second row; "the new plan" is checked on the client's live plan (`GET /v1/client/training/active`) instead of a new session.
  - `apps/api/test/workouts-v2.pg.test.ts` "starting a legacy day snapshots with the old derivation rules": legacy day A has a COMPLETED legacy session in the fixture, so its start is now asserted as 409 (legacy data is locked too). The derivation check runs on an all-columns copy of day A inserted into the throw-away legacy database; the asserted modes are unchanged (CUSTOM, SETS_REPS, TOTAL_REPS, DURATION).

Mobile (`apps/mobile`)

- New: `lib/features/workout/rest_alert.dart`, `lib/features/workout/rest_timer_store.dart`,
  `lib/features/progress/workout_detail_screen.dart`, `test/features/sprint5_strength_test.dart` (13 tests).
- Changed: `workout_screen.dart`, `workout_controller.dart` (`AlreadyCompleted`, `workoutDetailProvider`),
  `workout_api.dart` (`get`, `actualReps`), `workout_models.dart` (`WorkoutSet.copyWith`),
  `countdown.dart` (`restore`), `training_models.dart` (`repsMax`), `training_format.dart`,
  `training_day_screen.dart`, `progress_screen.dart`, routing, l10n (19 keys DE/EN).
- Test support: `fake_backend.dart` (strength program, per-set actualReps, `GET /workouts/:id`,
  completed-day 409), `app_harness.dart` (memory rest store, fake notification scheduler).
- Existing tests adapted to the manual rest (they assumed the automatic rest after a set):
  `workout_flow_test.dart`, `watch_timer_flow_test.dart`, `screens_responsive_test.dart`.

Platform / dependencies

- `pubspec.yaml`: `flutter_local_notifications: ^22.3.2`, `timezone: ^0.11.2` (lock file: additions
  only). 23.x was tried first and rejected: it needs compileSdk 37, which AGP 9.1.0 does not
  support (an AGP upgrade is out of scope).
- `android/app/build.gradle.kts`: core library desugaring (required by the plugin).
- `ios/Runner/AppDelegate.swift`: `UNUserNotificationCenter` delegate so the notification also
  shows while the app is in the foreground. **Not compiled — no macOS/Xcode here.**

## Behaviour changes to note before a release

- Web and API must be deployed together with the contracts change (the new error code).
- Web portal: starting a completed day now shows "Dieses Training hast du bereits abgeschlossen."
  instead of opening a second session (the day page normally shows completed days as done anyway).
- Clients who used to repeat a completed day can no longer do so; repeating is only possible after
  "abandon". If the owner wants deliberate repeats, that is a product decision for a later sprint.
