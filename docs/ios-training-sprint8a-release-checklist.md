# iOS Training — Sprint 8A: Release Candidate Checklist

Status 2026-11-23. **Not release-ready.** This is the order of operations for the owner. Nothing
in it was executed against production: no deploy, no Neon connection, no migration, no storage
move, no push, no flag switched, no App Store upload.

## 1. Gates (local, Sprint 8A — all green)

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ no lockfile change, no upgrades |
| `pnpm -r lint` / `typecheck` | ✅ |
| `pnpm -r --workspace-concurrency=1 test` | ✅ Tokens 106 · Shared 54 · Contracts 113 · DB unit 24 · API 265 · Web 326 |
| `pnpm -r build` (incl. Next production build) | ✅ no `SecurityFatalError` |
| API PG (isolated cluster) | ✅ 181 passed + 1 skipped |
| DB PG (isolated cluster) | ✅ 29 |
| Real-browser E2E (isolated) | ✅ 23/23 flag OFF · 23/23 flag ON |
| `flutter pub get` / `analyze` / `test` | ✅ no issues · 436 passed |
| `pnpm audit --prod` | ✅ no known vulnerabilities (2 dev-only esbuild advisories remain accepted, Sprint 7.5 blocker 5) |

## 2. Database 0022–0025 — runbook update

The runbook in `ios-training-sprint7-5-migration-validation.md` §5 stays valid; Sprint 8A adds
**no migration** (26 recorded migrations locally = 0000–0025; files 0022–0025 unchanged —
`git diff 830a7b4 -- packages/db/migrations` is empty). Additions:

- Sprint 8A code works on the migrated schema **and** reads `media_assets.visibility`/`purpose`
  that exist since earlier migrations — no new column needed.
- Order: migrate (owner, runbook) → deploy API → deploy web → app release. Flag stays OFF.
- Account deletion (if chosen) would need **0026** (new `auth_events` type) — not created.

## 3. Deploy order (owner)

1. Neon: preconditions + backup branch + `pnpm db:migrate` per runbook (direct host, lock timeout).
2. API with env: `TRAINING_MEDIA_VISIBILITY=PUBLIC`, new secret `MEDIA_URL_SIGNING_KEY` (≥ 32
   random chars, secret manager, never in git), optional `TRAINING_MEDIA_URL_TTL_SECONDS=900`,
   `TRAINING_EXTENDED_TYPES=disabled`.
3. Web with `PRIVATE_MEDIA_ORIGINS=<API origin>[ <private bucket origin>]`. Also the open
   Sprint 7.5 config fix: canonical `PUBLIC_SITE_URL` + host redirect.
4. nginx: drop query strings from access logs for `/v1/media/training/`; CDN must not cache it.
5. Smoke test with a **test** coach/client: login, library, plan, video plays, history.
6. App: build with the dart-defines (`apple-readiness.md` §4) → TestFlight → review.
7. Private media stage 1 step C (`TRAINING_MEDIA_VISIBILITY=PRIVATE`) after the app with renewal
   is live; stage 2 (D–G) only with explicit owner approval (`private-media.md` §6).

## 4. Flags + capability-2 compatibility

| Server \ App | App capability 1 (old builds) | App capability 2 (Sprint 4+ builds, incl. 8A) |
|---|---|---|
| `TRAINING_EXTENDED_TYPES=disabled` (production) | ✅ only capability-1 types exist | ✅ |
| `TRAINING_EXTENDED_TYPES=enabled` | ❌ an old app cannot show INTERVAL/CHECKLIST/MAX workouts (unknown session mode → error for that workout) | ✅ |

- The app sends `X-Vitruv-App-Capability: 2`, but the API **does not evaluate it** (no reliable
  per-device version; `capabilities.ts`). The flag is therefore global and may only be enabled
  once capability 2 is the **enforced minimum app version**. (Optional Sprint 8B: log/collect the
  header per session to measure adoption before switching.)
- Minimum version for the flag: the first store build with `kTrainingCapabilityLevel = 2`
  (current code) — and, for private media stage 2, the build with URL renewal (657052a).
- Rollout: (1) release app → (2) enforce it as minimum version (store / update notice) and
  confirm with the coaches that every active client updated → (3) enable the flag in a quiet
  window → (4) coach creates the first extended workout for a test client.
- Rollback: set `TRAINING_EXTENDED_TYPES=disabled`; existing extended workouts stay stored, the
  editor no longer offers the types; nothing is deleted.
- `VITRUV_WATCH_TIMER_SYNC`: compile-time, OFF; never passed to release builds.

## 5. Rollback

| Change | Rollback |
|---|---|
| API/web deploy | previous build; Sprint 8A has no schema change |
| `TRAINING_MEDIA_VISIBILITY=PRIVATE` | back to `PUBLIC` (private new uploads stay signed and working) |
| Visibility flip (stage 2 F) | flip back — public copies exist until G |
| Public copy deletion (G) | only storage backup/versioning — last, separate approval |
| Migration 0022–0025 | roll forward (0026+); data restore via the pre-run branch (owner) |

## 6. No-go (any one blocks the release)

1. Bundle id and Team ID not set by the owner.
2. Production API URL not decided (the release build refuses to start without it — by design).
3. Privacy policy URL missing (website Datenschutz page removed).
4. No real-iPhone test of login, workout, notifications and **signed video playback with seek and
   renewal**.
5. 0022–0025 not applied on Neon (runbook) while the API build expects them.
6. `MEDIA_URL_SIGNING_KEY` missing while any training asset is PRIVATE (startup fails — by design).
7. Placeholder "Ernährung" tab not decided (review risk).
8. Demo account not created on the review environment.
