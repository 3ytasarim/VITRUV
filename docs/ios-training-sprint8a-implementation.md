# iOS Training — Sprint 8A: Implementation

Status 2026-11-23 · branch `feature/ios-training` (local, not pushed) · base 830a7b4 (Sprint 7.5,
kept with 4b3e2d1, 17bc551, 4f9cd9b, 72a9490).

## Commits

| Commit | Scope |
|---|---|
| 1252bb4 | feat(api): private training media — signer, viewer context, authorisation, delivery (Range) + renewal routes, DTOs, upload visibility, env, contracts (`MEDIA_URL_EXPIRED`, `trainingMediaUrlSchema`), 10 unit + 14 PG tests |
| 9a32e97 | feat(web): `PRIVATE_MEDIA_ORIGINS` in CSP img/media-src; private thumbnails as plain `<img>` (no `/_next/image` proxying of signed URLs), `no-referrer` |
| 657052a | feat(mobile): signed URL renewal in the player (proactive + once after failure, resume position); release builds fail closed on API config |
| 33db674 | fix(web): the save confirmation did not survive the remount — editor keyed by version lost its success message after `router.refresh()` (found by E2E) |
| 4acd3aa | test(e2e): private media flows (steps 18–22); confirm dialogs and plan activation awaited |
| c9b06b3 | test(api): App Review demo client recipe (isolated) |
| (docs) | the five Sprint 8A documents |

## What changed, by area

**API** — see `ios-training-sprint8a-private-media.md` §1. `MediaUrlResolver.assetUrl()` is the
single place that decides public vs signed vs none; every training DTO (exercise, plan, program,
workout session, welcome video, admin media) uses it, so no code path can hand out an unsigned
private storage URL. The previous `visibility = 'PUBLIC'` filters on training media were removed
(they would have hidden private videos), replaced by `assetUrl()` returning `null` when no URL is
allowed. Website uploads remain PUBLIC regardless of configuration.

**Web** — CSP extension only for the configured private origins; private images bypass the Next
image optimiser (it would fetch and cache the signed URL server-side).

**Mobile** — `MediaUrlRenewal` + `mediaUrlRenewerProvider`; `_ExerciseVideo` became a
`ConsumerStatefulWidget` with a loop-based open (no recursion race). `AppConfig.resolve` +
`deployedApiUrlProblem` + check in `main()` before `runApp`.

**Not changed (by rule):** migrations 0022–0025 (no new migration), production env/storage, flags,
Watch code, training engines (all four engines covered by the unchanged Flutter regression suite).

## Decisions

- TTL 900 s with window rounding (stable URLs) instead of the 2 h sketched in Sprint 7.5: shorter
  exposure, renewal makes the length irrelevant for the user.
- Signed delivery through the API (not a bare S3 presign in DTOs): lets the API re-check
  authorisation on every Range request and works identically for local and S3 storage.
- Coaches/admins: library-wide view (same as the existing library permission).
- Account deletion: documented, not built (no account creation in the app; legal decisions open)
  — `apple-readiness.md` §3.
- Production API URL: not guessed; the release build refuses to start without a valid one.
