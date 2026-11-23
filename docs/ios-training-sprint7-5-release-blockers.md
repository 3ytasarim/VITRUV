# iOS Training — Sprint 7.5 Release Blockers

Status 2026-11-23 after Sprint 7.5. **Not release-ready.** Nothing was pushed, deployed or migrated.

| # | Blocker | Status | Evidence / what is left |
|---|---|---|---|
| 1 | Next.js advisories (7, incl. build `SecurityFatalError`) | ✅ **resolved** | next 16.4.6; clean build first try (security doc §1–2) |
| 2 | Hono advisories (5) | ✅ **resolved** | hono 4.13.20 + route sweep / path-spelling tests |
| 3 | @hono/node-server advisories (2) | ✅ **resolved** | 2.1.11 + raw-socket backslash test |
| 4 | minimatch / happy-dom (dev) | ✅ **resolved** | via typescript-eslint 8.73.0 / happy-dom 21.0.4, no overrides |
| 5 | esbuild (2, dev only) | ⚠️ **accepted, open** | dev-server-only advisories in drizzle-kit / tsup toolchains; `pnpm audit --prod` clean |
| 6 | Production "Forbidden: invalid request origin" | ⚠️ **diagnosable, config fix open** | code check stays strict; diagnostic log added; owner must set the canonical `PUBLIC_SITE_URL` + host redirect on the server |
| 7 | Template edit in the web admin broken | ✅ **fixed** (17bc551) | found by E2E |
| 8 | Network failures leave coach dialogs stuck | ✅ **fixed** (17bc551) | found by E2E |
| 9 | Real-browser coach E2E | ✅ **done locally** | 18/18 flag OFF + 18/18 flag ON (isolated) |
| 10 | Migrations 0022–0025 on Neon | ❌ **open — owner approval** | validated locally incl. volume, idempotency, atomicity, locks; runbook in the migration doc |
| 11 | **Training video access control** | ❌ **open — release blocker** | design below; not implemented (needs storage migration) |
| 12 | Real iPhone playback (H.264/AAC, Range, CDN) | ❌ **open** | Windows cannot test AVPlayer |
| 13 | iOS / macOS build, signing, TestFlight | ❌ **open** | needs macOS + Xcode |
| 14 | Apple Watch | ❌ **open** | fake transport only |
| 15 | `TRAINING_EXTENDED_TYPES` rollout | ⏸ **OFF** (correct) | ON tested only on the isolated E2E API; switch on only when every active client runs an app with capability ≥ 2 (existing policy) |
| 16 | Flutter regression gaps from Sprint 7 (restart, same day, time zone) | ✅ **closed** | `sprint7_5_regressions_test.dart` (7) |
| 17 | Coach refresh without stale cache | ✅ **covered** | E2E rows 10–11 (server-rendered pages, fresh data after the participant finished) |

## Training video access control — design (blocker 11)

**Today.** Training videos are `PUBLIC` media assets: unsigned object-storage URLs, no auth header
(needed by AVPlayer). Anyone with a URL can watch the file; URLs appear in API responses of
authorised users only, but they never expire. Website media are public by design and must stay so.

**Why not implemented in this sprint.** A safe change needs (a) moving existing training objects
from the public to the private bucket (production storage — needs owner approval and the
`storage:migrate` tooling), (b) an app release that refreshes expired URLs, and (c) a CDN decision
for Range requests. A partial switch would break every installed app. No limited, backward-
compatible change exists without touching production storage.

**Target design.**
1. New uploads with purpose `TRAINING_VIDEO` / `TRAINING_IMAGE` → `PRIVATE` visibility (private
   bucket), as nutrition PDFs already are.
2. Read path: workout/session/template responses keep `media.assetId` + metadata and get a
   **short-lived signed URL** (S3 presign, `GetObject` — Range works because the signature is in
   the query string; AVPlayer needs no header). TTL ~ 2 h for videos (longer than any video,
   short enough to stop sharing), separate from `PRIVATE_URL_TTL_SECONDS` (60 s, PDFs).
3. Authorisation before signing (reuse the existing scoping): CLIENT — the asset is referenced by
   their own session snapshot, their active plan's assignment, or a library exercise used in it;
   COACH — library asset or an asset of an assigned client's plan; ADMIN — all. Otherwise 404.
4. Expiry handling: app requests `GET /v1/client/media/:assetId/url` (authorised, rate-limited)
   when the player reports 403/expired; the web admin reloads the page data.
5. Compatibility: old app versions keep receiving public URLs until the migration of existing
   objects; capability flag for "signed media" so the API knows which client can refresh.
6. Migration: copy objects public → private (`storage:migrate`, report per key), flip
   `visibility`, keep public copies until all apps ≥ the refreshing version, then delete them (owner
   approval, destructive).
7. Tests: unauthorised client/coach → 404; expired URL → refresh works; Range request on a signed
   URL (S3/MinIO integration, isolated); website media unchanged and public.

## Sprint 8 candidates (owner decides)

1. Neon migration 0022–0025 with the runbook (owner-run or owner-approved).
2. Video access control (design above) incl. storage migration plan.
3. Real-device iPhone run (playback, Range, VoiceOver) + macOS build.
4. Server config fix for the origin issue (`PUBLIC_SITE_URL`, host redirect).
5. Flag rollout plan once app capability ≥ 2 is everywhere.
