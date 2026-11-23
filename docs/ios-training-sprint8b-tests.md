# iOS Training — Sprint 8B: Test Results

Run 2026-11-23 on Windows (MINGW64), branch `feature/ios-training` at the Sprint 8B code commits
(2c08a30..2c4c58d). PostgreSQL tests ran **only** on the isolated local cluster (embedded
PostgreSQL 18.6, `127.0.0.1:55433`) — never Neon. `test:integration` was not run (root `.env` =
production).

## 1. Gates

| Gate | Result | Baseline 8A | Δ |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ no lockfile change | — | |
| `pnpm -r lint` | ✅ | ✅ | |
| `pnpm -r typecheck` | ✅ | ✅ | |
| `pnpm -r build` (incl. Next production build) | ✅ no `SecurityFatalError` | ✅ | |
| `pnpm audit --prod` | ✅ no known vulnerabilities | ✅ | |
| Design tokens | ✅ 106 | 106 | 0 |
| Shared | ✅ 62 | 54 | +8 (app-version parsing/evaluation) |
| Contracts | ✅ 113 | 113 | 0 |
| DB unit | ✅ 24 | 24 | 0 |
| API unit | ✅ 267 | 265 | +2 (env parsing of the version settings) |
| Web | ✅ 326 | 326 | 0 |
| API PG (isolated) | ✅ 198 passed + 1 skipped | 181 + 1 | +17 (7 version gate, 10 media privatize) |
| DB PG (isolated) | ✅ 29 | 29 | 0 |
| Real-browser E2E, `TRAINING_EXTENDED_TYPES` OFF | ✅ 23/23 (after `--build`) | 23/23 | |
| Real-browser E2E, flag ON | ✅ 23/23 | 23/23 | |
| `flutter analyze` | ✅ no issues | ✅ | |
| `flutter test` | ✅ 456 passed | 436 | +20 |

Flutter +20 = 5 hidden-nutrition + 7 app-version/update-screen + 8 iOS audit/preflight.

## 2. New tests and what they prove

- `apps/mobile/test/features/sprint8b_hidden_nutrition_test.dart` — 4 tabs without flag; deep
  link `/ernaehrung` → `/heute` (signed in) / `/login` (signed out); flag on restores the tab.
- `apps/mobile/test/features/sprint8b_app_version_test.dart` — headers sent; 426 → update screen;
  retry after the server lowers the minimum returns to the app **still signed in**; 320 px / 200 %.
- `apps/mobile/test/release/ios_release_preflight_test.dart` — source audit of Info.plist,
  pbxproj, privacy manifest; documentation-mode blockers = bundle id, Team, export compliance.
- `packages/shared/src/app-version.test.ts` — strict version parsing, malformed never blocks.
- `apps/api/test/sprint8b-app-version.pg.test.ts` — real logins: mobile below minimum → 426 with
  details, at/above → 200, web session never gated, auth/refresh/logout not gated, invalid token
  → 401, legacy header-less policy allow vs update_required, compatibility endpoint `no-store`.
- `apps/api/test/sprint8b-media-privatize.pg.test.ts` — runbook steps 1–10 on temp storage:
  inventory excludes website media, dry run changes nothing, corrupted copy detected (mutation
  check: disabling the checksum compare made 3 tests fail), flip, idempotency, signed Range
  playback, rollback + forward, original removal, denial checks, rollback refused after removal.
- 0026 proposal: behaviour checked on a throwaway isolated database (one open request per user,
  user deletion blocked); the temporary test was removed, the database dropped.

## 3. NOT TESTED (requires a Mac / iPhone / production systems)

| Item | Status |
|---|---|
| `flutter build ios` / `flutter build ipa`, Xcode archive, signing | NOT TESTED |
| Device plan A–F (`ios-training-sprint8b-apple-checklist.md` §8) | NOT TESTED |
| Dynamic Type / VoiceOver on a device | NOT TESTED (only Flutter text scale + semantics tests) |
| Real local notifications on iOS | NOT TESTED |
| Apple Watch | not built (interface only) |
| Neon migration rehearsal 0022–0025 | NOT DONE (no approval / no access) |
| nginx config against the real server | NOT TESTED (example + dry-run commands only) |
| Production storage privatization | NOT DONE (isolated rehearsal only) |
