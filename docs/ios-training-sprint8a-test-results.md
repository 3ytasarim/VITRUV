# iOS Training — Sprint 8A: Test Results

Run 2026-11-23 on Windows 11, isolated PostgreSQL 18.6 (`127.0.0.1:55433`, cluster checked by
`assertIsolatedServer`), local storage driver, never Neon, never production. No test was skipped
or deleted (the 1 skipped API PG test is the pre-existing one from earlier sprints).

## Totals vs. Sprint 7.5 baseline

| Suite | Baseline | Sprint 8A | New |
|---|---|---|---|
| Flutter | 420 | **436** | +11 private media/renewal/player, +5 release config |
| Web (vitest) | 323 | **326** | +2 private thumbnails, +1 CSP private origins |
| API unit | 255 | **265** | +10 signer/resolver/env |
| API PG | 165 + 1 skipped | **181 + 1 skipped** | +14 private media, +2 review demo |
| DB PG | 29 | **29** | — |
| DB unit | 24 | 24 | — |
| Contracts | 113 | 113 | — |
| Shared | 54 | 54 | — |
| Tokens | 106 | 106 | — |
| E2E (real Chromium) | 18/18 + 18/18 | **23/23 flag OFF + 23/23 flag ON** | steps 18–22 |

Gates: frozen install ✅ · `-r lint` ✅ · `-r typecheck` ✅ · `-r test` ✅ · `-r build` ✅ (no
`SecurityFatalError`) · `flutter analyze` no issues · `pnpm audit --prod` no known vulnerabilities.

## E2E steps added

| Step | Checks |
|---|---|
| 18 | Coach uploads an MP4 in the browser (exercise form → media dialog) → asset `PRIVATE`, exercise DTO has a signed `/v1/media/training/…?u=&e=&s=` URL |
| 19 | Browser `<video>` loads it from the protected route: 200/206 + `Accept-Ranges: bytes`, no CSP violation |
| 20 | Full GET byte count, `Cache-Control: private, no-store`; Range seek in the middle byte-exact (206, `Content-Range`); unsigned / other user / longer expiry / expired → 403; storage key not reachable via the public route (404) |
| 21 | Coach renewal works and plays; client without reference → 404; client token on admin renewal → 403; anonymous → 401 |
| 22 | Website upload as admin stays PUBLIC, served without signature, cacheable |

Limits: Playwright's Chromium has no H.264 decoder — step 19 proves the request path (Range,
CSP, auth), not decoding. Real decoding/seek in AVPlayer = Mac/iPhone stage.

## Defects found and fixed during the sprint

1. **Save confirmation vanished** (web, existing since the editor is keyed by version): after a
   successful save `router.refresh()` remounted the editor and dropped the success message;
   timing-dependent, made E2E steps 6 and 14 flaky. Fixed in 33db674.
2. E2E race: confirm dialogs were counted before they opened, and step 8 navigated away before
   the activation server action finished → awaited (4acd3aa). Steps 9–11, 13, 16 were cascades.
3. `MEDIA_URL_EXPIRED` missing from the contracts error-code union (fixed before commit).

## Mutation check

`canViewTrainingAsset` forced to `true` → 4 PG tests failed; restored, grep-verified.

## Not tested (needs other hardware / owner)

Real iPhone (AVPlayer playback, seek, 302 to S3, renewal after background), iPad layout, macOS
build/signing/TestFlight, Apple Watch, Neon migration rehearsal, S3/MinIO Range through the 302
redirect, production API URL.
