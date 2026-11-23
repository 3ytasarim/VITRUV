# iOS Training — Sprint 8A: Private Training Media

Status 2026-11-23. Code implemented and tested locally (isolated PostgreSQL, local storage driver,
real-browser E2E). **Nothing deployed, no production storage touched, no production file moved
or deleted.** Production default stays `TRAINING_MEDIA_VISIBILITY=PUBLIC` — behaviour unchanged
until the owner runs the migration plan (§6).

Replaces the design sketch of `ios-training-sprint7-5-release-blockers.md` (blocker 11).

## 1. Architecture

```
App / web admin ── GET plan/session/template (Bearer) ──► API
                    media.url = https://API/v1/media/training/<assetId>?u=<viewer>&e=<exp>&s=<sig>
AVPlayer / <video> ── GET (+ Range, no Bearer) ──────────► /v1/media/training/:assetId
                    1. HMAC verify (no DB hit for forged URLs)
                    2. asset exists, purpose TRAINING_VIDEO, visibility PRIVATE
                    3. canViewTrainingAsset(viewer, asset)  — on EVERY request (each Range too)
                    4a. S3: 302 → presigned GET, TTL = min(remaining, 600 s)
                    4b. local driver: stream, 200 / 206 / 416, HEAD
```

| Piece | File |
|---|---|
| Signer, viewer context, authorisation query | `apps/api/src/modules/media/training-media-access.ts` |
| Delivery + renewal routes | `apps/api/src/modules/media/training-media.routes.ts` |
| URL resolver (`assetUrl`) | `apps/api/src/modules/media/media-url.ts` |
| DTOs (exercise, plan, program, workout, welcome) | `training/row-media.ts`, `*.service.ts` |
| Upload visibility | `media/media.service.ts` (`trainingVisibility`) |
| Env | `apps/api/src/config/env.ts` |
| Web CSP / thumbnails | `apps/web/src/lib/csp.ts`, `proxy.ts`, `components/admin/media/media-thumb.tsx` |
| App renewal | `apps/mobile/lib/features/training/media_url_renewal.dart`, `exercise_media.dart` |

### Signed URL

- `s = base64url(HMAC-SHA256(key, "v1|assetId|viewerId|expires"))`, compared with
  `timingSafeEqual`. Bound to **asset AND viewer** — a URL copied to another user is useless,
  changing `u` or `e` breaks the signature.
- TTL `TRAINING_MEDIA_URL_TTL_SECONDS` (default 900, allowed 60–3600). Expiry is rounded up to a
  window of `max(60, TTL/4)` so repeated API reads inside a window return the **same URL**
  (player and HTTP caches keep working, no re-buffering on every refresh).
- Expiry far beyond TTL + window is rejected (protects against a leaked key being used to mint
  long-lived links via a manipulated `e`, and against clock games).
- One answer for all failures: `403 MEDIA_URL_EXPIRED` (invalid, foreign, expired, missing key).
  Authorised but unrelated asset → 404 (no existence oracle).

### Authorisation (`canViewTrainingAsset`, one SQL statement)

- user must be `ACTIVE` (disabled users stop at the next Range request, before expiry);
- ADMIN / COACH: permission `training.exercises.read` (the exercise library is shared across
  coaches, as in the existing library rules);
- CLIENT: the asset is referenced by
  - their own session snapshot (`workout_session_exercises.media_asset_id`), or
  - an ACTIVE program of theirs: `coalesce(assignment.media_asset_id, exercise.media_asset_id)`, or
  - their client plan items → exercise media, or
  - a welcome video (shown to every client).

### Renewal

- `GET /v1/client/training/media/:assetId/url` (`training.self.read`)
- `GET /v1/admin/training/media/:assetId/url` (`training.exercises.read`)
- → `{ assetId, url, expiresAt | null }` (PUBLIC asset → public URL, `expiresAt: null`).
- App (`MediaUrlRenewal`): renews **before** opening when the URL expires within 60 s; on a player
  error renews **once** and reopens at the same position; the loop guard resets after successful
  playback or an explicit user retry. Public URLs never ask the API.
- Web admin: pages are server-rendered per request → every navigation gets a fresh URL.

### Headers on delivery

`Cache-Control: private, no-store` · `Referrer-Policy: no-referrer` ·
`Cross-Origin-Resource-Policy: cross-origin` · `Content-Security-Policy: default-src 'none'; sandbox` ·
`Content-Disposition: inline` · `Accept-Ranges: bytes`. Signatures never appear in API logs
(PG test asserts it).

## 2. Range / seek / iOS compatibility

- Signature in the query string → AVPlayer needs no header; Range requests carry the same URL.
- Local driver: byte-exact 206 (tested: middle-of-file range equals source bytes), 416 with
  `Content-Range: bytes */size` on bad ranges, HEAD with `Content-Length`.
- S3: 302 to a presigned `GetObject`; S3 honours Range on presigned GETs. AVPlayer follows 302 —
  **to be confirmed on a real iPhone** (Mac stage).
- The presigned redirect never outlives the signed URL (`min(remaining, 600 s)`).
- Accepted upload formats are unchanged (container + codec sniffing): MP4/H.264 (`avc1`) accepted
  and stored PRIVATE; WebM, HEVC and HTML disguised as video are refused and nothing is stored
  (PG tests 13/14).
- Not provable on Windows: real H.264 decoding + seeking in AVPlayer, background/foreground resume,
  playback over cellular with a 302 to S3. Listed in the Mac handoff.

## 3. Public website media — unchanged

- Website uploads are **always PUBLIC** (independent of `TRAINING_MEDIA_VISIBILITY`).
- `/media/public/...` route, caching headers and CMS rendering unchanged (PG test 9, E2E step 22).
- Existing PUBLIC training assets keep their public URLs until the migration (§6) flips them.
- CSP: the web adds `PRIVATE_MEDIA_ORIGINS` only to `img-src` / `media-src` (API origin, and the
  private bucket origin when S3 redirects are used). No broader opening.

## 4. Configuration

| Variable | Where | Default | Notes |
|---|---|---|---|
| `TRAINING_MEDIA_VISIBILITY` | API | `PUBLIC` | `PRIVATE` = new training uploads go to the private bucket |
| `MEDIA_URL_SIGNING_KEY` | API (secret) | — | ≥ 32 chars, required when `PRIVATE` (startup fails otherwise); rotate = all live URLs expire, apps renew |
| `TRAINING_MEDIA_URL_TTL_SECONDS` | API | 900 | 60–3600 |
| `PRIVATE_MEDIA_ORIGINS` | Web | — | API origin (+ private bucket origin for S3) |

Even with `PUBLIC`, PRIVATE training assets that exist are served signed if a key is configured;
without a key they resolve to `null` (fail closed: no media rather than an open URL).

## 5. Tests

| # | Spec item | Where |
|---|---|---|
| 1 | Own video visible | PG `sprint8a-private-media` |
| 2 | Not another client's | PG |
| 3 | Unauthorised coach / role denied | PG (client on admin route 403, inactive coach) + E2E 21 |
| 4 | Expiry | PG + E2E 20 |
| 5 | Invalid signature | PG + E2E 20 (tampered `u`, longer `e`, unsigned) |
| 6 | Range | PG + E2E 19/20 (browser media stack 200/206, byte-exact) |
| 7 | Seek | PG + E2E 20 (middle range) + Flutter player reopens at position |
| 8 | Renewal | PG + E2E 21 + Flutter `sprint8a_private_media_test.dart` (11) |
| 9 | Public assets unaffected | PG + E2E 22 |
| 10 | Template duplicate keeps the reference | PG |
| 11 | Per-client change does not affect others | PG |
| 12 | Archived video does not break snapshots | PG |
| 13 | H.264/MP4 accepted | PG |
| 14 | Unsupported rejected | PG |
| + | Disabled client loses access before expiry; no signatures in logs | PG |

Mutation check: forcing `canViewTrainingAsset` to `true` made 4 PG tests fail (restored).

## 6. Migration plan A–H (two stages)

**Stage 1 — code + new uploads (reversible, no existing object touched)**

| Step | What | Applied? |
|---|---|---|
| A | Deploy API + web + app build with this code; `TRAINING_MEDIA_VISIBILITY=PUBLIC`, signing key set, `PRIVATE_MEDIA_ORIGINS` set | not deployed (owner) |
| B | Verify: existing videos still play (public), renewal endpoint answers `expiresAt: null` for them | — |
| C | Switch `TRAINING_MEDIA_VISIBILITY=PRIVATE` → only NEW training uploads are private. Rollback: set back to `PUBLIC` (already-private new uploads keep working signed) | — |

**Stage 2 — existing objects (production storage; owner approval each step)**

| Step | What | Applied? |
|---|---|---|
| D | Inventory (read-only): list PUBLIC `TRAINING_VIDEO`/`TRAINING_IMAGE` assets + sizes; report | **NOT applied** |
| E | Copy each object public → private bucket (extend `apps/api` `storage:migrate` — note it loads the ROOT `.env`, i.e. production: owner-run only; per-key report, size/checksum compare). Public copy **stays** | **NOT applied** |
| F | Flip `media_assets.visibility` to PRIVATE per migrated asset (narrow `WHERE id IN (…)`, in batches) — apps receive signed URLs from now on | **NOT applied** |
| G | Wait until every active app has the renewal build (capability/min-version, §7) and logs show no public hits for migrated keys; then **delete** public copies (destructive — explicit owner approval) | **NOT applied** |
| H | Post-check: random sample plays signed on iPhone + web; public URLs of migrated keys 404/403; website media still public | — |

Rollback per stage: C → env back to PUBLIC. F → flip visibility back (public copy still exists
until G). After G only a restore from storage backup/versioning helps — that is why G is last and
separate.

## 7. Old app versions

- An old app (before 657052a) plays a signed URL like any URL, but cannot renew: after expiry the
  player errors; leaving and reopening the screen reloads the plan and gets a fresh URL. TTL 900 s
  covers a normal exercise view.
- Before step F, the owner should require the renewal build (minimum version on the store /
  forced-update notice). Capability header stays 2 (the renewal is backward compatible); no new
  capability level was introduced.

## 8. Risks

- **Query strings in access logs**: nginx/CDN logs record `?u&e&s`. Signatures are short-lived and
  viewer-bound, but configure the log format to drop the query for `/v1/media/training/` (or
  shorten retention).
- **CDN**: do not cache `/v1/media/training/*` (headers say `no-store`; check CDN overrides).
- **Key rotation**: rotating `MEDIA_URL_SIGNING_KEY` invalidates all live URLs → apps renew once.
- **Shared library for coaches**: any coach can view library videos (as with the library itself);
  if the owner wants per-coach libraries this is a product change.
- **Range with S3 + 302** on iPhone: unverified until the Mac/iPhone test.
