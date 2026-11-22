# iOS Training — Sprint 4 test results

Date: 2026-11-22 · Branch `feature/ios-training` · Windows 11 · Flutter (stable, `C:/src/flutter`)

No production system was contacted. PG tests ran on the Sprint 2.5 fail-closed isolated
PostgreSQL 18.6 (`127.0.0.1:55433`, `vitruv_it_*`), never on Neon.

## Totals

| Suite                       | Result                      | Baseline                    |
| --------------------------- | --------------------------- | --------------------------- |
| `flutter analyze`           | No issues found             | clean                       |
| `flutter test`              | **293 / 293** passed        | 260 (+33 new)               |
| `packages/design-tokens`    | 106 / 106                   | 106                         |
| `apps/web`                  | 295 / 295                   | 295                         |
| `apps/api` unit             | 244 / 244                   | —                           |
| `packages/contracts`        | 108 / 108                   | —                           |
| `packages/shared`           | 41 / 41                     | —                           |
| `packages/db` unit          | 23 / 23                     | —                           |
| `packages/db` test:pg       | 15 / 15                     | —                           |
| `apps/api` test:pg          | 143 passed, 1 skipped (144) | incl. 11 new Sprint 4 tests |
| `apps/api` lint + typecheck | clean                       | —                           |

The one skipped PG test is the pre-existing `health-db.int.test.ts` ("GET /health/db against
Neon"), which by design only runs against Neon. No test was deleted or newly skipped.

Existing tests adapted (not removed): `workout_flow_test.dart` status label "Läuft" → "In
Bearbeitung"; `training_flow_test.dart` two Home tests rewritten for the new weekly plan
("Heute" badge only with a real start date; undated plan shows no invented date).

New test files:

- `apps/mobile/test/features/training_schedule_test.dart` — 11 unit tests (dates, DST, schedule, stats, next workout, `canPlayVideo`, enums)
- `apps/mobile/test/features/sprint4_home_test.dart` — 22 widget tests against the fake API (incl. 5 responsive sizes 320–768 dp, text scale 1–2)
- `apps/api/test/sprint4-client.pg.test.ts` — 11 tests on real PostgreSQL

## Scenario mapping (spec §14)

U = unit (`training_schedule_test`), W = widget/fake API (`sprint4_home_test`), PG = real PostgreSQL (`sprint4-client.pg.test`), A = existing auth tests.

| #   | Scenario                                    | Evidence                                                                                                         | Result                             |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Weekly plan loads from the API              | PG "1 + 3 + 26"; W "current week Mo–So…" (only `/training/active` requested)                                     | ✅                                 |
| 2   | Empty week shown correctly                  | W "previous / next week navigation" (7× "Kein Training geplant"), W "no active plan"                             | ✅                                 |
| 3   | Several workouts on one day                 | U "Monday…Sunday week…"; W (Wednesday: 2 cards); PG "1 + 3 + 26"                                                 | ✅                                 |
| 4   | Completed count correct                     | U stats (1 completed); W stats label                                                                             | ✅                                 |
| 5   | Pending count correct                       | U stats (3 open, running → in progress); W stats label                                                           | ✅                                 |
| 6   | Next training found                         | U "next workout = earliest open one…", "running day…", "without a start date…"; W                                | ✅                                 |
| 7   | Week switching works                        | W "previous / next week navigation"                                                                              | ✅                                 |
| 8   | No time-zone day shift                      | U "late in the evening…", "DST switch (2027-03-28)", "mid-week start"                                            | ✅                                 |
| 9   | Workout detail opens                        | W "date, type, status, warm-up preview and start button"                                                         | ✅                                 |
| 10  | Session starts                              | PG "10 + 13 + 14 + 15"; W `POST /v1/client/workouts`                                                             | ✅                                 |
| 11  | Unfinished session resumes                  | PG "11 + 17 + 19"; existing W "app restart resumes the IN_PROGRESS workout"                                      | ✅                                 |
| 12  | Completed workout not restarted by accident | W "a completed workout cannot be started again" (disabled, no POST); PG "12"                                     | ✅ (UI guard — see remaining work) |
| 13  | Warm-up items in order                      | W "items with checkbox… coach order"; PG "10 + 13 + 14 + 15"                                                     | ✅                                 |
| 14  | Warm-up shows no timer                      | W (no "Timer starten", no "Pause"); PG (no duration/rest targets)                                                | ✅                                 |
| 15  | Warm-up asks for no input                   | W (no TextField); PG (values → 400)                                                                              | ✅                                 |
| 16  | Warm-up completion stored                   | W "tick saves via the API…" (`{status: COMPLETED}`); PG "16 + 18"                                                | ✅                                 |
| 17  | Completion kept after app restart           | W "ticks survive an app restart" (fresh ProviderScope); PG "11 + 17 + 19"                                        | ✅                                 |
| 18  | Duplicate completion → no double record     | PG "16 + 18" (same row, same `completedAt`)                                                                      | ✅                                 |
| 19  | Continue to the next section after Warm-up  | W "all ticked → … continue", "warm-up-only … Training abschließen"; PG                                           | ✅                                 |
| 20  | No video → UI fine                          | W (no "Video ansehen" without media); W "WebM on iOS does not crash"; U `canPlayVideo`                           | ✅                                 |
| 21  | Network timeout handled                     | W "timeout: German network message, retry loads the plan"; W "failed save is rolled back"; W "409 … rolled back" | ✅                                 |
| 22  | Expired token refresh                       | W "expired session token: pull to refresh renews…"; A `sprint1_auth_test` T5, `refresh_concurrency_test`         | ✅                                 |
| 23  | Client A cannot see B's workout             | PG "23" (404)                                                                                                    | ✅                                 |
| 24  | COACH/ADMIN blocked on mobile               | PG "24" (COACH 403, ADMIN 404); A `sprint1_auth_test` T8/T9 (login refused)                                      | ✅ (ADMIN answer is 404, not 403)  |
| 25  | Flag OFF keeps extended types closed        | PG "25" (409)                                                                                                    | ✅                                 |
| 26  | Flag ON (isolated) Warm-up checklist works  | PG "1 + 3 + 26", "10 + 13 + 14 + 15", "16 + 18", "11 + 17 + 19" (flag ON only in the isolated test app)          | ✅                                 |
| 27  | Legacy `client_plans` never executable      | PG "27"; W (no `/training/plan` request); W legacy one-by-one screen                                             | ✅                                 |
| 28  | Old mobile contracts kept                   | PG "28"; W "legacy warm-up without execution type…"; all 260 earlier Flutter tests green                         | ✅                                 |

## Found and fixed during testing

- RenderFlex overflow when all Warm-up items were ticked (title + "Aufwärmen abgeschlossen" badge
  in a Row) → header is now a `Wrap`.
- Earlier in the sprint: fixed-width status badges overflowing at 320 dp × 1.5/2.0 → badges moved
  under the meta row / into `Wrap`s; week navigation stacks below 360 logical dp.

## Not tested (impossible or out of scope here)

- **iOS build / real iPhone:** impossible on Windows (needs macOS + Xcode). No device test.
- Real-browser E2E: not part of this sprint (release blocker).
- Production / Neon: intentionally not touched.
