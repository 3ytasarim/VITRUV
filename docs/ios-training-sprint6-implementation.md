# iOS Training — Sprint 6 implementation

Date: 2026-11-23. Branch `feature/ios-training` (local only, not pushed). Scope: the two remaining
workout engines in the iPhone app, **Gesamt-Wiederholungsziel (Total reps)** and the
**Core-Routine (interval, default 5 × 40/20)**, plus one shared timer model, persistence, the
watch mirror (Dart side) and phase notifications.

Nothing was deployed. No migration was written or applied (the API/DB already had everything
since Sprint 2/3; migrations 0022–0024 are unchanged and still **not on Neon**).

## Changed files

### API (`apps/api`)

| File | Change |
| --- | --- |
| `src/modules/workouts/workouts.service.ts` | `updateWorkoutSet` keeps the FIRST `completedAt` of a set. Repeating a Core round (retry, replay after an app kill) changes nothing. |
| `test/sprint6-engines.pg.test.ts` (new) | 6 PG tests on the isolated server: flag off, composition, Total-reps overshoot, idempotent rounds, cross-client 404, completed-session 409. |

The rest of the backend was already complete:

- `POST /v1/client/workouts/:sid/exercises/:eid/sets` (Total reps, idempotent per `clientSetId`)
- `PATCH …/sets/:n` (Core rounds)
- `exercise.timer` and `exercise.totalReps` in the DTO
- `@vitruv/shared/workout-engine` (`intervalPlan`, `totalRepsProgress`, `timerConfigOf`)

### Mobile (`apps/mobile`)

| File | Change |
| --- | --- |
| `lib/features/workout/workout_engine.dart` (new) | Dart mirror of the shared engine: `totalRepsProgress`, `IntervalConfig`, `intervalPlan`, `intervalPositionAt`, defaults 5/40/20. |
| `lib/features/workout/interval_runner.dart` (new) | `IntervalRunner` (Core on top of one `Countdown`), `SavedInterval` / `IntervalStore` (secure storage), `IntervalPersistence`, `IntervalAlertBinding`. |
| `lib/features/workout/interval_panel.dart` (new) | Core UI: round x of y, TRAINING/PAUSE, big countdown, progress, round marks, pause/resume/cancel, "Nächste Runde", unsaved rounds plus retry. |
| `lib/features/workout/total_reps_panel.dart` (new) | Total-reps UI: Gesamtziel / Bereits geschafft / Noch offen, progress, stored sets, current set, `RepsStepper`, "Satz speichern". |
| `lib/features/workout/workout_screen.dart` | Wires both engines: per-set save with automatic rest, Core runner/ticker/sync/restore. Engines replace the generic controls of their mode. |
| `lib/features/workout/workout_models.dart` | `WorkoutTimer`, `serverTotalReps`, `totalProgress`, `intervalConfig`; sets carry `actualDurationSeconds` and `clientSetId`. |
| `lib/features/workout/workout_api.dart` | `recordSet` (POST sets); `updateSet` takes `actualDurationSeconds`. |
| `lib/features/workout/workout_controller.dart` | `recordTotalSet` and `completeRound`, both **non-optimistic** (`_confirmedWrite`). |
| `lib/features/workout/rest_alert.dart` | `scheduleSeries` / `cancelSeries` (Core phase notifications, own id range 4720+). |
| `lib/features/progress/workout_detail_screen.dart` | History: per-set lines plus "Gesamt: x von y Wdh."; one line per Core round. |
| `lib/l10n/app_de.arb`, `app_en.arb` (+ generated) | 40 new strings (German first). |
| `test/support/fake_backend.dart`, `app_harness.dart` | Sprint 6 contract switch (`engines`), POST sets with failure injection, round rows, `enginesProgram()`, fake series scheduler, memory interval store. |
| `test/workout/sprint6_engines_test.dart` (new) | 26 unit tests (engine, runner on a fake clock, persistence, notifications). |
| `test/features/sprint6_engines_flow_test.dart` (new) | 31 widget tests on the real screen. |

## Engine 1 — Gesamt-Wiederholungsziel (Total reps)

- Unlimited sets. Each set is one `POST …/sets` with a random UUID v4 `clientSetId` and the
  reps (≥ 1).
- **The API is the source of truth.** A set appears, and the numbers change, only after the
  server answered. Nothing is optimistic.
- `remaining = max(0, target − sum)`. **Overshoot** is stored unclipped. 30 + 35 against a
  target of 60 gives "Bereits geschafft 65", "Noch offen 0", and the exercise is COMPLETED.
- **Automatic rest** starts only after a successful save, with the API's `restSeconds`. Rules:
  - no rest when the save failed;
  - no rest after the set that reaches the target (the API sends `restSeconds: null`);
  - a replayed answer never starts a second rest (`_restStartedForSet`).
- **Retry:** the same reps reuse the same `clientSetId`, so the server returns the stored set
  (200, `created: false`) instead of a second one. Changed reps get a new id.
- **Target reached:**
  - the exercise is COMPLETED and "Ziel erreicht" is shown;
  - the input card disappears and no new set opens;
  - the server answers 409 to any further set.
- **Double tap:** one request (`_savingSetFor` guard plus the disabled button).
- **App restart:** the sets are read back from `GET /current`.
- **Older API without `totalReps`:** the Sprint 2 single-field flow ("Übung abschließen") stays.

## Engine 2 — Core-Routine (interval)

- **Values come from the API** (`timer.interval`). Defaults 5/40/20 apply only to empty values.
  Coach values (e.g. 3 × 30/15) are used as given.
- **Plan:** WORK, REST, WORK, … WORK, with no rest after the last round.
  5 × 40/20 = 9 phases = **280 s**.
- **`IntervalRunner` runs on absolute times:**
  - each phase starts at the previous phase's absolute end, never at "now", so there is no drift;
  - `sync()` jumps over every phase that ended (one call after any time in the background);
  - it returns the rounds whose WORK phase ended. Each round is reported once.
- **The screen owns the phase logic:** a 250 ms ticker calls `sync()`, plus a sync on app resume.
  So rounds are stored even while another exercise is shown. The panel only repaints.
- **Rounds:** every finished round is `PATCH …/sets/n {completed: true, actualDurationSeconds}`.
  - The API keeps the first `completedAt`, so a duplicate report does not complete a round twice.
  - A failed round stays visible as "x Runden sind noch nicht gespeichert" with
    "Runden speichern". **An unsaved round is never shown as saved.**
- **Pause** freezes the current phase; **resume** continues it and later phases move with it.
- **Cancel** stops the run. Stored rounds stay, and "Ab Runde n starten" continues from the
  first open round.
- **Only one Core routine** runs at a time.
- **Older API without round rows:** generic controls stay.

## One timer model

All timers use the same `Countdown` (absolute `endsAt`, no tick counting):

| Engine | Timer |
| --- | --- |
| Warm-up checklist | none |
| Strength | manual rest ("Pause starten") — unchanged from Sprint 5 |
| Total reps | automatic rest after a stored set |
| Core | automatic interval phases |

Every test uses a fake clock, with no real waiting.

## Persistence and restoration

- A running or paused Core routine is saved in platform secure storage
  (`vitruv.workout.interval.v1`, ids and times only; no plain files). It is saved on every
  state change and cleared when it finishes, is cancelled or the workout is left.
- **After an app kill**, the saved routine is restored from its absolute times. Rounds that
  ended in between are stored once: only rows that are still open on the server.
- It is dropped when the session, exercise or config differs, or when it ended more than
  10 minutes ago.
- Total-reps sets need no local state; they live on the server.

## Watch (Dart side only — native watch app is Sprint 5.5)

- The Total-reps rest goes to the bridge as kind `totalRepsRest`. Core phases go as kind
  `interval`, phase `work` / `rest`.
- Every phase is a new countdown run with a new `timerId`. A watch command for an earlier phase
  or another session is stale and ignored.
- Messages are sent only on state changes, not per second.
- The flag stays off by default, and no native WatchConnectivity code exists. The fake bridge in
  the tests is the reference receiver.

## Notifications

- **Total reps:** the existing rest-end notification at the absolute end, scheduled only after
  the stored set.
- **Core:** one notification per upcoming phase change (work→rest, rest→work, final "Training
  abgeschlossen").
  - The series is scheduled at start, resume or restore, and cancelled on pause, cancel or leave.
  - A new series first clears the whole id range, which also removes a series left by a killed
    app.
- No permission: the plugin call fails quietly and nothing crashes.
- Not verified on a device (see test results).

## Feature flag, capability, security

- **`TRAINING_EXTENDED_TYPES` stays OFF** in production. With the flag off, an INTERVAL template
  is refused (409) and TOTAL_REPS still works (PG test 31). ON only in the isolated tests.
- **`X-Vitruv-App-Capability: 2` stays informational**, never a security decision.
- **Client self context only:**
  - another client's set or round → 404 (PG test 30);
  - a write to a completed session → 409, and restarting a completed day → 409 (PG test 29+38);
  - COACH/ADMIN have no mobile workout access (unchanged).

## Design

- Tokens only: `VitruvSpace`, `VitruvTheme` colours, text theme; no hex values.
- German UI with English fallback.
- **Big digits:** `displayMedium`, tabular figures, `FittedBox` scale-down.
- **WORK and REST differ** by card tone, colour, label, icon and badge, never by colour alone.
- **VoiceOver:**
  - one label per countdown ("TRAINING, Runde 1 von 5, noch 00:40");
  - digits are excluded so they are not read every second;
  - an assertive announcement at each phase change, plus haptics.
- 320 px with 200 % text: no overflow (widget tests). The round header wraps instead of
  overflowing (bug found and fixed by the test).
