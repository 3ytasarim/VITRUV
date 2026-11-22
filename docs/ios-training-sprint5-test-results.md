# iOS Training — Sprint 5 test results

Date: 2026-11-23 · Branch `feature/ios-training` · Windows 11 · Flutter (stable, `C:/src/flutter`)

No production system was contacted, no migration was run, nothing was pushed or deployed. PG tests
ran on the Sprint 2.5 fail-closed isolated PostgreSQL 18.6 (`127.0.0.1:55433`, `vitruv_it_*`),
never on Neon. `test:integration` (which would use the project `.env`) was NOT run.

## Totals

| Suite                       | Result                      | Sprint 4 baseline           |
| --------------------------- | --------------------------- | --------------------------- |
| `flutter analyze`           | No issues found             | clean                       |
| `flutter test`              | **329 / 329** passed        | 316 (after 02eff9e) → +13   |
| `flutter build apk --debug` | built (`app-debug.apk`)     | —                           |
| `apps/api` unit             | 244 / 244                   | 244                         |
| `apps/api` test:pg          | 143 passed, 1 skipped (144) | 143 passed, 1 skipped (144) |
| `packages/db` unit          | 23 / 23                     | 23                          |
| `packages/db` test:pg       | 15 / 15                     | 15                          |
| `packages/contracts`        | 108 / 108                   | 108                         |
| `packages/shared`           | 41 / 41                     | 41                          |
| `packages/design-tokens`    | 106 / 106                   | 106                         |
| `apps/web`                  | 295 / 295                   | 295                         |
| `pnpm -r lint`, `typecheck` | clean                       | clean                       |
| `pnpm -r build`             | passes (see note)           | —                           |

The skipped PG test is the pre-existing `health-db.int.test.ts` ("GET /health/db against Neon"),
which by design only runs against Neon. No test was deleted or newly skipped.

## New tests — `apps/mobile/test/features/sprint5_strength_test.dart` (13)

Fictional plan "Kraft" (fake backend): Mo "Oberkörper" (Bankdrücken 3 × 10, rest 90; Klimmzüge
3 × MAX, rest 120), Th "Unterkörper" (Kniebeugen 4 × 8, rest 120; Ausfallschritte 3 × 12, rest 60).

| Group                  | Test                                                              | Checklist |
| ---------------------- | ----------------------------------------------------------------- | --------- |
| Oberkörper: fixed reps | each set stores the reps actually done; prefilled with the target | 1, 3      |
|                        | a later set waits for the open one (no skipping ahead)            | 1         |
| MAX                    | MAX target is shown, starts empty and requires the reps           | 4         |
| rest timer (manual)    | completing a set never starts the rest; "Pause starten" does      | 5         |
|                        | background → foreground: the remaining time is correct            | 6         |
|                        | end of rest: visual signal; the notification is not withdrawn     | 7         |
|                        | "+30 Sek." reschedules, pause and skip cancel the notification    | 7         |
|                        | app killed during the rest → restored from the saved end time     | 8         |
|                        | a rest of another session or one long over is not restored        | 8         |
|                        | leaving the workout discards the rest and its notification        | 7, 8      |
| Unterkörper → history  | all sets recorded, completed, history shows the real reps         | 2, 3, 10  |
|                        | history shows MAX results and open sets                           | 4, 10     |
| completed day          | the server refuses a second start; the app explains and refreshes | 9         |

Checklist 11 (Watch bridge): `test/features/watch_timer_flow_test.dart` (adapted to the manual
rest) passes — the watch gets no timer after a set, and receives it after "Pause starten".
Checklist 9 on the API: `apps/api/test/workouts.int.test.ts` (abandoned day restarts with the new
plan; completed day → 409, two rows) and `apps/api/test/workouts-v2.pg.test.ts` (completed day →
409, no second row; legacy completed day → 409), both on the isolated PostgreSQL.
Checklist 3 on the API: the existing PG test "strength: upper body sets and lower body MAX record
per-set actuals (persisted)" (unchanged, passes).

## Adapted tests (not removed)

- Flutter: `workout_flow_test.dart`, `watch_timer_flow_test.dart`, `screens_responsive_test.dart`
  — the rest now starts with "Pause starten" instead of automatically after a set.
- API: three tests that restarted a completed day (see the implementation doc). Their intent is
  kept; the restart itself is now asserted as 409.

## Environment notes

- `pnpm -r build`: api built; the web compiled, then `next build` stopped once with a Next.js
  16.4.1 security advisory (known release blocker, no upgrade done in this sprint). The retry of
  `pnpm --filter @vitruv/web build` completed (exit 0).

- APK: the first builds failed with "Unable to establish loopback connection" (Gradle/Java with
  the non-ASCII user temp path). Built with `TEMP`/`TMP` = `D:\dev-cache\tmp` and
  `JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=D:\dev-cache\tmp`. `flutter_local_notifications` 23.x
  needed compileSdk 37 (unsupported by AGP 9.1.0) → pinned to 22.3.2, which builds.
- The isolated PostgreSQL crashed once under Windows (autovacuum worker 0xC0000142, then
  "could not reserve shared memory region", error 487). After a restart the full suites passed.
  Not related to the code.

## Not tested (cannot be tested here)

iOS build, iOS notifications, Keychain restore, real devices, VoiceOver/TalkBack, Apple Watch —
see `ios-training-sprint5-remaining-work.md`.
