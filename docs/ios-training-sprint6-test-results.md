# iOS Training — Sprint 6 test results

Date: 2026-11-23, Windows 11 (no macOS, no iPhone, no Apple Watch).

## Quality gates

| Gate | Result | Baseline before Sprint 6 |
| --- | --- | --- |
| `flutter analyze` | no issues | no issues |
| `flutter test` | **386 passed** | 329 |
| `flutter build apk --debug` | built (`TEMP`/`TMP` = `D:\dev-cache\tmp`) | built |
| iOS build | **not run** (needs macOS + Xcode) | not run |
| API lint + typecheck | clean | clean |
| API unit | 244 passed | 244 |
| API PG (isolated server, fail-closed) | **149 passed + 1 skipped** | 143 + 1 skipped |
| DB PG (isolated) | 15 passed | 15 |
| DB unit | 23 passed | — |
| Contracts | 108 passed | — |
| Shared | 41 passed | — |
| Web | 295 passed | 295 |
| Design tokens | 106 passed | 106 |
| `pnpm -r build` | passed | passed |

### PostgreSQL

- Ran only against the isolated local server: `127.0.0.1:55433`, embedded PostgreSQL 18.6,
  database `vitruv_it_*`.
- The server was stopped afterwards.
- No connection to Neon. `test:integration` was not run.

### Next.js build notice

- The first `next build` stopped with Next.js's own security-advisory notice (a known Next.js
  vulnerability; already listed as a release blocker).
- A plain retry built successfully.
- No upgrade was run (no large dependency upgrades without owner approval).

### Test counts

- No test was deleted or skipped.
- New: 26 Flutter unit tests, 31 Flutter widget tests and 6 API PG tests.
- The existing 329 Flutter tests still pass unchanged. They run against the older contract
  (fake backend `engines = false`), which doubles as the old-API compatibility check.

## Mapping to the Sprint 6 test list

Where the tests live:

- U = `test/workout/sprint6_engines_test.dart`
- W = `test/features/sprint6_engines_flow_test.dart`
- PG = `apps/api/test/sprint6-engines.pg.test.ts`
- S5 = existing Sprint 5 test

### Total reps (1–12)

| # | Covered by |
| --- | --- |
| 1 | W "1. target / done / open" — Gesamtziel, Bereits geschafft, Noch offen, Aktueller Satz |
| 2 | W "2+4" — POST with UUID clientSetId; the set appears only after the reply |
| 3 | U remaining math; W "3. unlimited sets", six sets until 60 |
| 4 | W "2+4" — automatic 60 s rest, notification at the absolute end |
| 5 | W "5. reps are required" — 0 or empty sends nothing |
| 6 | W "6+7" — API failure: no rest, no notification, entry kept |
| 7 | W "6+7" — retry with the same clientSetId → one set, one rest |
| 8 | W "8. reply lost" — server replay (200), one set, ONE rest |
| 9 | W "9" — changed reps → new id |
| 10 | W "10. double tap" — one request |
| 11 | W "11. app restart" — sets read back from the API |
| 12 | U overshoot; W "12. overshoot" (65 / 0, no rest); PG "12. overshoot" (stored unclipped, 409 afterwards) |

Also covered: the target reached → no rest after the last set and no new set (W "3"), history
lines (W "history"), and small screen + 200 % text (W).

### Core (13–26)

| # | Covered by |
| --- | --- |
| 13 | PG — 5 rows of 40 s from an INTERVAL without values; W — `timer.interval` from the API |
| 14 | U plan starts with WORK; W "13+14" — Runde 1 von 5, TRAINING, 00:40 |
| 15–16 | U automatic phase change; W "15+16+18" |
| 17 | U 280 s and 9 phases; PG plan 280 s; W "17+19+20" |
| 18 | W "15+16+18" — PAUSE, "Nächste Runde: Runde 2 von 5", round 1 stored with 40 s |
| 19 | U no rest after the last round; W no PAUSE after round 5 |
| 20 | W — exercise COMPLETED, "Training abgeschlossen"; PG rounds 3–5 → COMPLETED |
| 21 | U and W pause/resume (paused: no series; resume: new series) |
| 22 | W "22+23" — a failed round is never shown as saved, then retry |
| 23 | PG "23+24+22" — a repeated round keeps the identical row and `completedAt` |
| 24 | W "24" — cancel keeps rounds, "Ab Runde 2 starten"; PG round 6 → 404 |
| 25 | U one sync after 130 s; W "25. background 130 s" |
| 26 | U restore from a saved state; W "26. app kill" — restored, missed round stored once; W stale state of another session dropped |

Also covered: the notification series (titles, bodies, absolute times, cancelled on leave) and
small screen + 200 % text.

### Regression (27–40)

| # | Covered by |
| --- | --- |
| 27 | W composition: Strength set → no rest, "Pause starten · 01:30" starts it; S5 suite unchanged |
| 28 | W warm-up helper asserts no timer, no notification and no series |
| 29 | PG "29+38" — restart a completed day → 409; S5 "completed day" (app) |
| 30 | PG "30" — client B → 404 on set and round writes |
| 31 | PG "31. flag OFF" — INTERVAL template 409, TOTAL_REPS-only 201 |
| 32 | PG "32+39…" with the flag ON (isolated) — modes and timers in coach order |
| 33 | U and W notifications |
| 34 | W "34" — without a watch transport everything runs on the phone |
| 35 | W "35" — Total-reps rest on the fake watch only after the stored set |
| 36 | W "36" — Core phases on the fake watch; nothing sent without a change |
| 37 | W "37" — stale command of an earlier phase ignored; current one cancels |
| 38 | PG "29+38" — set on a completed session → 409 |
| 39 | W "27+28+39" — Warm-up → Strength → Total → Core, mode order |
| 40 | W "40" — older API: single-field Total reps, generic INTERVAL; all 329 legacy tests |

Capability level stays 2: W.

## Not tested (no hardware)

- iOS build, notification sound and timing on a locked iPhone, the permission prompt, Keychain
  restore after a reboot.
- Real background suspension.
- VoiceOver with a real screen reader.
- The native Apple Watch app (does not exist).
- No device test of any kind.
