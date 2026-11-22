# VITRUV — iOS Training App · Sprint 0 Teknik Denetim

Tarih: 2026-11-22 · Kapsam: salt okunur denetim (kod, dokümanlar, yapılandırma). Hiçbir dosya
değiştirilmedi, DB bağlantısı / ağ isteği / migration yapılmadı, `.env*` içerikleri okunmadı.
Durum etiketleri: **MEVCUT / KISMEN MEVCUT / EKSIK / DOGRULANAMADI**.

Hedef: Teilnehmer'lerin (rol `CLIENT`) mevcut web hesaplarıyla giriş yaptığı bir iPhone "Training
App"; coach'lar web admin'i kullanır.

> **En kritik üç bulgu (özet):**
> 1. Flutter uygulaması (`apps/mobile`) Sprint 7'de büyük ölçüde yazılmış, ancak 2026-10-19'dan beri
>    **askıda** (son mobil commit `89f2223`, 2026-10-19). Sonrasında API'de yapılan değişiklikler
>    (kullanıcı adıyla giriş, e-postasız müşteri) mobil koda yansımamış → **bugün oluşturulan
>    müşteri hesaplarının büyük kısmı mobilde giriş yapamaz** (§4.6).
> 2. Coach'ların bugünkü iş akışı "dated plan" (`client_plans` + `client_plan_items`: egzersiz +
>    not, set/tekrar/dinlenme yok). Workout oturumları ise yalnızca week/day **programlarından**
>    (`training_programs` …) başlatılabiliyor ve program oluşturma UI'si artık bağlı değil (§5.0).
> 3. İstenen 4 antrenman tipinden yalnızca B kısmen karşılanıyor; C (sınırsız set + kalan tekrar)
>    ve D (5 tur 40/20 interval) için veri modeli yok. Zamanlayıcı duvar saati tabanlı ama arka
>    planda bildirim/ses yok (§5).

---

## 1. Monorepo yapısı & teknoloji

### 1.1 Yapı ve sürümler

| Bölüm | Konum | Teknoloji (kaynak: package.json / pubspec.yaml / pubspec.lock) |
| --- | --- | --- |
| Kök | `package.json` | pnpm `10.34.5`, Node `>=22.12`, TypeScript `~6.0.3`, Prettier `^3.9.10` |
| Web | `apps/web` | Next `^16.4.1`, React `^19.3.1`, Tailwind `^4.3.3`, Zod `^4.6.7`, lucide-react, Vitest `^5.0.4` + happy-dom + Testing Library. (CLAUDE.md'deki Shadcn/Framer Motion/GSAP **yok**.) `dev`/`start` script'leri `--port 3000` |
| API | `apps/api` | Hono `^4.13.13` + `@hono/node-server ^2.1.5`, drizzle-orm `^0.45.4`, pg `^8.23.1`, `@node-rs/argon2 ^2.2.2`, pino `^10.4.0`, AWS SDK S3 v3, sharp `0.35.5`, busboy, heic-decode; build: tsup |
| Mobil | `apps/mobile` | Dart SDK `^3.13.5`, Flutter `>=3.47.0` (pubspec.lock); flutter_riverpod `3.4.3`, go_router `18.1.0`, dio `5.11.1`, flutter_secure_storage `11.2.0`, video_player `2.14.1`, intl `^0.20.3`, pdfx `2.11.0` + path_provider (bildirilmiş ama `lib/` içinde **kullanılmıyor**) |
| DB | `packages/db` | Drizzle şeması `src/schema/*.ts`, 22 migration (`0000_baseline` … `0021_welcome_videos`), `scripts/migrate.ts` (yıkıcı SQL koruması: `APPROVED_DESTRUCTIVE.json`) |
| Kontratlar | `packages/contracts` | Zod şemaları: `auth.ts`, `management.ts`, `training.ts`, `workout.ts`, `cms/…` |
| Shared | `packages/shared` | Roller/izinler (`roles.ts`), `workout.ts` (`executionModeOf`), `training.ts`, `media.ts`, `rate-limit.ts` |
| Tokens | `packages/design-tokens` | `tokens.ts` → CSS + `apps/mobile/lib/core/theme/vitruv_tokens.g.dart` üretimi |

### 1.2 API route organizasyonu (`apps/api/src/app.ts` → `createApp`)

Middleware sırası: `requestId` → access log → `secureHeaders` → CORS allow-list (`credentials:false`)
→ `/v1/auth|admin|client/*` için `Cache-Control: no-store` → global body limit (upload yolları hariç).
`authenticate(deps.auth)` `/v1/admin/*`, `/v1/auth/*`, `/v1/client/*` üzerinde.

| Prefix | Modül |
| --- | --- |
| `/health`, `/health/db` | `modules/health` |
| `/media/<key>` | `modules/media` (`mediaDeliveryRoutes`, yalnız `public/` anahtarları, Range/206) |
| `/v1/auth` | `modules/auth` (login, refresh, logout, logout-all, me, password) + `management.routes.ts → activationRoutes` |
| `/v1/admin/clients`, `/v1/admin/coaches`, `/v1/client/me` | `modules/management` |
| `/v1/admin/website`, `/v1/public/website` | `modules/website` (CMS) |
| `/v1/admin/media`, `/v1/admin/training/media` | `modules/media` |
| `/v1/admin/dashboard` | `modules/dashboard` |
| `/v1/admin/training`, `/v1/client/training` | `modules/training` (exercises, programs, dated plan) |
| `/v1/admin/training/clients/:id/workouts`, `/v1/client/workouts` | `modules/workouts` |
| `/v1/admin/welcome`, `/v1/client/welcome` | `modules/welcome` |
| `/v1/admin/nutrition`, `/v1/client/nutrition` | `modules/nutrition` |
| `/v1/public/leads` | `modules/leads` |

Hata zarfı: `{ error: { code, message, requestId?, details? } }` (`lib/errors.ts`, `app.onError`).

### 1.3 Ortam değişkenleri (yalnızca isimler)

Kaynak: `apps/api/src/config/env.ts` (`apiEnvSchema`) ve `.env.example`.
`NODE_ENV, API_HOST, API_PORT (varsayılan 4000), API_PUBLIC_URL, LOG_LEVEL, API_BODY_LIMIT_BYTES,
CORS_ORIGINS, TRUSTED_PROXY_IPS, DATABASE_URL, DATABASE_URL_DIRECT, STORAGE_DRIVER, STORAGE_LOCAL_DIR,
S3_ENDPOINT, S3_REGION, S3_BUCKET_PUBLIC, S3_BUCKET_PRIVATE, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
S3_FORCE_PATH_STYLE, S3_PUBLIC_OBJECT_ACL, PRIVATE_URL_TTL_SECONDS, PUBLIC_MEDIA_BASE_URL,
MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_VIDEO_BYTES, MEDIA_UPLOAD_TMP_DIR, MEDIA_UPLOAD_CONCURRENCY,
API_REQUEST_TIMEOUT_MS, WEB_REVALIDATE_URL, REVALIDATE_SECRET, DEV_AUTH, DEV_AUTH_TOKEN,
DEV_AUTH_EMAIL` · web: `API_BASE_URL, PUBLIC_SITE_URL, CMS_MEDIA_ORIGINS, CMS_MEDIA_ALLOW_LOCAL,
TRUSTED_CLIENT_IP_HEADER, SITE_INDEXING, DESIGN_PREVIEW` · CLI: `BOOTSTRAP_ADMIN_PASSWORD`.
Mobil: yalnızca `--dart-define` ile `API_BASE_URL`, `APP_ENV` (`lib/core/config/app_config.dart`).
Production'da `DEV_AUTH=enabled` ve `STORAGE_DRIVER=local` env doğrulamasında reddedilir.

### 1.4 Test altyapısı

| Alan | Dosyalar | Not |
| --- | --- | --- |
| API unit (Vitest) | 18 `*.test.ts` (`apps/api/src/**`) | `app.request()` ile, DB'siz |
| API integration | 13 `apps/api/test/*.int.test.ts` (ör. `auth`, `management`, `training`, `workouts`, `plan`) | Mevcut DB üzerinde, her test **rollback** edilen tek transaction içinde (`test/rollback.ts`) |
| Web (Vitest) | 32 `*.test.ts(x)` | happy-dom + Testing Library |
| Packages | contracts 7, shared 5, db 2 + 1 int, design-tokens 2 | |
| Flutter | 16 `*_test.dart` dosyası, ~111 `test`/`testWidgets` (ör. `workout/countdown_test.dart` 15, `features/workout_flow_test.dart` 9, `auth/refresh_concurrency_test.dart` 8) | `test/support/fake_backend.dart` ile gerçek Dio yığını, ağsız |

Bu denetimde hiçbir test **çalıştırılmadı** (salt okunur görev).

---

## 2. Production bilgisi doğrulama

| İddia | Kaynakta bulunan | Durum |
| --- | --- | --- |
| Web port 5017 | Kaynakta `5017` geçmiyor. `apps/web/package.json`: `next start --port 3000`; `.claude/launch.json`: web dev `3200` | **DOGRULANAMADI** (5017 kullanılıyorsa sunucuda PM2 argümanıyla override ediliyor olmalı; repoda iz yok) |
| API port 5018 | Kaynakta `5018` yok. `env.ts`: `API_PORT` varsayılan `4000`; `server.ts` `serve({ port: env.API_PORT })` | **DOGRULANAMADI** (env ile ayarlanabilir, değer repoda değil) |
| Neon PostgreSQL | `env.ts`: `DATABASE_URL` yalnızca `postgres(ql)://` regex'i; `docs/ARCHITECTURE.md §5` "existing Neon PostgreSQL (PG 18)"; migration runner `-pooler` kaldırıyor (Neon'a özgü) | **KISMEN MEVCUT** (doküman + Neon'a özgü kod; gerçek host `.env` okunmadan doğrulanamaz) |
| PM2 | Repoda `ecosystem.config.*`, `pm2` referansı yok (eşleşmeler yalnızca `apps/web/tsconfig.tsbuildinfo` hash'leri ve `apps/mobile/android/hs_err_pid25244.log` JVM çökme logu — kaynak değil) | **DOGRULANAMADI** |
| Deploy dokümanı | `docs/ARCHITECTURE.md §9 "Deployment (to be decided)"` güncel değil; S3 için Hetzner Object Storage (`fsn1`) anlatılıyor | **EKSIK** (deploy runbook yok) |
| Git remote | `origin https://github.com/3ytasarim/VITRUV.git`, çalışma ağacı temiz | MEVCUT |

Sonuç: Production topolojisi (port, PM2, reverse proxy, `TRUSTED_PROXY_IPS`, `TRUSTED_CLIENT_IP_HEADER`)
repoda belgelenmemiş. iOS uygulaması için gerekli olan **public HTTPS API base URL** de repoda yok
(`API_BASE_URL` build-time `--dart-define`). Sprint 1 öncesi sahibinden alınmalı.

---

## 3. Flutter / iOS denetimi (`apps/mobile`)

### 3.1 Genel durum

- Uygulama **kısmen geliştirilmiş** ve dokümanlara göre Sprint 7 kapsamında tamamlanmış:
  giriş, Heute, Training, canlı workout, geçmiş, profil. Tek commit: `89f2223 feat(mobile): flutter
  client app` (2026-10-19). `docs/WORKOUT-ARCHITECTURE.md §8a`: "the Flutter client is suspended and
  unchanged" — müşteriler o tarihten beri web'i (`/mein-training`) kullanıyor.
- SDK: Dart `^3.13.5`, Flutter `>=3.47.0`. `analysis_options.yaml`: strict-casts/inference/raw-types +
  flutter_lints + `avoid_print`.

### 3.2 iOS proje yapılandırması (`apps/mobile/ios`)

| Konu | Bulgu | Durum |
| --- | --- | --- |
| Bundle ID | `com.vitruv.vitruvMobile` (`Runner.xcodeproj/project.pbxproj`), placeholder | KISMEN MEVCUT |
| Deployment target | `IPHONEOS_DEPLOYMENT_TARGET = 15.0` | MEVCUT |
| Signing | `CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM` yok | EKSIK |
| Podfile | Repoda yok (macOS'ta `pod install`/SwiftPM ile oluşacak) | DOGRULANAMADI |
| Info.plist | `CFBundleDisplayName VITRUV`, `CFBundleLocalizations de,en`, ATS: yalnız `NSAllowsLocalNetworking` | MEVCUT |
| İzinler (`NS*UsageDescription`) | Hiç yok (kamera/mikrofon/bildirim gerekmiyordu) | EKSIK (bildirim eklenirse gerekir) |
| `UIBackgroundModes` (audio vb.) | Yok | EKSIK |
| Audio session | Yok (ses paketi yok) | EKSIK |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | Yok | EKSIK |
| App icon | `Assets.xcassets/AppIcon.appiconset` Flutter varsayılan ikonları | KISMEN MEVCUT |
| Yönlendirme | iPhone: portrait + landscape | MEVCUT |
| Keychain | `IOSOptions(accessibility: first_unlock_this_device)` (`lib/auth/token_store.dart`) | MEVCUT (runtime'da doğrulanmamış) |

### 3.3 Mimari

| Konu | Uygulama | Durum |
| --- | --- | --- |
| Routing | go_router (`lib/core/routing/app_router.dart`): `/start`, `/login`, `StatefulShellRoute.indexedStack` 5 sekme (`/heute`, `/training` + `tag/:dayId`, `/ernaehrung`, `/fortschritt`, `/profil`), `/einheit` + `abgeschlossen`; `redirect` → `authControllerProvider` | MEVCUT |
| State | flutter_riverpod 3 (`AsyncNotifier`, ör. `WorkoutController`) | MEVCUT |
| API client | `lib/api/api_client.dart` (dio; connect 8 s, send/receive 15 s; `mapDioException` → `NetworkFailure` / `ApiFailure(code, details)` / `UnknownFailure`); katı JSON okuma `lib/core/json/json_reader.dart` | MEVCUT |
| Base URL | `AppConfig.fromEnvironment()`; dev varsayılanı Android `10.0.2.2:4000`, iOS `localhost:4000`; production'da https zorunlu | MEVCUT |
| Auth | `auth_api.dart`, `auth_session.dart` (single-flight refresh, 30 s marj), `auth_interceptor.dart` (Bearer + 401'de tek retry), `auth_state.dart` (CLIENT değilse oturum iptal) | MEVCUT (ancak §4.6 uyumsuzluğu) |
| Güvenli depolama | `token_store.dart` — iki token tek JSON değer olarak secure storage'da; Android `allowBackup=false` | MEVCUT |
| Logout | `POST /v1/auth/logout {refreshToken}` best-effort + yerel temizlik | MEVCUT |
| Şifre değiştirme / sıfırlama UI | Yok ("Wende dich an deinen Coach") | EKSIK |
| Offline | Yerel kuyruk/senkron yok; optimistic güncelleme + rollback + "Erneut versuchen" snackbar | KISMEN MEVCUT |
| Loglama | `print`/`LogInterceptor` yok | MEVCUT |

### 3.4 Ekranlar (`lib/features`)

| Dosya | İşlev |
| --- | --- |
| `auth/login_screen.dart` | E-posta + şifre formu, autofill, tek genel hata mesajı. **Validator yalnızca e-posta kabul ediyor** (regex `^[^@\s]+@…`) |
| `home/home_screen.dart` | "Heute": selamlama (`/v1/client/me`), coaching durumu, coach, devam eden workout / plan |
| `training/training_screen.dart`, `training_day_tile.dart` | ACTIVE program (`GET /v1/client/training/active`) → haftalar/günler |
| `training/training_day_screen.dart` | Gün detayı: bölümler (Warm-up/Hauptteil/Abschluss), hedef, dinlenme, talimat, medya; "Training starten/fortsetzen" |
| `training/exercise_media.dart` | Görsel `Image.network`; video `VideoPlayerController.networkUrl`, dokununca yüklenir, arka planda pause |
| `training/training_api.dart`, `training_models.dart` | `/v1/client/me`, `/v1/client/training/active` modelleri |
| `workout/workout_screen.dart` | Canlı workout: tek egzersiz, önceki/sonraki, 4 mod (SETS_REPS tik, TOTAL_REPS input, DURATION iş zamanlayıcı, CUSTOM tamamla), skip/reopen, finish/abandon |
| `workout/countdown.dart`, `countdown_panel.dart` | Dinlenme / iş zamanlayıcısı (§5.5) |
| `workout/workout_controller.dart` | Optimistic, seri kuyruk (`_queue`), hata durumunda son onaylı duruma rollback |
| `workout/workout_api.dart`, `workout_models.dart` | `/v1/client/workouts` istemcisi |
| `workout/workout_complete_screen.dart` | Özet: x/y egzersiz, süre, atlanan |
| `progress/progress_screen.dart` | Geçmiş özet satırları (`GET /v1/client/workouts?limit=30`) |
| `profile/profile_screen.dart` | Ad, e-posta, coach, çıkış |
| `nutrition/nutrition_screen.dart` | Placeholder (16 satır) — API'de beslenme PDF'i var ama mobilde yok |
| `design_gallery/*` | Yalnız geliştirme (`/design`) |

Shared/core: `lib/shared/ui/*` (button, card, chamfer, media_frame, pressable, status, typography),
`lib/shared/widgets/*` (AsyncValueView, ContentPage, PlaceholderScreen), `lib/shared/format/training_format.dart`
(tek reçete formatlayıcı), `lib/shared/shell/app_shell.dart` (NavigationBar), `lib/core/theme/*`
(üretilmiş `vitruv_tokens.g.dart`, `AppTheme`, koyu tema `VitruvColors.dark`), `lib/core/time/clock.dart`.

Lokalizasyon: `l10n.yaml` (template `app_de.arb`), `app_de.arb` + `app_en.arb` → **de, en**.

Testler: `api_client_test`, `auth/{login_flow,refresh_concurrency,secure_token_store}_test`,
`config_and_roles_test`, `features/{training_flow,workout_flow}_test`, `format/training_format_test`,
`theme_test`, `ui/{app_shell_and_gallery,components,responsive,screens_responsive,token_discipline}_test`,
`widget_test`, `workout/countdown_test`.

### 3.5 Eksikler (mobil)

1. Kullanıcı adıyla giriş + `email: null` desteği (§4.6) — **blokaj**.
2. Dated plan (`GET /v1/client/training/plan`) tüketimi yok; welcome videoları, beslenme PDF'i yok.
3. Antrenman tipleri A–D'nin yeni UI'leri (§5).
4. Arka plan zamanlayıcı bildirimi / ses / wakelock (§5.5).
5. Per-set gerçek tekrar girişi (API destekliyor, `workout_api.dart → updateSet` yalnız `completed` gönderiyor).
6. Offline kuyruk; şifre değiştirme UI; Universal Link ile aktivasyon.
7. Store hazırlığı: gerçek bundle id, ikon, launch screen, signing, privacy manifest.
8. Kullanılmayan bağımlılıklar `pdfx`, `path_provider` (temizlenmeli veya beslenme için kullanılmalı).

### 3.6 Windows vs macOS

| Windows'ta yapılabilir | macOS/Xcode gerektirir |
| --- | --- |
| `flutter analyze`, `flutter test` (unit/widget/flow, fake backend) | `flutter build ios`, Xcode archive |
| Android emülatör/cihazda manuel test (aynı Dart kodu) | Signing, provisioning, Apple Developer Team |
| API/kontrat değişiklikleri, Vitest, integration testleri | TestFlight yükleme |
| Dart tarafı zamanlayıcı mantığı (FakeClock ile) | Gerçek iPhone'da ekran kilidi/arka plan zamanlayıcı, yerel bildirim, ses/AVAudioSession davranışı |
| | Keychain `first_unlock_this_device` runtime doğrulaması, iOS video (AVPlayer) codec testi |

Not (CLAUDE.md): Windows'tan iOS build sonucu iddia edilmez.

---

## 4. Kimlik doğrulama & kullanıcı yönetimi

### 4.1 Kullanıcılar nerede oluşturulur

| Yol | Kanıt | Durum |
| --- | --- | --- |
| İlk ADMIN | `apps/api/scripts/auth-bootstrap-admin.ts` (`pnpm --filter @vitruv/api auth:bootstrap-admin`) | MEVCUT |
| Müşteri (Teilnehmer) | `POST /v1/admin/clients` → `management.service.ts createClient`: **staff şifreyi belirler** (2026-10-20 owner kararı), `username` zorunlu değilse addan türetilir (`pickUsername`), `email` opsiyonel, rol sunucuda `CLIENT` | MEVCUT |
| Coach | `POST /v1/admin/coaches` (ADMIN) + aktivasyon linki | MEVCUT |
| Aktivasyon | `POST /v1/auth/activation/check`, `POST /v1/auth/activate` (`account_activation_tokens`, SHA-256, 72 h, tek kullanım) — müşteriler için artık ihraç edilmiyor | MEVCUT |
| Staff şifre atama | `PUT /v1/admin/clients/:id/password` (`clients.account.manage`) → tüm oturumları iptal eder, `PASSWORD_SET_BY_STAFF` | MEVCUT |

### 4.2 Şifre ve tokenlar

| Soru | Cevap | Kanıt |
| --- | --- | --- |
| Şifre hash | Argon2id m=19456 KiB, t=2, p=1, rehash-on-login | `modules/auth/password.ts` (`ARGON2_PARAMS`, `needsRehash`) |
| Min uzunluk | 8 (`PASSWORD_MIN_LENGTH`) | `packages/shared/src/auth.ts` |
| Login endpoint | `POST /v1/auth/login { email, password, clientType }` — `email` alanı **e-posta veya kullanıcı adı** kabul eder (`authLoginIdSchema`) | `packages/contracts/src/auth.ts`, `auth.service.ts login()` |
| clientType | `WEB` / `MOBILE` (`AUTH_CLIENT_TYPES`), oturum ömrünü seçer | `contracts/auth.ts`, `tokens.ts SESSION_POLICIES` |
| Access token | Opak 256-bit, DB'de SHA-256; **15 dk** | `tokens.ts` |
| Refresh token | Opak, her kullanımda rotasyon; reuse tespiti (30 s grace, sonra tüm oturum iptal) | `tokens.ts REFRESH_REUSE_GRACE_MS`, `auth.service.ts` refresh |
| Ömür MOBILE | refresh idle 30 gün, mutlak 90 gün | `SESSION_POLICIES.MOBILE` |
| Ömür WEB | idle 12 saat, mutlak 7 gün | `SESSION_POLICIES.WEB` |
| Her istekte | Rol + status DB'den (`resolveAccessToken`), disabled kullanıcı anında reddedilir | `auth.service.ts` |
| Şifre sıfırlama (self-service) | **Yok** (e-posta sağlayıcısı yok). Alternatifler: staff endpoint, CLI `auth:set-password` | EKSIK |
| Şifre değiştirme | `POST /v1/auth/password` (diğer oturumları iptal eder) | MEVCUT (mobil UI yok) |
| Login rate limit | In-memory: 30/IP/15 dk, 5 hata/(IP+e-posta)/15 dk, 20 hata/e-posta/60 dk; aktivasyon 20/IP/15 dk | `server.ts` `limits`, `packages/shared/src/rate-limit.ts` |

### 4.3 Roller & izinler

Tanım: `packages/shared/src/roles.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `roleHasPermission`);
handler'larda `requirePermission(...)`.

- **ADMIN**: tüm izinler.
- **COACH**: `admin.access`, `clients.read/create/update/account.manage`, `training.exercises.read/write`,
  `training.programs.read/create/update/activate`, `training.sessions.read`,
  `nutrition.documents.read/write/assign`, `self:read` (website.* **yok**).
- **CLIENT (Teilnehmer)**: `self:read`, `training.self.read`, `training.self.workout`,
  `nutrition.self.read`, `welcome.self.read`.

Coach vs Teilnehmer: coach web panelini kullanır (`admin.access`), yalnız aktif atanmış müşterileri
görür; Teilnehmer admin'e giremez, yalnız self-context endpoint'leri (`/v1/client/*`) çağırır.
Flutter uygulaması CLIENT dışındaki hesapları reddeder (`auth_state.dart`, `SignedOutReason.notClient`).

### 4.4 Müşteri veri izolasyonu

- `clientAccessible(actor, clientIdColumn)` ve `clientScope(actor)` / `loadScopedClient` —
  `apps/api/src/modules/management/management.service.ts` (satır ~148–158, ~274): ADMIN → tüm
  `CLIENT`; diğerleri → `coach_client_assignments.ended_at IS NULL AND coach_user_id = actor`.
  Kapsam dışı id → 404.
- Workout self context: `ownSession()` → `WS.clientUserId = actor.userId`
  (`modules/workouts/workouts.service.ts`).

### 4.5 Mevcut hesaplar Flutter'da kullanılabilir mi?

API tarafı: **Evet** — aynı `/v1/auth/login`, `clientType: "MOBILE"`; web'de oluşturulan CLIENT hesabı
(şifresi set edilmiş) mobil oturum açabilir.

### 4.6 KRİTİK uyumsuzluk: mobil istemci eski kontratta

| API (güncel) | Mobil (2026-10-19) | Sonuç |
| --- | --- | --- |
| Login kimliği e-posta **veya** kullanıcı adı (`authLoginIdSchema`, migration `0012_user_username`, `0016_client_login_by_username`) | `login_screen.dart` validator yalnız e-posta regex'i | Kullanıcı adıyla giriş UI'de engelleniyor |
| `currentUserSchema.email` **nullable** | `auth_models.dart CurrentUser.fromJson` → `json.string('email')` (null → `UnknownFailure`) | E-postasız müşteri giriş yapsa bile `/me` parse hatası |
| `clientSelfProfileSchema.email` nullable, yeni opsiyonel `note` | `ClientProfile.fromJson` → `json.string('email')` | Heute/Profil kırılır |

Durum: **KISMEN MEVCUT** — Sprint 1'in ilk işi mobil auth modellerinin güncel kontratlarla
hizalanması olmalı. Diğer kontratlar (`training.ts`, `workout.ts`) için de Dart modelleriyle
alan-alan karşılaştırma yapılmalı (bu denetimde yalnız auth modelleri doğrulandı).

---

## 5. Antrenman motoru denetimi

### 5.0 İki paralel plan modeli

| Model | Tablolar | Coach UI | Workout oturumu? |
| --- | --- | --- | --- |
| **Program** (Sprint 6) | `training_programs` → `training_weeks` → `training_days` → `training_sections` (`WARMUP/MAIN/FINISHER`) → `training_exercise_assignments` (`sets, reps, total_reps, duration_seconds, rest_seconds, target_weight, weight_unit, prescription_text, instructions_override`) | Builder sayfası `admin/(shell)/kunden/[id]/training/[programId]/page.tsx` hâlâ var ama **hiçbir sayfadan linklenmiyor**; `createProgram` action'ı (`app/admin/training-actions.ts`) hiçbir bileşende kullanılmıyor | **Evet** — `POST /v1/client/workouts {trainingDayId}` |
| **Dated plan** (2026-10-19+) | `client_plans` (`starts_on`, `ends_on`) + `client_plan_items` (`exercise_id`, `note`, `sort_order`) | `PlanEditor` (`components/admin/training/plan-editor`) — müşteri Training sekmesinin tek içeriği | **Hayır** (`docs/TRAINING-ARCHITECTURE.md`: "No workout sessions are created from these entries") |

Yani coach'ların bugün kullandığı model set/tekrar/dinlenme taşımıyor; iOS antrenman tipleri için
reçete modeli seçimi (programları geri getirmek mi, dated plan'ı genişletmek mi) Sprint 1 öncesi
**ürün kararı** gerektiriyor.

Yürütme modu: `executionModeOf` (`packages/shared/src/workout.ts`): `SETS_REPS` (sets/reps),
`TOTAL_REPS` (totalReps), `DURATION` (durationSeconds), `CUSTOM` (yalnız prescriptionText). Her
atamada en az bir "ne yapılacak" alanı zorunlu (`prescriptionIssues`, DB check
`training_assignments_meaningful`).

### 5.1 A — Warm-up (liste, tekrar yok, timer yok, opsiyonel video)

| Boyut | Bulgu |
| --- | --- |
| DB | `training_sections.type = 'WARMUP'`; ama atama "anlamlı" olmalı → tekrar/süre yoksa `prescription_text` zorunlu → `CUSTOM` modu |
| API | Program endpoint'leri + workout snapshot (`section_type`) |
| Mobil | `training_day_screen.dart` bölüm başlığı "Warm-up"; workout'ta CUSTOM = "erledigt" işaretleme |
| Video | `exercises.media_asset_id` → `exercise_media.dart` (opsiyonel) |
| Timer | Yok (doğru) |
| Durum | **KISMEN MEVCUT** — saf liste görünümü (tek tek tamamlama gerektirmeyen) yok; reçetesiz kayıt mümkün değil |

### 5.2 B — Oberkörper/Unterkörper (set, hedef tekrar veya MAX, dinlenme, set başına gerçek tekrar, manuel timer + görsel + ses)

| Boyut | Bulgu | Durum |
| --- | --- | --- |
| Set × tekrar | `sets`, `reps` → `SETS_REPS`, snapshot'ta set satırları (`workout_exercise_sets.target_reps`) | MEVCUT |
| "MAX" hedef | Alan yok; yalnız serbest metinle (`prescription_text`) ifade edilebilir, `reps` ile birlikte değil | EKSIK |
| Dinlenme saniyesi | `rest_seconds` (0–3600), snapshot'ta korunuyor | MEVCUT |
| Set başına gerçek tekrar | API: `PATCH /v1/client/workouts/:sid/exercises/:eid/sets/:n { completed?, actualReps?, actualWeight? }` | API MEVCUT / mobil **EKSIK** (`updateSet` yalnız `completed`) |
| Manuel dinlenme timer | "Pause starten" (`onStartRest`), tikten sonra otomatik başlar (`_startRest`, `workout_screen.dart`), +30 s, pause/skip | MEVCUT |
| Görsel | `CountdownPanel` dijital sayaç + ilerleme | MEVCUT |
| Ses | Yok — yalnız `HapticFeedback.mediumImpact()` bitişte | EKSIK |
| Testler | `test/workout/countdown_test.dart` (15), `features/workout_flow_test.dart` ("all four execution modes, rest timer…"), API `workouts.int.test.ts` | MEVCUT |

### 5.3 C — Gesamt-Wiederholungsziel (toplam hedef, sınırsız set, kalan otomatik, tekrar girişi sonrası timer, son sette timer yok)

| Boyut | Bulgu | Durum |
| --- | --- | --- |
| Toplam hedef | `total_reps` → `TOTAL_REPS` | MEVCUT |
| Kayıt | Egzersiz düzeyinde **tek** `actual_reps` değeri (`updateWorkoutExercise`); `workout_exercise_sets` yalnız SETS_REPS için oluşturuluyor, set ekleme endpoint'i yok | EKSIK |
| Kalan tekrar | Hesaplanmıyor | EKSIK |
| Girişten sonra otomatik dinlenme / son sette dinlenme yok | Mevcut davranış: egzersiz tamamlanınca `_startRest` | EKSIK |
| Durum | **EKSIK** (veri modeli + API + UI gerekli) |

### 5.4 D — Core rutini (5 tur, 40 s iş / 20 s dinlenme, otomatik faz, büyük geri sayım, ses/görsel)

| Boyut | Bulgu | Durum |
| --- | --- | --- |
| Tur/interval modeli | Yok (`rounds`, `work_seconds`, `rest_between_rounds` alanları yok); `DURATION` tek süre | EKSIK |
| Otomatik faz değişimi | Yok; `Countdown` tek faz | EKSIK |
| Büyük geri sayım | `CountdownPanel` var ama full-screen interval görünümü yok | KISMEN MEVCUT |
| Ses/görsel ipucu | Ses yok; haptic + ekran okuyucu duyurusu var | EKSIK |
| Durum | **EKSIK** |

### 5.5 Zamanlayıcı implementasyonu ve iOS arka plan davranışı

- `lib/features/workout/countdown.dart` `Countdown` (`ChangeNotifier`): **duvar saati tabanlı** —
  yalnız `_endsAt` saklanır, `remaining = endsAt − clock.now()`; saniye başı decrement yok.
  Arka plan/kilit sonrası doğru kalan süre gösterilir. Manuel saat değişikliği kaydırır (dokümante).
- `countdown_panel.dart`: `Timer.periodic` ticker yalnız panel içinde; `didChangeAppLifecycleState`
  `resumed` → anında `_tick()`; bitişte `HapticFeedback.mediumImpact()` + `onFinished`;
  `SemanticsService.sendAnnouncement` başlangıç/bitiş.
- Zamanlayıcı **yalnız bellekte**: uygulama iOS tarafından sonlandırılırsa (memory pressure) çalışan
  dinlenme kaybolur; workout durumu sunucudan geri gelir ama timer gelmez.
- iOS ekran kilidi / arka plan: Dart izole askıya alınır → bitişte **hiçbir uyarı yok** (yerel bildirim
  paketi yok, `UIBackgroundModes` yok, audio session yok, wakelock yok). Kullanıcı uygulamaya dönünce
  doğru durum görünür. D tipi (otomatik faz geçişi) için bu yetersiz: arka planda faz değişimi ve ses
  için `flutter_local_notifications` ile zamanlanmış bildirimler ve/veya ekranın açık tutulması
  (wakelock) + audio session (ses ipuçları) gerekir. **Gerçek cihazda test macOS + iPhone ister.**
- Durum: Timer mantığı **MEVCUT**, arka plan uyarısı **EKSIK**.

### 5.6 Persistence, tamamlanma, devam etme (tüm tipler için ortak)

| Konu | Bulgu | Durum |
| --- | --- | --- |
| Oturum | `workout_sessions` (IN_PROGRESS/COMPLETED/ABANDONED), müşteri başına tek IN_PROGRESS (partial unique index + advisory lock `vitruv.workout.start:<user>`) | MEVCUT |
| Egzersiz durumu | `workout_session_exercises.status` PENDING/COMPLETED/SKIPPED | MEVCUT |
| Tamamlama | `POST /:sid/complete`, `POST /:sid/abandon` (`finishWorkout`, retry-safe) | MEVCUT |
| Resume | `GET /v1/client/workouts/current`; aynı günü tekrar başlatma → 200 `resumed:true`; başka gün → 409 `WORKOUT_IN_PROGRESS` | MEVCUT |
| Mobil resume | `WorkoutController.build()` + `progress.currentExerciseId`; test "app restart resumes…" | MEVCUT |
| Notlar | `PUT /:sid/note`, `PUT /:sid/exercises/:eid/note` (migration `0010`), mobilde UI yok | KISMEN MEVCUT |

---

## 6. Egzersiz videoları

| Konu | Bulgu | Durum |
| --- | --- | --- |
| Depolama | `ObjectStorage` arayüzü (`infra/storage/object-storage.ts`); sürücüler `local-storage.ts` (yalnız dev) ve `s3-storage.ts` (Hetzner S3 uyumlu, public + private bucket) | MEVCUT |
| Metadata | `media_assets` (`purpose = TRAINING_VIDEO`, `visibility = PUBLIC`, `storage_key`, `mime_type`, `size_bytes`, `duration_ms`…) | MEVCUT |
| Upload | `POST /v1/admin/training/media` (web proxy `app/admin/api/training-media`), streaming (busboy), magic-byte sniffing, MIME allow-list `video/mp4`, `video/webm`, varsayılan max 500 MB, HEVC reddedilir; `…/replace` ile dosya değiştirme | MEVCUT |
| URL modeli | **Public, imzasız** kalıcı URL: `PUBLIC_MEDIA_BASE_URL/<key>` veya `API_PUBLIC_URL/media/<key>` (`media-url.ts createMediaUrlResolver`); `/media` yanıtı `Cache-Control: public, max-age=31536000, immutable`, Range/206 | MEVCUT (tasarım gereği public) |
| Yetkilendirme | Upload/okuma: `training.exercises.*`; silme: `training.media.delete` (ADMIN); kullanımdaysa 409. İzleme: URL'yi bilen herkes (koçluk içeriği, kişisel veri değil — `TRAINING-ARCHITECTURE.md §6`) | MEVCUT |
| Flutter oynatma | `video_player 2.14.1`, `exercise_media.dart` — dokununca `networkUrl` initialize, loop, arka planda pause, hata → `_failed` durumu; görsel `Image.network` + `errorBuilder` | MEVCUT |
| Önbellek | Uygulama içi video/görsel önbellek yok (yalnız HTTP cache başlıkları) | EKSIK |
| Video yoksa | DTO `media: null` → medya bölümü gösterilmez; eski oturumlar güncel medyayı `exercise_id` üzerinden çözer | MEVCUT |
| **iOS riski** | `video/webm` yüklemeye izin var; iOS AVPlayer WebM oynatmaz → bu videolar iPhone'da açılmaz | Sprint 1'de MP4 (H.264) zorunluluğu veya transkod gerekli |

---

## 7. Antrenman geçmişi

| Konu | Bulgu | Durum |
| --- | --- | --- |
| Oturum başına | program/gün başlık snapshot'ları, hafta/gün sırası, `started_at/completed_at/abandoned_at`, `client_note` | MEVCUT |
| Egzersiz başına | ad/talimat/bölüm snapshot'ı, tam reçete snapshot'ı (`sets, reps, total_reps, duration_seconds, rest_seconds, target_weight…`), `execution_mode`, `status`, `actual_reps`, `actual_duration_seconds`, `actual_weight`, not | MEVCUT |
| Set başına | `set_number`, `target_reps`, `target_duration_seconds`, `target_weight`, `actual_reps`, `actual_weight`, `completed_at` | MEVCUT |
| Coach görünürlüğü | `GET /v1/admin/training/clients/:clientId/workouts` (+ `/:sessionId`), `training.sessions.read`, kapsamlı; web: `kunden/[id]/training/page.tsx` → `WorkoutHistory`, detay `kunden/[id]/training/einheit/[sessionId]/page.tsx` (set sayısı "x von y Sätzen", toplam tekrar, notlar) | MEVCUT (set başına gerçek tekrar detayda listelenmiyor → KISMEN) |
| Karşılaştırma / ilerleme grafikleri | Yok (`WORKOUT-ARCHITECTURE.md §9`: charts/analytics kapsam dışı) | EKSIK |
| Snapshot bütünlüğü | Başlangıçta `INSERT … SELECT` kopyası, program satırı `FOR SHARE`; canlı plan bağlantıları `SET NULL`; test: `workouts.int.test.ts` "MANDATORY: coach edits of the ACTIVE plan never change a running session…", "history survives removal…" | MEVCUT |
| Mobil geçmiş | `progress_screen.dart` (özet satırları, detay yok) | KISMEN MEVCUT |

---

## 8. Güvenlik & production güvenliği

| Konu | Bulgu | Durum |
| --- | --- | --- |
| Teilnehmer izolasyonu | Workout: `client_user_id = principal`, istekte client id kabul edilmez (strict body); `requireClient` | MEVCUT |
| Coach yetkisi | `requirePermission` + `clientAccessible()` SQL kapsamı | MEVCUT |
| IDOR | Kapsam dışı/başka müşteri id → 404 (`ownSession`, `sessionExercise`, `loadScopedClient`); test: `workouts.int.test.ts` "object authorization: other clients get 404 for every id…", `training.int.test.ts` 26 cross-coach probe (dokümana göre) | MEVCUT |
| Endpoint kapsamı | `/v1/admin|auth|client/*` hepsi `authenticate` arkasında; route başına `requirePermission` (training/workouts/management/nutrition/welcome route dosyalarında doğrulandı) | MEVCUT |
| Oturum güvenliği | Opak token, hash-only, rotasyon + reuse tespiti, disabled → anında iptal, `no-store` | MEVCUT |
| Token süresi | Access 15 dk; MOBILE 30 g idle / 90 g mutlak | MEVCUT |
| Şifre sıfırlama | Self-service yok; staff/CLI | EKSIK |
| Mobil depolama | Keychain/Keystore; SharedPreferences yok; `AuthTokens.toString` redakte | MEVCUT (iOS runtime doğrulanmadı) |
| Hassas loglama | pino redaction (`lib/logger.ts`: authorization, cookie, password, token…); mobilde print yok | MEVCUT |
| Rate limit | Login/aktivasyon/lead: in-memory, proses başına; **workout endpoint'lerinde rate limit yok**; çoklu instance için Redis gerekli (launch blocker, dokümante) | KISMEN MEVCUT |
| Workout düzenleme yetkisi | Yalnız sahibi, yalnız IN_PROGRESS (`ownRunningSession` → 409); coach'un yazma yolu yok; hedefler yazılamaz (strict contract) | MEVCUT |
| Geçmiş bütünlüğü | Bitmiş oturum salt okunur (notlar hariç); oturumlar silinmez; programlar sessions ile RESTRICT | MEVCUT |
| Idempotency | `start`: aynı gün → resume (çift oturum yok); set/egzersiz `PATCH` durum-atama (artırma yok) → tekrar gönderim aynı sonucu verir, yalnız `completed_at` yeni zamanla güncellenir; `complete/abandon` retry-safe; **`Idempotency-Key` başlığı yok** | KISMEN MEVCUT |
| Offline/retry | Mobil: seri kuyruk + rollback + manuel "Erneut versuchen"; otomatik retry yok; offline kayıt saklanmıyor | KISMEN MEVCUT |
| Production topolojisi | `TRUSTED_PROXY_IPS`/`TRUSTED_CLIENT_IP_HEADER` gerçek değerleri doğrulanamadı | DOGRULANAMADI |

Gözlem: repo kökünde git-ignored `.env` ve `.env.admin-login.local` dosyaları var (içerik okunmadı).
İkincisinin adı admin giriş bilgisi içerdiğini düşündürüyor; repoda commit edilmemiş (`.gitignore: .env.*`).

---

## 9. Kısa özet tablosu

| Alan | Durum | Ana kanıt |
| --- | --- | --- |
| Monorepo / API yapısı | MEVCUT | `apps/api/src/app.ts`, `modules/*` |
| Production port 5017/5018 | DOGRULANAMADI | Kaynakta yok; web `--port 3000`, API varsayılan 4000 |
| PM2 | DOGRULANAMADI | Ecosystem dosyası yok |
| Neon PostgreSQL | KISMEN MEVCUT | Docs + `migrate.ts` pooler mantığı |
| Deploy dokümanı | EKSIK | `ARCHITECTURE.md §9` "to be decided" |
| Flutter iskelet (routing/state/API/theme/l10n) | MEVCUT | `lib/core`, `lib/api`, `lib/shared` |
| iOS proje yapılandırması (signing, bundle id, privacy, background) | KISMEN MEVCUT | `ios/Runner/Info.plist`, `project.pbxproj` |
| Auth API (login/refresh/logout, MOBILE) | MEVCUT | `modules/auth/*`, `tokens.ts` |
| Mobil login mevcut hesaplarla | KISMEN MEVCUT (**blokaj**) | `login_screen.dart` e-posta regex, `auth_models.dart` non-null email |
| Şifre sıfırlama | EKSIK | yalnız staff endpoint + CLI |
| Roller / izolasyon / IDOR | MEVCUT | `roles.ts`, `clientAccessible()`, `ownSession()` |
| A Warm-up | KISMEN MEVCUT | `WARMUP` section + CUSTOM modu |
| B Oberkörper/Unterkörper | KISMEN MEVCUT | SETS_REPS + rest timer; MAX, per-set reps UI, ses yok |
| C Gesamt-Wiederholungsziel | EKSIK | TOTAL_REPS tek değer, set yok |
| D Core interval | EKSIK | tur/faz modeli yok |
| Coach'un reçete girişi (bugünkü akış) | KISMEN MEVCUT | Dated plan reçetesiz; program builder linksiz |
| Timer (duvar saati) | MEVCUT | `countdown.dart` |
| Arka plan bildirim / ses / wakelock | EKSIK | paket ve `UIBackgroundModes` yok |
| Egzersiz videoları (yükleme, public URL, oynatma) | MEVCUT | `media.service.ts`, `media-url.ts`, `exercise_media.dart` |
| Video iOS uyumluluğu (WebM) | KISMEN MEVCUT | `WEBSITE_MEDIA_MIME_TYPES.VIDEO` webm içerir |
| Video önbelleği | EKSIK | — |
| Geçmiş + snapshot bütünlüğü | MEVCUT | `0006_workout_sessions.sql`, `workouts.int.test.ts` |
| İlerleme karşılaştırma | EKSIK | — |
| Idempotency | KISMEN MEVCUT | durum-atama PATCH, resume start; key yok |
| Offline senkron | EKSIK | `WORKOUT-ARCHITECTURE.md §7` |
| Testler | MEVCUT | API 18 unit + 13 int, web 32, Flutter 16 dosya / ~111 test |

### Sprint 1 öncesi sahibinden alınması gereken kararlar

1. Reçete modeli: program (week/day/section) mı geri gelecek, dated plan mı tiplerle genişletilecek?
2. C ve D tipleri için yeni alanlar (tur sayısı, iş/dinlenme saniyesi, MAX hedef) — additive migration.
3. Arka planda sesli/bildirimli zamanlayıcı isteniyor mu (bildirim izni + iOS yapılandırması)?
4. Production API public URL'si, port/PM2 topolojisi, gerçek bundle id ve Apple Developer Team.
5. Video formatı politikası (yalnız MP4/H.264).
