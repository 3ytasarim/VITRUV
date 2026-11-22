# VITRUV iPhone Training App — Sprint 1 Uygulama Raporu

> Tarih: 2026-11-22 · Kapsam: Flutter iOS temeli, mevcut hesapla giriş, VITRUV tasarım sistemi.
> Dayanak: [`ios-training-roadmap.md`](ios-training-roadmap.md) §Sprint 1, [`ios-training-sprint0-audit.md`](ios-training-sprint0-audit.md).
> Durum etiketleri: MEVCUT / KISMEN MEVCUT / EKSIK / DOGRULANAMADI.

Bu sprintte yapılmayanlar: DB migration, yeni auth sistemi, yeni endpoint, kullanıcı oluşturma, production bağlantısı, deploy, commit ve push. API ve web koduna dokunulmadı. Web CSS çıktısı değişmedi (token kontrolü: `design tokens: up to date`).

---

## 1. Yapılanlar

### 1.1 Authentication (en kritik iş)

| Konu | Önce | Şimdi | Kanıt |
|---|---|---|---|
| Giriş alanı | yalnızca e-posta (regex) | **Benutzername oder E-Mail** | `lib/features/auth/login_screen.dart` |
| İstemci doğrulaması | e-posta regex'i | `authLoginIdSchema` ile birebir: `@` varsa e-posta, yoksa 3–32 karakter `a–z 0–9 . _ -` | `lib/auth/auth_api.dart` `isValidLoginId()`, `normalizeLoginId()` |
| İstek gövdesi | `{email, password, clientType: MOBILE}` | Aynı sözleşme. Alan adı hâlâ `email`, çünkü API alanı uyumluluk için böyle bırakmış (`packages/contracts/src/auth.ts` `loginRequestSchema`). Değer trim + lowercase ile normalize ediliyor | `AuthApi.login(loginId, …)` |
| Endpoint | — | `POST /v1/auth/login`, `/refresh`, `/logout`, `GET /v1/auth/me` (kaynaktan doğrulandı, yeni endpoint yok) | `apps/api/src/app.ts`, `modules/auth` |
| `CurrentUser.email` | zorunlu → e-postasız kullanıcıda parse hatası | `String?` (`currentUserSchema.email` nullable) | `lib/auth/auth_models.dart` |
| `ClientProfile.email` | zorunlu | `String?` (`clientSelfProfileSchema.email` nullable); anahtar hiç yoksa da `null` | aynı dosya |
| Profil ekranı | e-posta satırı her zaman | e-posta yoksa satır gösterilmiyor | `lib/features/profile/profile_screen.dart` |
| Username alanı | — | `/v1/auth/me` yanıtında `username` **yok** (`currentUserSchema`), bu yüzden modele eklenmedi. Sözleşme bozulmadı | contracts |

**Değiştirilmeden korunan session mekanizması (MEVCUT, testli):**
- Token'lar `flutter_secure_storage` ile iOS Keychain'de (`first_unlock_this_device`) tutuluyor; düz metin yok (`lib/auth/token_store.dart`).
- Tek seferlik (single-flight) refresh: eşzamanlı 401'ler tek bir refresh bekliyor; eski refresh token bir daha gönderilmiyor (`lib/auth/auth_session.dart`).
- Refresh reddedilirse oturum bir kez kapanıyor ve "Sitzung abgelaufen" mesajı çıkıyor. Ağ hatasında oturum korunuyor.
- Logout: önce sunucuda iptal (5 sn timeout), sonra çevrimdışı olsa da Keychain her durumda temizleniyor.
- Açılışta oturum geri yükleniyor ve `/v1/auth/me` ile hem oturum hem **rol yeniden kontrol ediliyor**.
- `AuthTokens.toString()` → `<redacted>`. Token ve şifre loglanmıyor.

### 1.2 Rol kısıtı (COACH / ADMIN)
- **Login sonrası:** CLIENT değilse yeni oturum hemen sunucuda iptal ediliyor, token saklanmıyor ve "Diese App ist nur für Teilnehmer verfügbar. Coaches nutzen den Webzugang." mesajı gösteriliyor (`lib/auth/auth_state.dart` `login()`).
- **Session restore:** saklı oturum COACH veya ADMIN'e aitse sonlandırılıyor ve aynı mesaj gösteriliyor (`restore()`). Router korumalı ekranlara izin vermiyor.
- **Sunucu tarafı (değiştirilmedi, doğrulandı):**
  - `/v1/client/training/*` ve `/v1/client/workouts/*` uç noktaları `training.self.read` / `training.self.workout` izni istiyor; bu izinler **yalnızca CLIENT** rolünde var (`packages/shared/src/roles.ts`, `ROLE_PERMISSIONS.CLIENT`).
  - `/v1/client/me` `self:read` istiyor. Bu izin COACH'ta da var, ancak servis sorguyu `role = 'CLIENT'` ile sınırlıyor; CLIENT olmayan hesap 404 alıyor (`management.service.ts` `clientSelfProfile()`).
  - İstemci kontrolü yalnızca UX içindir; yetki sunucudadır.

### 1.3 Tasarım sistemi

| Öğe | Uygulama | Kanıt |
|---|---|---|
| Logo | Web'deki `apps/web/public/brand/vitruv-logo-v2.png` **byte-identical** kopyalandı → `apps/mobile/assets/brand/vitruv-logo.png` (`cmp` ile doğrulandı). Oran 704:400 korunuyor. Koyu temada web'deki gibi yalnızca `invert(1)` uygulanıyor (`--vt-logo-filter`, `apps/web/src/lib/theme.ts`). Yeniden çizim yok | `lib/shared/ui/brand.dart` `VitruvLogo` |
| Renkler | Tek kaynak `packages/design-tokens/src/tokens.ts` → `vitruv_tokens.g.dart`. Doğrulanan değerler: bg `#050505`, fg `#f2f2ee`, surface `#0e0e0e`, accent `#4d8dff`, accentText `#5b9dff`, success `#3ddc97`, warning `#ffc24b`, error `#ff6b6b` | `VitruvColors.dark` |
| Turuncu (spark) | **Yeni token** `appBrandColors`. Değerleri `referencePalette.*.spark` değerinden türetiliyor (`#fc734d` dark / `#b5401f` light), elle kopyalanmadı ve ayrışamaz. Yalnızca Dart çıktısına gidiyor | `tokens.ts`, `generate-dart.ts` → `VitruvBrandColors`; `VitruvTheme.sparkOf(context)` |
| Timer tipografisi | **Yeni token** `appTypeScale.timer` (Chakra Petch 700, 72→96) ve `timerCompact` (40→48). Tema `displayMedium` / `displaySmall` slotlarını tabular rakamlarla dolduruyor. Mevcut dinlenme sayacı artık marka fontunu kullanıyor (önce Material varsayılanına düşüyordu) | `app_theme.dart` |
| Fontlar | Chakra Petch 700/700i, Barlow Condensed 600, Barlow 400/500/600; dosyalar zaten bundle'da, OFL lisans metinleri kayıtlı | `pubspec.yaml`, `lib/main.dart` |
| Butonlar | Mevcut `VitruvButton` (primary/secondary/ghost, chamfer köşe, 48 px, loading/disabled) korundu. Web `.r-btn` ile uyumlu (Sprint 0 audit) | `lib/shared/ui/button.dart` |
| Text input | **Yeni:** `InputDecorationTheme` = web `.vt-input`: sunken dolgu, hairline çerçeve, xs radius, focus'ta accent, hata durumunda error rengi, 48 px min yükseklik, hata metni kesilmiyor | `app_theme.dart` |
| Diğer bileşenler | Kart, durum göstergeleri, eyebrow/başlık, loading/hata/boş durum widget'ları mevcuttu ve token tabanlı; yeniden yazılmadı | `lib/shared/ui/*`, `lib/shared/widgets/*` |

Validasyon: `validate.ts` app tip rollerini de kontrol ediyor (12 px altı yok, yüklü font yüzü şart). `pnpm --filter @vitruv/design-tokens test` 106/106 geçti; `check` "up to date" verdi; typecheck, lint ve prettier temiz.

**CMS tema notu (DOGRULANAMADI):** Canlı CMS "Farben & Design" değerleri DB'de tutuluyor ve okunmadı. Public site renkleri `referencePalette`'ten geliyor (`(site)/layout.tsx` → `referenceThemeCss()`). CMS teması yalnızca `/mein-training` ve login sayfasına uygulanıyor. Uygulama koddaki varsayılanları kullanıyor; CMS'te farklı bir tema seçilirse uygulama bunu otomatik **izlemez**.

### 1.4 Almanca arayüz
- Uygulama `locale: Locale('de')` ile çalışıyor (zaten öyleydi). iOS `CFBundleLocalizations` artık yalnızca `de`, `CFBundleDevelopmentRegion` = `de`.
- Login metinleri: "Willkommen bei VITRUV", "Teilnehmer-Login", "Benutzername oder E-Mail", "Passwort", "Anmelden", "Passwort vergessen? Dein Coach richtet dir ein neues Passwort ein."
- Backend hata kodları Almanca mesajlara eşleniyor:
  - `UNAUTHENTICATED` / `VALIDATION_FAILED` → genel kimlik bilgisi hatası
  - `RATE_LIMITED` → "Zu viele Versuche …"
  - ağ hatası → "Keine Verbindung …"
  - diğerleri → genel hata
- **"Passwort vergessen?":** API'de self-service şifre sıfırlama akışı **EKSIK**. Yalnızca staff'ın kullandığı `PUT /v1/admin/clients/:id/password` ve CLI var. Bu yüzden çalışmayan bir buton yerine yönlendirici bir metin bırakıldı; akış uydurulmadı.
- `app_en.arb` dosyası silinmedi (geri alınabilirlik için). Locale sabit `de` olduğundan görünmüyor; kaldırılması owner kararına bırakıldı.

### 1.5 Login ekranı
Logo, marka fontları ve renkleri, tek alanda kullanıcı adı veya e-posta, şifre ve görünürlük düğmesi, yükleniyor durumu, doğrulama, API hata yönetimi var. Klavye için `SafeArea` + `SingleChildScrollView` kullanılıyor ve içerik en fazla `measureNarrow` genişliğinde. 320 pt genişlikte taşma yok (testli). Register, hesap oluşturma veya coach kaydı yok (testli).

### 1.6 iOS proje yapılandırması

| Ayar | Durum |
|---|---|
| Display name | `VITRUV` (`CFBundleDisplayName`, `CFBundleName`) |
| Yön | iPhone: **yalnızca portrait**. iPad girişi değiştirilmedi (`UISupportedInterfaceOrientations~ipad`); `TARGETED_DEVICE_FAMILY = "1,2"` duruyor, iPad desteği ayrı bir karar |
| Deployment target | 15.0 (değiştirilmedi) |
| Bundle id | `com.vitruv.vitruvMobile` **geçici olarak kaldı** (aşağıdaki karar notu) |
| Signing / Team | Team ID yazılmadı; `CODE_SIGN_STYLE = Automatic` kaldı |
| Privacy manifest | **Yeni** `ios/Runner/PrivacyInfo.xcprivacy`. Xcode projesine eklendi (`project.pbxproj`: file reference, Runner grubu, Resources build phase). İçerik aşağıda |
| App icon | Tüm `AppIcon.appiconset` boyutları orijinal logodan üretildi: `#050505` zemin, web'in koyu tema davranışı olan ters çevrilmiş logo, oran korunmuş, 1024 px ikon alfa kanalsız (RGB) |
| Launch screen | Arka plan `#050505` (beyaz flaş yok), ortada ters çevrilmiş logo (176×100 @1x/2x/3x) |
| Entitlements | Yok; şu an gereksiz (push ve App Groups yok) |
| ATS | `NSAllowsLocalNetworking` (yalnızca yerel geliştirme). Production `https` zorunluluğu `AppConfig` içinde |

**Privacy manifest içeriği (gerçek kullanıma göre):**
- `NSPrivacyTracking = false`, tracking domain yok.
- `NSPrivacyAccessedAPITypes` boş: uygulamanın kendi Dart kodu required-reason API kullanmıyor. Flutter engine ve plugin'ler (`flutter_secure_storage_darwin`, `video_player_avfoundation`) kendi manifestlerini taşıyor (pub cache'te doğrulandı).
- Toplanan veri:
  - EmailAddress ve UserID: giriş adı.
  - Fitness: girilen antrenman sonuçları.
  - Hepsi hesaba bağlı, takip yok, amaç "App Functionality".
- Not: `pdfx` ve `path_provider` kullanılmıyor. `pdfx` için pub cache'te bir manifest bulunamadı. Bağımlılık değişikliği bu sprintte yapılmadı (aşağıda risk).

**Release configuration kararı (bundle id):** Gerçek Apple bundle id onaylanmadığı için `com.vitruv.vitruvMobile` bilinçli olarak geçici bırakıldı; rastgele kalıcı bir id seçilmedi. App Store Connect'te kayıt oluşturulduktan sonra bundle id bir kez değiştirilemez. Bu yüzden owner'ın gerçek id'yi onaylaması gerekiyor (öneri biçimi: `com.<şirket-domain>.vitruv`). Değişiklik `project.pbxproj` içinde 3 Runner build config'i ve 3 RunnerTests config'inde yapılacak.

### 1.7 API konfigürasyonu
- `API_BASE_URL` ve `APP_ENV` derleme sırasında `--dart-define` ile veriliyor (`lib/core/config/app_config.dart`).
  - Varsayılan: geliştirme ortamında yerel API (`localhost:4000`, Android emülatörde `10.0.2.2:4000`).
  - Production'da `https` zorunlu, değilse uygulama başlamaz.
- **Production API adresi DOGRULANAMADI.** Repoda (kod ve dokümanlar) yok; tahminle sabitlenmedi. API URL'si bir secret değildir; build komutunda verilir:
  ```
  flutter build ipa --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://<onaylanacak-api-host>
  ```
- Production'a hiçbir test isteği gönderilmedi. Tüm testler sahte backend'e (`test/support/fake_backend.dart`) karşı ve kurgusal hesaplarla çalıştı.

---

## 2. Değişen dosyalar

**Flutter (`apps/mobile`)**
- Auth:
  - `lib/auth/auth_api.dart`: loginId, `normalizeLoginId`, `isValidLoginId`.
  - `lib/auth/auth_models.dart`: nullable email.
  - `lib/auth/auth_state.dart`: `login(loginId, …)`.
- Ekranlar:
  - `lib/features/auth/login_screen.dart`: logo, yeni alan, doğrulama.
  - `lib/features/profile/profile_screen.dart`: e-postasız profil.
- Tema ve tokenlar:
  - `lib/core/theme/app_theme.dart`: timer slotları, input teması, spark.
  - `lib/core/theme/vitruv_tokens.g.dart`: **generated**.
- Bileşenler: `lib/shared/ui/brand.dart` (yeni), `lib/shared/ui/ui.dart` (export).
- Dil dosyaları: `lib/l10n/app_de.arb`, `app_en.arb` ve generated `app_localizations*.dart`.
- Paket ve asset: `pubspec.yaml` (logo asset'i), `assets/brand/vitruv-logo.png` (yeni).
- iOS projesi:
  - `ios/Runner/Info.plist`
  - `ios/Runner/PrivacyInfo.xcprivacy` (yeni)
  - `ios/Runner.xcodeproj/project.pbxproj`
  - `ios/Runner/Base.lproj/LaunchScreen.storyboard`
- iOS görselleri: `ios/Runner/Assets.xcassets/AppIcon.appiconset/*.png` (15) ve `LaunchImage.imageset/*.png` (3).
- Testler:
  - `test/auth/sprint1_auth_test.dart` (yeni)
  - `test/auth/login_flow_test.dart` (metinler)
  - `test/support/fake_backend.dart` (username, e-postasız ve ADMIN hesapları; login gövdesi kaydı)

**Design tokens (`packages/design-tokens`)**
- `src/tokens.ts`: `appBrandColors`, `appTypeScale`.
- `src/generate-dart.ts`: `VitruvBrandColors` ve app tip rolleri.
- `src/validate.ts`: app rollerini de doğruluyor.

API, web, DB, contracts: **değişiklik yok.**

---

## 3. Test sonuçları (Windows, 2026-11-22)

| Komut | Sonuç |
|---|---|
| `flutter pub get` | OK |
| `flutter analyze` | **No issues found** |
| `flutter test` | **257/257 geçti** (sprint öncesi taban çizgisi 239/239; +18 yeni) |
| `pnpm --filter @vitruv/design-tokens test` | 106/106 |
| `pnpm --filter @vitruv/design-tokens check` | up to date (web CSS değişmedi) |
| design-tokens typecheck + lint + prettier | temiz |

Sprint öncesi bilinen hata yoktu. Hiçbir test silinmedi veya devre dışı bırakılmadı. `login_flow_test.dart` içindeki üç metin beklentisi yeni Almanca metinlere güncellendi.

**İstenen 15 senaryo → testler**

| # | Senaryo | Test |
|---|---|---|
| 1 | E-posta ile login | `sprint1_auth_test` T1 (istek gövdesi + `clientType: MOBILE`) |
| 2 | Kullanıcı adıyla login | T2 (trim + lowercase) |
| 3 | E-postasız kullanıcı yanıtı | T3 (login + profil, çökme yok) |
| 4 | Yanlış şifre | T4 (+ bilinmeyen hesap aynı mesaj); `login_flow_test` |
| 5 | Süresi dolmuş access token refresh | T5; `refresh_concurrency_test` |
| 6 | Refresh token rotation | T6 (yeni çift saklanıyor, eski token sunucuda geçersiz); `refresh_concurrency_test` |
| 7 | Logout sonrası token temizliği | T7; `login_flow_test` (online + offline) |
| 8 | COACH reddi | T8 (+ oturum iptali); `login_flow_test` |
| 9 | ADMIN reddi | T9 |
| 10 | Teilnehmer login başarısı | T10 |
| 11 | Yeniden açılışta session restore | T11 ×2 (Teilnehmer geri yükleniyor; COACH oturumu restore'da sonlanıyor) |
| 12 | Bağlantı kopması | T12 (login sırasında offline → mesaj → tekrar deneme); `login_flow_test` (açılışta offline) |
| 13 | Login ekranı widget testi | T13 (320 pt taşma yok, Almanca metinler, şifre görünürlük düğmesi, register yok, istemci doğrulaması) |
| 14 | Logo ve tema kontrolü | T14 (asset yolu, ters çevirme, oran, semantics, bg/primary/spark, timer fontu) |
| 15 | Nullable email parsing | T15 ×3 (null, anahtar yok, login id kuralları) |

---

## 4. Bilinen eksikler

1. **Self-service "Passwort vergessen?"**: API'de yok (EKSIK). Yalnızca coach veya admin şifre belirleyebiliyor. Gerçek akış için SMTP ve yeni endpoint gerekir (roadmap S8).
2. **Production API URL'si** doğrulanamadı; build için owner'dan alınmalı.
3. **Canlı CMS teması** uygulamaya yansımıyor; uygulama koddaki varsayılan paleti kullanıyor.
4. **Uygulama ikonu** web logosunun raster PNG'sinden (704×400) üretildi. 1024 px ikonda logo yaklaşık 758 px genişlikte, yani hafif ölçek büyütme var. Vektör logo hâlâ asset gereksinimi.
5. `pdfx` / `path_provider` kullanılmıyor; `pdfx` privacy manifest taşımıyor olabilir (App Store'da uyarı riski). Kaldırma kararı bu sprintte verilmedi.
6. iPad yön ayarları ve iPad desteği (`TARGETED_DEVICE_FAMILY`) karara bağlı.
7. Rate limit sunucuda bellek içinde ve process başına (değiştirilmedi; Sprint 0 riski).

## 5. Açık Apple kararları

- Gerçek **bundle identifier** (kalıcı, App Store Connect'e bağlanır).
- **Apple Developer Team ID** ve signing (otomatik veya manuel).
- App Store Connect uygulama kaydı, ad ("VITRUV"), kategori (Health & Fitness?), yaş derecelendirmesi.
- **Privacy etiketleri**: manifestteki beyan (EmailAddress, UserID, Fitness; tracking yok) ile tutarlı doldurulmalı.
- Yalnızca iPhone mu, iPhone + iPad mi?
- **Hesap silme** (Guideline 5.1.1(v)): hesaplar web'de oluşturulsa da uygulamada silme yolu istenebilir. Kullanıcılar hard-delete edilmez; deaktivasyon talebi akışı planlanmalı.

## 6. Manuel test gereksinimleri (macOS + Xcode + gerçek iPhone)

Windows'ta **yapılamadı ve yapılmış gibi raporlanmıyor:**
- `pod install` / Swift Package çözümlemesi, `flutter build ios` / `flutter build ipa`, Xcode archive.
- `PrivacyInfo.xcprivacy`'nin build'e dahil olduğunun kontrolü (Xcode → Runner → Build Phases → Copy Bundle Resources) ve Xcode "Privacy Report".
- Uygulama ikonunun ve launch screen'in simülatör ve cihazda görünümü (köşe maskesi ve koyu açılış).
- Keychain davranışı:
  - Uygulama silinip yeniden kurulunca eski token'ın okunmaması beklentisi (iOS Keychain silmede kalabilir; ilk açılışta temizleme gerekip gerekmediği cihazda doğrulanmalı).
  - Cihaz kilitliyken `first_unlock_this_device` davranışı.
- Gerçek staging API'ye karşı e-posta ve kullanıcı adıyla giriş, COACH reddi, 15 dk sonra refresh, 30 gün boşta kalma sonrası çıkış.
- Klavye: iPhone SE (320 pt) ve Dynamic Type "AX" boyutlarında login ekranı. Şifre yöneticisi (iCloud Keychain) autofill'i.
- VoiceOver: logo etiketi "VITRUV", hata mesajlarının duyurulması (liveRegion).

## 7. Sprint 2 için bağımlılıklar

- **Owner kararı 1 (reçete modeli)** Sprint 2'nin ön koşulu: çalıştırılabilir kaynak program modeli mi olacak, dated plan mı? (roadmap §2)
- Sprint 2 migration içeriyor (canlı Neon). Owner onayı, yedek ve geri dönüş planı gerekiyor. `training_assignments_meaningful` constraint değişimi ayrıca onay istiyor.
- Sprint 1 mobil modellere yeni alan eklemedi. Sprint 2'de contracts'a gelecek opsiyonel alanlar mevcut Dart parser'larını bozmaz (bilinmeyen alanlar yok sayılıyor).
- Staging API URL'si ve kurgusal test hesapları (e-postalı + kullanıcı adlı) Sprint 2 öncesi hazır olmalı.
- macOS erişimi: Sprint 1 iOS doğrulaması (§6) Sprint 2 ile paralel yapılmalı.
