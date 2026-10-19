# VITRUV — Mobile Architecture (Flutter)

Status: Sprint 7 — client login, Heute, Training, live workout, history, profile. App: `apps/mobile` (package `vitruv_mobile`), Flutter 3.47 stable / Dart 3.13.

## Rules

- **Flutter/Dart only**, one codebase for Android and iOS. No React Native, Expo, Ionic, Capacitor.
- The app is a client of the **shared API**. No business rules that the API does not also enforce.
- The app holds no secrets — only the public API base URL (build-time `--dart-define`).
- Every user-visible string goes through `AppLocalizations` (German primary).

## Structure

```
lib/
├── main.dart / app.dart        ProviderScope, MaterialApp.router (theme, l10n, router)
├── core/
│   ├── config/app_config.dart  API_BASE_URL / APP_ENV from --dart-define (https enforced in production)
│   ├── errors/app_failure.dart sealed AppFailure: NetworkFailure, ApiFailure(code, details), UnknownFailure
│   ├── json/json_reader.dart   strict typed JSON reading (contract violations → UnknownFailure)
│   ├── routing/                go_router: auth redirect, /start, /login, 5-tab shell, /einheit
│   ├── time/clock.dart         Clock abstraction (FakeClock in tests)
│   └── theme/                  vitruv_tokens.g.dart (GENERATED), AppTheme + VitruvTheme
├── api/                        ApiClient (dio), providers (DI graph), health
├── auth/                       models, TokenStore (secure storage), AuthSession (single-flight
│                               refresh), AuthInterceptor, AuthApi, AuthController (state)
├── features/
│   ├── auth/        LoginScreen, StartScreen (session restore / offline retry)
│   ├── home/        Heute — greeting, coaching status, coach, running workout / plan
│   ├── training/    plan, day detail, exercise media, models + ClientApi
│   ├── workout/     live workout, countdown (rest timer), completion, models, API, controller
│   ├── progress/    Fortschritt — workout history (summary rows)
│   ├── profile/     Profil — own account + sign-out
│   ├── nutrition/   Ernährung (placeholder, later sprint)
│   └── design_gallery/  development-only (`/design`, not in release builds)
├── shared/  shell (NavigationBar), ui (VITRUV components), format (TrainingFormat — the one
│            prescription formatter), widgets (AsyncValueView, ContentPage, InfoState)
└── l10n/    app_de.arb (template), app_en.arb → generated AppLocalizations
```

## Libraries

| Concern    | Choice                                 | Reason                                                                  |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------- |
| State / DI | flutter_riverpod 3                     | Testable overrides, async state (`AsyncValue`), no global singletons    |
| Routing    | go_router                              | Declarative, deep-link ready, `StatefulShellRoute` keeps per-tab stacks |
| HTTP       | dio                                    | Interceptors (auth token, retry, logging) and typed error mapping       |
| Tokens     | flutter_secure_storage 11              | Keychain / Android Keystore-backed encryption (see Authentication)      |
| Video      | video_player (flutter.dev)             | First-party; loaded only on tap, paused in background                   |
| i18n       | flutter_localizations + gen-l10n (ARB) | Official tooling; German now, more locales without refactor             |

## Navigation

Signed out: only `/login` (and `/start` while a stored session is restored). Signed in (CLIENT
only): five tabs **Heute · Training · Ernährung · Fortschritt · Profil** (`/heute`, `/training`
(+ `/training/tag/:dayId`), `/ernaehrung`, `/fortschritt`, `/profil`) and the full-screen workout
`/einheit` (+ `/einheit/abgeschlossen`). The router `redirect` follows `authControllerProvider`.
There are no admin routes in the app; a COACH/ADMIN login is rejected ("Die App ist für
Kund:innen") and its session revoked immediately.

## Environments

```bash
flutter run                                   # dev: Android emulator → http://10.0.2.2:4000, iOS sim → http://localhost:4000
flutter run --dart-define=API_BASE_URL=https://api.staging.example --dart-define=APP_ENV=staging
flutter build appbundle --dart-define=API_BASE_URL=https://api.example --dart-define=APP_ENV=production
```

Cleartext HTTP is allowed only in the Android **debug** manifest and, on iOS, only for local
networking (`NSAllowsLocalNetworking`). Production requires https (enforced by `AppConfig`).

## Authentication (implemented in Sprint 7)

Same API and contracts as the web ([AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md)); no separate auth
logic in the app.

| Step     | Call / behaviour                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Login    | `POST /v1/auth/login { email, password, clientType: "MOBILE" }` → `{ tokens, user }`; non-CLIENT → rejected + session revoked        |
| Requests | `AuthInterceptor` adds `Authorization: Bearer <access>` (15 min)                                                                     |
| Refresh  | single-flight (`AuthSession.freshAccessToken`): before expiry (30 s margin) or after a 401; the rotated pair is persisted, then used |
| Start    | stored session → `GET /v1/auth/me` (refreshing if needed); offline → "Erneut versuchen" (tokens kept)                                |
| Logout   | `POST /v1/auth/logout { refreshToken }` (best effort, 5 s) → ALWAYS clear local credentials → login                                  |

- **Secure storage** (`auth/token_store.dart`, `flutter_secure_storage` 11): both tokens as ONE value
  (atomic rotation). Android: AES-GCM data encryption, key wrapped by an RSA key in the Android
  Keystore (package default); `android:allowBackup="false"` so the blob is never restored elsewhere.
  iOS: Keychain, `first_unlock_this_device` (readable after the first unlock since boot; never
  synced to iCloud or migrated by backups). **iOS behaviour is configured but not runtime-verified
  (Windows, no macOS/Xcode).** Never SharedPreferences, files or logs (tested); `AuthTokens.toString`
  is redacted.
- **Refresh concurrency**: many simultaneous 401s → exactly one `/refresh`; all waiting requests
  retry once with the new token; a request that failed with an already replaced token retries
  without a new refresh; a REJECTED refresh clears the session exactly once and the router shows the
  login ("Deine Sitzung ist abgelaufen"); an OFFLINE refresh keeps the session. Proven in
  `test/auth/refresh_concurrency_test.dart`.
- **Login screen**: `AutofillGroup` + autofill hints (password managers), show/hide password,
  loading state, ONE generic message for wrong credentials, rate-limit and network messages, no
  password reset link (no mail provider yet — "Wende dich an deinen Coach").
- Password change UI: deferred (API exists).
- **Session lifetime:** 30 days idle, 90 days absolute → then the login screen. Error codes:
  `UNAUTHENTICATED` (one generic login message), `RATE_LIMITED` (ask to wait), `VALIDATION_FAILED`.
  Native apps send no `Origin`; CORS does not apply. https only in production (AppConfig).
- **Account activation:** clients get a one-time link `https://<site>/aktivieren#t=<token>` from their
  coach. Today it opens the web page (works on phones). Later the app can register it as an
  App Link / Universal Link, read `t` from the fragment and call the same endpoints
  (`POST /v1/auth/activation/check`, `POST /v1/auth/activate { token, password }` →
  `{ destination: "APP" }`), then show the login. Not implemented yet.
- **Own profile:** `GET /v1/client/me` → `ClientSelfProfile`
  (`{ id, firstName, lastName, email, coachingStatus, coach: { displayName } | null }`) — never
  internal notes or account internals. Mirrored in `lib/auth/auth_models.dart`.

## Training & workouts (Sprint 7)

- **Training** tab: the ACTIVE plan from `GET /v1/client/training/active` (weeks → days in API order,
  "Aktuelle Woche" only with a start date). No plan → explicit empty state, never a demo plan.
- **Day detail**: sections (Warm-up/Hauptteil/Abschluss), exercises with target, rest, instructions,
  media; "Training starten" / "Training fortsetzen"; another running day → "Laufendes Training öffnen".
- **Heute**: greeting from `/v1/client/me`, coaching status, coach; a running workout →
  "Training fortsetzen"; otherwise the plan. "Heute geplant" only when the plan has a start date
  (`currentWeekId`) **and** a day carries today's weekday — no invented scheduling.
- **Live workout** (`/einheit`): one exercise at a time, explicit "Vorherige/Nächste Übung"
  (stacked on narrow screens / large text), modes sets (tick per set), total reps (input), duration
  (optional work timer), custom (mark done); skip / reopen; rest timer; finish (confirmation when
  exercises are open) or abandon (confirmation). Back keeps the session running.
- **Completion**: "Training abgeschlossen", day, "x von y Übungen", "Dauer …", skipped / not done —
  recorded facts only. **Fortschritt**: history rows. **Profil**: name, e-mail, coach, coaching
  status, sign-out.
- Media: images inline; videos load only on tap (no autoplay), pause when the app leaves the
  foreground (`video_player`). Delivery URLs only.
- One formatter (`shared/format/training_format.dart`): "4 × 12", "70 Wdh. gesamt", "45 Sek.",
  "AMRAP", "Pause 01:00", "20 kg" / "7,5 kg". Free text is shown verbatim, never parsed.
- Server state is the source of truth; details (snapshot, timer, offline, resume) in
  [WORKOUT-ARCHITECTURE.md](WORKOUT-ARCHITECTURE.md). Dart models mirror
  `packages/contracts/src/{auth,management,training,workout}.ts`.

## Future domain notes

- **Exercise feedback** — tied to the workout session exercise (FK model in WORKOUT-ARCHITECTURE §8);
  optional video upload (private, presigned upload URL).
- **Nutrition** — client-specific PDFs opened via short-lived signed URLs; separate from training.
- **Coach message** ("Nachricht von Philipp") — shown on Heute while active; the app never receives
  or displays the expiry date.
- **Push / local notifications** — FCM/APNs, later sprint (the rest timer deliberately has none).

## Platform status & build notes

| Platform | Status                                                                                                                                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android  | Project generated (`android/`, Kotlin DSL, `applicationId com.vitruv.vitruv_mobile`, INTERNET permission, backup off). Toolchain now present on the dev machine (Android Studio JBR, SDK 36/37); `flutter build apk --debug` could not run inside the agent sandbox (Gradle loopback socket blocked) — **NOT VERIFIED**, run it locally. |
| iOS      | Project generated (`ios/Runner.xcodeproj`, bundle id `com.vitruv.vitruvMobile`, de/en localizations). **Building, signing and running require macOS + Xcode** — not possible on Windows.                                                                                                                                                 |

Before store submission (later sprint): final bundle/application IDs (currently placeholders under
`com.vitruv`), app icons, launch screens, signing configs, privacy manifests.

## Checks

```bash
cd apps/mobile
flutter analyze      # strict-casts / strict-inference / strict-raw-types + flutter_lints
flutter test         # unit + widget + flow tests: real Dio stack against test/support/fake_backend.dart (no network)
```
