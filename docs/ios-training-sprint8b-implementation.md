# iOS Training — Sprint 8B: Implementation

Status 2026-11-23, branch `feature/ios-training`, local commits only (no push). Platform of this
sprint: **Windows** — code, tests, audit and documents. No macOS, no Xcode, no iPhone: every
iOS build or device statement in these documents is **NOT TESTED** unless a real result is given.

Nothing in production was changed: no deploy, no Neon connection, no migration, no storage move,
no flag switched, no App Store Connect action, no upload.

## 1. Commits (Sprint 8B)

| Commit | Content |
|---|---|
| 2c08a30 | mobile: hide the Ernährung placeholder tab (compile-time flag, safe deep link) |
| cc82f72 | api/shared/contracts: server-side minimum app version (426 `APP_UPDATE_REQUIRED`, `GET /v1/app/compatibility`) |
| 261648a | mobile: version/platform headers, update screen on 426 |
| 2a19680 | api: private training video rollout library (copy → verify → flip → remove, rollback) |
| 2c4c58d | ios: iPhone-first device family, source audit + release preflight test |
| (docs commit) | these documents, privacy draft, 0026 proposal, nginx example |

## 2. Ernährung hidden (spec §6)

- `lib/core/config/release_features.dart`: `VITRUV_NUTRITION_TAB` (dart-define, default **false**)
  → `nutritionTabEnabledProvider`.
- Off: the router does not register the nutrition branch; the shell shows 4 destinations
  (Heute, Training, Fortschritt, Profil). `/ernaehrung` exists only as a redirect target: signed in →
  `/heute`, signed out → `/login`. No dead screen, no "coming soon" in a release build.
- The nutrition feature code is untouched (not deleted); `--dart-define=VITRUV_NUTRITION_TAB=true`
  restores the tab for development.
- Tests: `test/features/sprint8b_hidden_nutrition_test.dart` (5) — navigation without the tab,
  deep link signed in/out, flag on restores it; existing shell tests use the override.

## 3. Minimum app version (spec §14)

**Server (`apps/api/src/modules/app/app-version.ts`, `packages/shared/src/app-version.ts`)**
- Headers from the app: `X-Vitruv-App-Version` (strict `MAJOR.MINOR.PATCH`) and
  `X-Vitruv-App-Platform` (`ios` | `android`).
- Env (all optional, validated at startup): `MOBILE_MIN_VERSION_IOS`, `MOBILE_MIN_VERSION_ANDROID`,
  `MOBILE_LEGACY_APP_POLICY=allow|update_required` (default `allow`), `MOBILE_UPDATE_URL_IOS`,
  `MOBILE_UPDATE_URL_ANDROID` (https only). **Unset = nothing enforced** — no invented minimum.
- Middleware on `/v1/client/*` **after** authentication: only for a valid principal whose session is
  MOBILE (or a non-WEB session that sends a version header). WEB sessions are never gated; auth
  routes are not gated (refresh/logout keep working → no forced logout); invalid token → 401, never
  426. Below minimum → `426 APP_UPDATE_REQUIRED` with `minimumVersion` + `updateUrl` details.
- Legacy apps without a header: allowed unless `MOBILE_LEGACY_APP_POLICY=update_required`.
- `GET /v1/app/compatibility` with the same two headers (public, `Cache-Control: no-store`) →
  `{status: SUPPORTED|UPDATE_REQUIRED|UNKNOWN, platform, version, minimumVersion, updateUrl}`.
- `Principal.clientType` comes from `auth_sessions.client_type` (no client claim trusted).

**App**
- `kAppVersion = '1.0.0'` (test pins it to `pubspec.yaml`), headers added in `ApiClient.createDio`.
- `AppUpdateInterceptor`: on 426 sets `appUpdateProvider`; the router sends the user to
  `/aktualisieren` (`AppUpdateScreen`: installed vs. required version, copy link, "Erneut prüfen").
- Retry re-validates the client data providers; **tokens are kept** — updating never logs out.

## 4. Private training media (spec §15)

`apps/api/src/modules/media/training-media-privatize.ts` — a library, deliberately **no CLI**
(a CLI would load the root `.env`, which is production). Steps: inventory (training videos only,
website media excluded) → copy to `private/…` key → size + SHA-256 verify → narrow row flip
(`WHERE id = … AND visibility = 'PUBLIC' AND storage_key = old`) → separate destructive
`removePublicOriginals` → `rollbackPrivatization` (only while the public original exists).
Every step is dry-run by default. Rehearsed only on the isolated cluster + temp storage
(`test/sprint8b-media-privatize.pg.test.ts`, 10 tests, runbook steps 1–10).
`TRAINING_MEDIA_VISIBILITY` in production stays `PUBLIC`; no signing key created.

## 5. iOS project (spec §3–4, §10–11)

- `TARGETED_DEVICE_FAMILY = 1` in Debug/Release/Profile (iPhone-first; iPad runs the iPhone app in
  compatibility mode — no native iPad layout claimed).
- Source audit as a test (`test/release/ios_release_audit.dart` + `ios_release_preflight_test.dart`,
  8 tests): display/bundle name, German localisation, portrait only, iOS 15, version from pubspec,
  no arbitrary loads, no unused permission prompts, no background modes, privacy manifest without
  tracking, nutrition default off.
- Release preflight (`--dart-define=VITRUV_RELEASE_PREFLIGHT=true` on the Mac) fails while
  owner blockers are open: **bundle id provisional, Team missing, export compliance undecided**.
- Not changed on purpose: bundle id `com.vitruv.vitruvMobile`, no `DEVELOPMENT_TEAM`, no
  `ITSAppUsesNonExemptEncryption` key, no entitlements, no Watch target.

## 6. Documents and proposals

- `docs/legal/datenschutzerklaerung-app-entwurf.md` — German privacy policy **draft** (placeholders).
- `docs/ios-training-sprint8b-account-deletion.md` + `docs/proposals/0026_account_deletion_requests.sql`
  — design, API contract, migration proposal (not in the migrations folder, not applied).
- `docs/deploy/nginx-vitruv.conf.example` — log redaction, no-cache, Range, canonical host.
- Apple checklist, production runbook, open decisions, tests — siblings of this file.

## 7. Unchanged / deliberately not done

Apple Watch: interface only, `VITRUV_WATCH_TIMER_SYNC` OFF, no target. `TRAINING_EXTENDED_TYPES`
stays disabled. No account deletion button (backend not approved → would be a dead button).
