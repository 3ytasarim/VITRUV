# VITRUV iPhone Training App — Sprint Roadmap (Sprint 0 çıktısı)

> Durum: **Öneri.** Hiçbir sprint sahibin (owner) onayı olmadan başlamaz (CLAUDE.md → "Ask the project owner before starting a new sprint").
> Dayanak belgeler: [`ios-training-sprint0-audit.md`](ios-training-sprint0-audit.md),
> [`ios-training-data-model-audit.md`](ios-training-data-model-audit.md),
> [`ios-training-design-system-audit.md`](ios-training-design-system-audit.md).
> Durum etiketleri: MEVCUT / KISMEN MEVCUT / EKSIK / DOGRULANAMADI.

---

## 0. Başlangıç noktası (özet)

| Alan | Durum | Kanıt |
|---|---|---|
| Flutter iOS istemcisi | KISMEN MEVCUT. Büyük ölçüde yazılmış ama 2026-10'dan beri askıda; tek commit `89f2223` | `apps/mobile/lib/**`, `docs/MOBILE-ARCHITECTURE.md` |
| Mevcut hesaplarla mobil giriş | KISMEN MEVCUT. API hazır, mobil istemci geride | `POST /v1/auth/login` (`clientType: MOBILE`); `apps/mobile/lib/auth/auth_models.dart:52,85` `json.string('email')` zorunlu; `login_screen.dart` yalnızca e-posta |
| Token modeli | MEVCUT | opak token, access 15 dk, dönen refresh + yeniden kullanım tespiti; `apps/api/src/modules/auth/tokens.ts`, `auth.service.ts` |
| Coach'un çalıştırılabilir plan oluşturması | KISMEN MEVCUT | `program-builder.tsx` var ama linksiz; `program-create-form.tsx` hiçbir sayfada import edilmiyor; coach'lar `plan-editor.tsx`'i (`client_plans`) kullanıyor ve buradan oturum başlatılamıyor |
| Workout template kütüphanesi / kopyala / ata | EKSIK | `training_programs.client_user_id NOT NULL`; kopyalama yalnızca program içi (`programs.service.ts` `copyDay/duplicateWeek/duplicateDay`) |
| Oturum snapshot / geçmiş bütünlüğü | MEVCUT | `apps/api/src/modules/workouts/workouts.service.ts` `startWorkout()` (INSERT … SELECT snapshot) |
| A Warm-up | KISMEN MEVCUT | `WARMUP` bölümü var; reçetesiz atama `training_assignments_meaningful` check'i yüzünden engelli |
| B Oberkörper/Unterkörper | KISMEN MEVCUT | SETS_REPS + `rest_seconds` + sayaç var; MAX yok, ses yok, mobil gerçek tekrar göndermiyor (`workout_api.dart`) |
| C Gesamt-Wiederholungsziel | EKSIK | TOTAL_REPS yalnızca tek `actual_reps`; set ekleme uç noktası yok |
| D Core 5×40/20 | EKSIK | tur/faz modeli yok |
| Video | KISMEN MEVCUT | public URL + `video_player`; WebM yüklemesi kabul ediliyor (`media-sniff.ts`), iPhone WebM oynatmaz |
| İlerleme / karşılaştırma | EKSIK | coach yalnızca tekil oturum görüyor: `kunden/[id]/training/einheit/[sessionId]` |
| Production port 5017/5018, PM2 | DOGRULANAMADI | repoda yok; kod varsayılanları web `next start --port 3000`, API `API_PORT=4000` (`apps/api/src/config/env.ts`) |

## 1. Sprint sırası: önerilen düzenleme ve gerekçe

Brief'teki sıra (S2'de template kütüphanesi, S4–S6'da antrenman tipleri) bir bağımlılık sorunu taşıyor. Template'ler hangi alanları kopyalayacaksa (MAX, checklist, tur/iş/dinlenme, toplam hedef) o alanların **önce** veri modelinde bulunması gerekir. Aksi halde template tabloları iki kez migrate edilir. Ayrıca coach'un bugün kullandığı plan modeli oturum başlatamıyor. Bu yüzden iPhone ekranlarından önce coach tarafında "çalıştırılabilir program" yolunun açılması şart.

| # | Önerilen sprint | Brief'teki karşılığı | Migration? |
|---|---|---|---|
| 1 | Flutter iOS temeli, mevcut hesapla giriş, VITRUV tasarım sistemi | S1 | **Hayır** (yalnızca token'lara ekleme, opsiyonel) |
| 2 | **Antrenman veri modeli v2** (4 tip, MAX, checklist, tur/interval, idempotent setler) + coach program editörünün geri getirilmesi | S4–S6'nın veri kısmı öne çekildi | **Evet** (ek alanlar + bir check constraint değişimi, owner onayı) |
| 3 | Coach Workout Library: sınırsız template, kopyala, ata, müşteriye özel düzenleme | S2 | **Evet** (template tabloları + kaynak alanları) |
| 4 | iPhone Home, haftalık plan, workout özeti, Warm-up | S3 | Hayır |
| 5 | Oberkörper/Unterkörper: setler, gerçek tekrar, manuel dinlenme sayacı, ses + bildirim | S4 | Hayır |
| 6 | Gesamt-Wiederholungsziel + Core interval (5×40/20) | S5 + S6 | Hayır (alanlar S2'de) |
| 7 | Egzersiz videoları, antrenman geçmişi, coach ilerleme takibi | S7 | Muhtemelen hayır; gerekirse yalnızca indeks |
| 8 | iOS test, güvenlik, güvenilirlik, TestFlight | S8 | Hayır |

Not: S6, iki motoru tek sprintte topluyor. Brief'teki gibi ayrı tutmak istenirse S6a/S6b olarak bölünebilir; veri modeli S2'de hazır olduğu için ikisi de yalnızca mobil ve test işidir.

## 2. Sprint 1'den önce alınması gereken owner kararları

1. **Reçete modeli.** Önerimiz: çalıştırılabilir kaynak `training_programs → weeks → days → sections → exercise_assignments` olsun (snapshot ve oturum zaten buna bağlı). `client_plans` (dated plan) salt-okunur ya da geçiş modu olarak kalsın. Alternatif: dated plan'ı genişletmek. Bu durumda oturum/snapshot katmanının yeniden yazılması gerekir; önermiyoruz.
2. **Template görünürlüğü.** Stüdyo geneli mi (egzersiz kütüphanesi gibi), coach'a özel mi? Öneri: stüdyo geneli, sahibi kayıtlı (`visibility` alanı ile ileride daraltılabilir).
3. **Atamada kopyanın yeri.** Müşterinin aktif programına yeni bir gün olarak mı (öneri), yoksa her atamada yeni program olarak mı?
4. **Arka plan sayacı.** Kilit ekranında süre bitince yerel bildirim + ses istenecek mi? (Öneri: evet.)
5. **iOS kimliği.** Gerçek bundle id (şu an placeholder `com.vitruv.vitruvMobile`), Apple Developer Team, App Store adı.
6. **Production bilgisi.** API base URL'si, port/PM2 düzeni (5017/5018 repoda doğrulanamadı).
7. **Video politikası.** Egzersiz videoları yalnızca MP4/H.264 (+AAC) mı olsun? WebM iPhone'da oynamaz.
8. **Dil.** UI yalnızca Almanca. Mevcut `app_en.arb` kaldırılsın mı, kalsın mı?
9. **Uygulama ikonu / logo.** `apps/web/public/brand/vitruv-logo-v2.png` (raster) uygulama ikonu için yeterli mi, yoksa vektör logo mu beklenecek? Logo yeniden çizilmez.

---

## Sprint 1 — Flutter iOS temeli, mevcut hesapla giriş, tasarım sistemi

**Scope:** Askıdaki Flutter istemcisini güncel API sözleşmesine getirmek; Teilnehmer'in mevcut web hesabıyla (e-posta **veya** kullanıcı adı) giriş yapması; uygulamanın VITRUV kimliğiyle görünmesi. Antrenman ekranlarına yeni işlev eklenmez.

**User stories**
- Teilnehmer olarak web'de bana verilen e-posta/kullanıcı adı + şifreyle iPhone'da giriş yapmak istiyorum.
- E-postası olmayan bir Teilnehmer olarak da giriş yapabilmeliyim.
- Uygulamayı açtığımda oturumum (30 gün boşta kalma / 90 gün mutlak) korunmalı; çıkış yapınca token'larım silinmeli.
- Uygulama web sitesiyle aynı logo, renk ve yazı tiplerini kullanmalı; tüm metinler Almanca olmalı.

**Technical tasks**
1. `auth_models.dart`: `email` nullable; `username`/login id alanı `packages/contracts/src/auth.ts` (`currentUserSchema`, `clientSelfProfileSchema`) ile hizalanır.
2. `login_screen.dart`: alan "E-Mail oder Benutzername" olur; validasyon `authLoginIdSchema` kurallarına göre yapılır; hata mesajı genel kalır.
3. Sözleşme hizalama testleri: Dart modelleri için JSON fixture'ları (kurgusal veri) contracts örneklerinden üretilir.
4. COACH/ADMIN rolü mobilde: net bir "Diese App ist für Teilnehmer" ekranı + logout (`user_role.dart`).
5. Tasarım sistemi:
   - `tokens.ts`'e `spark` rolü ve `timer` tipografi rolü eklenir, generator çalıştırılır (`vitruv_tokens.g.dart`).
   - `AppTheme` boş TextTheme slotları (`displaySmall` vb.) doldurulur.
   - VButton varyantları eklenir: chamfer, tek köşe, outline/glass.
   - Eyebrow pill eklenir.
   - Bu değişiklik owner onayı gerektirir.
6. Logo: `vitruv-logo-v2.png` mobil asset olarak eklenir (yeniden çizilmez). Uygulama ikonu ve launch screen bu dosyadan üretilir (karar 9'a bağlı).
7. l10n: yalnızca `de` (karar 8). Ekranlarda sabit metin kalmaz.
8. iOS proje hijyeni:
   - Bundle id ve Team (karar 5).
   - Yalnızca dikey yön (`Info.plist`).
   - `PrivacyInfo.xcprivacy` taslağı.
   - Kullanılmayan `pdfx` / `path_provider` bağımlılıkları değerlendirilir.
9. API base URL `--dart-define` ile verilir; prod/staging/dev konfigürasyonu belgelenir (karar 6).

**Affected files:**
- Auth: `apps/mobile/lib/auth/*`, `apps/mobile/lib/features/auth/login_screen.dart`
- Tema ve UI: `apps/mobile/lib/core/theme/*`, `apps/mobile/lib/shared/ui/*`
- Dil: `apps/mobile/lib/l10n/*`, `apps/mobile/l10n.yaml`
- iOS projesi: `apps/mobile/ios/Runner/Info.plist`, `apps/mobile/ios/Runner.xcodeproj/project.pbxproj`
- Paketler: `apps/mobile/pubspec.yaml`
- Tokenlar: `packages/design-tokens/src/tokens.ts` (+ generated çıktılar)

**DB changes:** Yok. **API changes:** Yok (mevcut `/v1/auth/{login,refresh,logout,me}`, `/v1/client/me` kullanılır). **Web changes:** Yok. Token generator web CSS'ini de yeniden üretir; site görünümünün değişmediği doğrulanmalıdır.

**Dependencies:** Karar 5, 6, 8, 9. Production API'ye bağlanmadan önce test ortamı/URL netleşmeli.

**Acceptance criteria**
- E-postalı ve e-postasız (kullanıcı adlı) kurgusal test hesaplarıyla giriş çalışır; yanlış şifre tek, genel bir mesaj verir.
- Access token süresi dolunca kullanıcı fark etmeden refresh olur. Refresh reddedilirse kullanıcı login ekranına düşer. Logout sonrası Keychain boştur.
- CLIENT dışındaki roller uygulamaya giremez; API zaten 403/404 döner.
- `flutter analyze` temiz, `flutter test` yeşil. `pnpm -r lint typecheck test build` yeşil.
- Tüm ekranlar Almanca. Dokunma hedefleri ≥ 48. Dynamic Type 200%'de taşma olmaz.

**Testing strategy:** Windows'ta Dart birim/widget testleri (model parse, login validasyonu, refresh akışı mock'u) ve Android emülatörü. macOS+Xcode'da iOS simülatör build'i ve Keychain davranışı. iOS sonucu Windows'tan iddia edilmez.

**Risks:**
- Sözleşme kayması tekrar edebilir. Kontrat testleri CI'a eklenmeli.
- Rate limit bellek içinde ve process başına; çoklu PM2 instance'ta limitler bölünür.
- macOS erişimi yoksa iOS doğrulaması S8'e kayar.

---

## Sprint 2 — Antrenman veri modeli v2 + çalıştırılabilir program editörü

**Scope:** Dört antrenman tipinin ve MAX hedefinin veri modeline, API'ye ve coach editörüne eklenmesi; coach'un çalıştırılabilir programa UI'dan ulaşabilmesi; idempotent set kaydı.

**User stories**
- Coach olarak bir bölümü Warm-up (checklist), Kraft (set × tekrar/MAX + pause), Gesamt-Wiederholungsziel (toplam hedef + pause) veya Core (tur × iş/dinlenme) olarak tanımlamak istiyorum.
- Coach olarak müşteri sayfasındaki Training sekmesinden programı oluşturup düzenleyebilmeliyim.
- Teilnehmer'in ağ kopması nedeniyle tekrar gönderilen set kaydı çift kayıt oluşturmamalı.

**Technical tasks**
1. Ek migration'lar (öneri numaraları 0022–0024), ayrıntı: data-model audit §4, §8, §9:
   - Enum `training_section_format` (CHECKLIST, SETS, TOTAL_TARGET, CIRCUIT); `rep_target_type` (FIXED, MAX).
   - `workout_execution_mode`'a CHECKLIST, INTERVAL eklenir.
   - Bölümler: `format`, `rounds`, `work_seconds`, `round_rest_seconds`. Atamalar: `rep_target_type`, `checklist`. Bunların `workout_session_exercises` üzerindeki snapshot karşılıkları da eklenir.
   - `workout_exercise_sets`: `actual_duration_seconds`, `round_number`, `is_extra`, `client_set_id` + `unique(session_exercise_id, client_set_id)`, `client_recorded_at`.
   - `training_assignments_meaningful` check'i v2 ile değiştirilir (DROP + ADD CONSTRAINT). Bu kısıtı gevşetir, **owner onayı** gerekir.
2. Contracts (`packages/contracts/src/training.ts`, `workout.ts`): yeni alanlar opsiyonel ve geriye uyumlu eklenir; `prescriptionIssues()` tipe göre çalışır.
3. API:
   - `programs.service.ts` yeni alanları yazar/okur.
   - `workouts.service.ts` `startWorkout()` snapshot'ı yeni alanları da kopyalar.
   - Yeni uç nokta: `POST /v1/client/workouts/:sessionId/exercises/:exerciseId/sets`, `clientSetId` ile idempotent (TOTAL_TARGET ve CIRCUIT için).
   - Workout uç noktalarına makul bir rate limit.
4. Web:
   - `kunden/[id]/training/page.tsx` program listesi ve `program-create-form.tsx` görünür hale gelir.
   - `program-builder.tsx` tipe göre alanlar gösterir.
   - `plan-editor.tsx`'in rolü karar 1'e göre belirlenir.

**Affected files:**
- DB: `packages/db/src/schema/{training,workouts,enums}.ts`, `packages/db/migrations/00xx_*.sql`
- Contracts: `packages/contracts/src/{training,workout}.ts`
- API: `apps/api/src/modules/{training,workouts}/*`
- Web: `apps/web/src/components/admin/training/*`, `apps/web/src/app/admin/(shell)/kunden/[id]/training/**`

**DB changes:** Evet, yalnızca ekleme + bir constraint değişimi. Workflow: `pnpm db:generate` → SQL okunur → `pnpm db:migrate` → `pnpm db:inspect`. **Local DB = canlı Neon.** Migration owner onayıyla ve önceden yedek/branch planıyla uygulanır.

**API changes:** Ekleme yapılır; mevcut yanıtlar yeni opsiyonel alanlar dışında değişmez. Mevcut mobil/web istemcileri bozulmaz.

**Web changes:** Program editörü yeniden görünür olur; tip seçici ve tipe özel alanlar eklenir.

**Mobile changes:** Yok. Yalnızca modellere yeni opsiyonel alanlar eklenir, parse kırılmaz.

**Dependencies:** Karar 1. S1 ile paralel yürüyebilir (farklı katmanlar).

**Acceptance criteria**
- Coach dört tipi ve MAX'ı oluşturup kaydedebilir. Geçersiz kombinasyonlar Zod + DB tarafından reddedilir.
- Var olan programlar ve tamamlanmış oturumlar migration sonrası birebir aynı okunur (regresyon testi).
- Aynı `clientSetId` ile tekrarlanan istek tek satır üretir.
- COACH yalnızca atanmış müşterilerinde düzenleme yapabilir; kapsam dışı id 404 döner.
- Antrenman atama, beslenme ve müşteri oluşturma akışları bozulmaz (owner kuralı).

**Testing strategy:** Contracts birim testleri; API integration testleri (yalnızca kurgusal veriyle, canlı DB'ye yazmayan test düzeninde — mevcut `*.int.test.ts` altyapısının hangi DB'yi kullandığı önce doğrulanmalı); web bileşen testleri.

**Risks:**
- Canlı DB üzerinde migration. Yedek ve geri dönüş planı gerekir.
- Constraint değişimi destructive guard'ın kapsamı dışında. Manuel inceleme şart.
- Program/dated plan ikiliğinin coach'u karıştırması.

---

## Sprint 3 — Coach Workout Library (template / kopyala / ata / müşteriye özel düzenleme)

**Scope:** Sınırsız workout template; düzenleme, kopyalama ve sıralama; template'in müşteriye **derin kopya** ile atanması; kopyanın bağımsız düzenlenmesi; template değişikliklerinin mevcut kopyalara **yayılmaması**.

**User stories**
- Coach olarak "Oberkörper A" template'ini bir kez kurup kütüphanede saklamak istiyorum.
- Coach olarak template'i kopyalayıp "Oberkörper B" türetebilmeliyim.
- Coach olarak template'i Client A'ya atayıp 3×12'ye, Client B'ye atayıp 4×8'e çevirebilmeliyim. Bu değişiklikler birbirini ve template'i etkilememeli.
- Template'i sonradan değiştirdiğimde mevcut müşteri kopyaları aynı kalmalı.

**Technical tasks (öneri B, data-model audit §3)**
1. Migration'lar:
   - `workout_templates`, `workout_template_sections`, `workout_template_exercises` (S2'deki tip alanlarıyla aynı kolonlar), `template_visibility`.
   - `auth_event_type` değerleri: `TEMPLATE_CREATED`, `TEMPLATE_ARCHIVED`, `TEMPLATE_ASSIGNED`.
   - `training_days.source_template_id`, `source_template_version`, `assigned_from_template_at`; `workout_sessions.source_template_id`.
2. Yetkiler: `training.templates.read` / `training.templates.write`. ADMIN ve COACH'a verilir; **`website.*` COACH'a asla verilmez.**
3. API (`/v1/admin/training/templates`): list, create, get, update, duplicate, archive (hard delete yok), reorder exercises, `POST …/templates/:id/assign {clientId, programId, weekId}`. Atama tek transaction'da derin kopya yapar; müşteri kapsamı `clientAccessible()` ile kontrol edilir.
4. Web:
   - Admin menüsüne "Workout-Bibliothek" sayfası (liste, arama, kopyala, arşivle).
   - Template editörü `program-builder` bileşenlerini yeniden kullanır (DRY).
   - Müşteri Training sekmesinde "Aus Bibliothek zuweisen" diyaloğu.
   - Kopya üzerinde "Vorlage: Oberkörper A v3" kaynak etiketi.

**Affected files:**
- DB ve contracts: `packages/db/src/schema/training.ts` (veya yeni `templates.ts`), `packages/contracts/src/training.ts`
- API: yeni `apps/api/src/modules/training/templates.service.ts`, `training.routes.ts`, `apps/api/src/auth/*` (permission listesi)
- Web: `apps/web/src/app/admin/(shell)/…/bibliothek/**`, `apps/web/src/components/admin/training/*`

**DB changes:** Evet, yalnızca ekleme. **API changes:** Yeni uç noktalar; mevcutlar değişmez. **Web changes:** Yeni sayfa + atama diyaloğu. **Mobile changes:** Yok. Atanan kopya normal bir antrenman günü olarak gelir.

**Dependencies:** S2 (tip alanları), karar 2 ve 3.

**Acceptance criteria (brief örneği birebir test edilir)**
- Template 3×10. Client A kopyası 3×12, Client B kopyası 4×8 olarak düzenlenir. Template 3×10 kalır; A ve B birbirini etkilemez.
- Template 5×5'e değiştirilir. A ve B kopyaları değişmez. Yeni atamalar 5×5 alır.
- Tamamlanmış geçmiş oturumlar hiçbir düzenlemeden etkilenmez (snapshot).
- COACH, atanmamış bir müşteriye atama yapamaz (404).

**Testing strategy:** API integration testleri; izolasyon matrisi (template × A × B × geçmiş); web e2e akışı (kurgusal hesaplarla).

**Risks:** Kopyanın yerine dair belirsizlik (karar 3); büyük template'lerde transaction süresi; kütüphane büyüdükçe arama ve sayfalama ihtiyacı.

---

## Sprint 4 — iPhone Home, haftalık plan, workout özeti, Warm-up

**Scope:** Teilnehmer'in Home ekranı (bugünkü/sonraki antrenman), haftalık takvim, gün/workout özeti, Warm-up (checklist) akışı.

**User stories:**
- Teilnehmer olarak bu haftanın antrenmanlarını gün gün görmek istiyorum.
- Bir workout'a girince bölümleri ve egzersizleri önceden görüp "Training starten" diyebilmeliyim.
- Warm-up'ta egzersizleri işaretleyerek ilerleyebilmeliyim; tekrar ve sayaç yok.

**Technical tasks:**
1. Mevcut `training_screen.dart`, `training_day_screen.dart`, `training_day_tile.dart`, `home_screen.dart` S2 modeline uyarlanır.
2. `workout_controller.dart` bölüm formatına göre yönlendirme yapar (strateji deseni: `ChecklistRunner`, `SetsRunner`, `TotalTargetRunner`, `CircuitRunner`).
3. Warm-up runner: checklist işaretleri `PATCH …/exercises/:id` ile mevcut idempotent uç noktaya gönderilir.
4. Devam etme: `GET /v1/client/workouts/current` ile yarım kalan oturum açılışta önerilir.

**Affected files:** `apps/mobile/lib/features/{home,training,workout}/*`. **DB:** Yok. **API:** Yok veya küçük (haftalık görünüm için `GET /v1/client/training/active` yeterliyse yok). **Web:** Yok.

**Dependencies:** S1, S2. S3 içerik üretimi için faydalı ama şart değil.

**Acceptance criteria:**
- Haftalık plan web'deki programla birebir eşleşir.
- Warm-up işaretleri uygulama kapatılıp açılınca korunur.
- Bir egzersizde video yoksa ekran sorunsuz çalışır.

**Testing:** Widget testleri (runner seçimi, checklist durumu); Android emülatörü; iOS simülatörü (macOS).

**Risks:** Saat dilimi ve hafta başlangıcı (Pazartesi) tutarlılığı; uzun egzersiz adlarının Almanca metinlerde taşması.

---

## Sprint 5 — Oberkörper/Unterkörper: setler, gerçek tekrar, manuel dinlenme sayacı

**Scope:** Set bazında gerçek tekrar girişi (FIXED ve MAX); manuel başlatılan dinlenme sayacı; bitişte görsel + sesli sinyal; kilit ekranında bildirim.

**User stories:**
- Teilnehmer olarak her setten sonra gerçekten yaptığım tekrar sayısını girmek istiyorum. MAX setlerde hedef "MAX" görünmeli.
- Pausen-Timer'ı kendim başlatmak ve bitince ekran kilitliyken bile sesli/görsel uyarı almak istiyorum.

**Technical tasks:**
1. `workout_api.dart` `updateSet` `actualReps` gönderir (API zaten destekliyor).
2. Sayaç:
   - `countdown.dart` zaten duvar saatine dayalı (`_endsAt`); korunur.
   - Bitiş zamanı kalıcı olarak saklanır; uygulama yeniden başlayınca sayaç geri yüklenir.
   - Bitiş anı için `flutter_local_notifications` ile zamanlanmış yerel bildirim ve kısa ses.
   - Ön planda `AVAudioSession` ambient/mixWithOthers ile ses çalınır (müzik kesilmez).
   - Titreşim (mevcut) korunur.
3. "Sonraki set" geçişi; `prefers-reduced-motion` karşılığı (`MediaQuery.disableAnimations`) desteklenir.

**Affected files:** `apps/mobile/lib/features/workout/*`, `apps/mobile/pubspec.yaml`, `apps/mobile/ios/Runner/Info.plist` (bildirim izni metni). **DB/API/Web:** Yok.

**Dependencies:** S4; karar 4.

**Acceptance criteria:**
- Her set ayrı kaydedilir. Tekrarlanan istek çift kayıt üretmez.
- Ekran 90 sn kilitliyken 60 sn'lik pause bittiğinde bildirim gelir; uygulamaya dönünce sayaç 0 / "Pause vorbei" gösterir.
- Ses kapalı modda (sessiz anahtar) görsel + titreşim sinyali çalışır.

**Testing:** `fake_async` ile sayaç birim testleri (arka plan/ön plan geçişi simülasyonu). **Gerçek iPhone'da** kilit ekranı, sessiz mod ve bildirim izni reddi senaryoları (macOS + cihaz şart).

**Risks:**
- iOS arka planda Dart kodunu askıya alır; sinyal yalnızca zamanlanmış bildirimle garanti edilir.
- Kullanıcı bildirim iznini reddederse yalnızca uygulamaya dönüşte uyarı verilebilir.

---

## Sprint 6 — Gesamt-Wiederholungsziel + Core interval

**Scope C (Gesamt-Wiederholungsziel):** Toplam hedef (örn. 60 Klimmzüge); sınırsız set; her setin tekrarı kaydedilir; kalan tekrar otomatik hesaplanır; tekrar onaylanınca dinlenme sayacı **otomatik** başlar; hedefe ulaşılınca egzersiz biter ve son setten sonra sayaç **başlamaz**.

**Scope D (Core):** 5 round, 40 sn work / 20 sn rest; work ile başlar; fazlar otomatik değişir; büyük geri sayım; sesli ve görsel uyarılar; son round'un work fazından sonra biter (son rest yok).

**Technical tasks:**
1. `TotalTargetRunner`: kalan = hedef − Σ gerçek tekrar (istemcide gösterim, sunucuda doğrulama). Her set `POST …/sets` ile `clientSetId` taşır. Hedefe ulaşan set sayacı tetiklemez. Aşım serbesttir ve kaydedilir.
2. `CircuitRunner`:
   - Faz planı baştan mutlak zamanlarla hesaplanır (duvar saati). Arka plandan dönünce doğru faza atlanır.
   - Her faz geçişi için yerel bildirim + ses zamanlanır; iOS'un bekleyen bildirim limiti 64 olduğu için 5×2 = 10 bildirim sorun değildir.
   - Ekran açık kalsın (`wakelock_plus`).
   - Round tamamlanınca `actual_duration_seconds` / `round_number` kaydedilir.
3. Büyük countdown tipografisi: S1'deki `timer` rolü (Chakra Petch).

**Affected files:** `apps/mobile/lib/features/workout/*`. API: yalnızca S2'deki uç noktalar. **DB/Web:** Yok.

**Dependencies:** S2 (alanlar + set ekleme uç noktası), S5 (sayaç/ses/bildirim altyapısı).

**Acceptance criteria:**
- 60 hedef ile 15+15+12+10+8 → kalan 0; son setten sonra sayaç başlamaz; oturum özetinde 5 set ve 60 tekrar görünür.
- Core 5×40/20 toplam 5×40 + 4×20 = 280 sn sürer; ilk faz work'tür; ekran kilitlenip 2 dk sonra açıldığında doğru round/faz gösterilir.
- Ağ kopukken girilen setler yeniden denendiğinde çift kayıt oluşmaz.

**Testing:** Saf Dart faz planı ve kalan hesap birim testleri (sınır değerleri: 0 tekrar, aşım, tek set); widget testleri; gerçek cihazda kilit ekranı.

**Risks:** Kullanıcının Core sırasında uygulamayı tamamen kapatması (sunucu tarafında yalnızca tamamlanan round'lar kalır); arka planda ses kısıtları.

---

## Sprint 7 — Egzersiz videoları, antrenman geçmişi, coach ilerleme takibi

**Scope:**
- **Video:** Her tipte opsiyonel video, MP4 politikası, önbellek.
- **Teilnehmer geçmişi:** Tarih, ad, tip, egzersizler, set tekrarları, toplamlar, set sayısı, durum.
- **Coach paneli:**
  - Müşteri bazında geçmiş.
  - Önceki antrenmanla karşılaştırma.
  - Haftalık ilerleme.
  - Egzersiz bazlı gelişim.
  - Tamamlanan / bekleyen workout'lar.

**Technical tasks:**
1. Medya: egzersiz videoları için yükleme sırasında MP4/H.264 zorunluluğu veya uyarısı. Mevcut WebM varlıkları raporlanır; dönüştürme ayrı bir işlem olup owner onayı ister.
2. Mobil video:
   - `exercise_media.dart` `video_player` kullanır; HTTP önbelleği ve poster kare eklenir.
   - Hücresel veride otomatik oynatma kapalı.
   - Video yoksa yer tutucu gösterilmez, düzen bozulmaz.
3. API (salt-okuma): `GET /v1/client/workouts/history` genişletilir (tip, toplam tekrar, set sayısı).
   - Yeni admin uç noktaları `GET /v1/admin/clients/:id/progress?from&to` ve `…/exercises/:exerciseId/progress`.
   - Snapshot tablolarından okunur, kapsam `clientAccessible()` ile sınırlanır.
4. Web: `workout-history.tsx` genişletilir; karşılaştırma ve haftalık özet gösterilir. Grafikler token renkleriyle çizilir, grid deseni kullanılmaz.

**DB:** Muhtemelen yok; mevcut indeksler data-model audit'e göre yeterli, sorgu planları ölçülerek karar verilir. **API:** Salt-okuma uç noktaları. **Web:** Coach ilerleme görünümü. **Mobile:** Geçmiş ekranı (`progress_screen.dart`), video önbelleği.

**Dependencies:** S2–S6 (veri üretimi), karar 7.

**Acceptance criteria:**
- Coach bugün bir workout'u değiştirse de geçmiş oturum detayları değişmez.
- Toplam ve karşılaştırma sayıları snapshot'tan bağımsız olarak elle hesaplanan kurgusal fixture ile eşleşir.
- Video olmayan egzersiz hatasız açılır. MP4 video iPhone'da oynar.

**Testing:** API integration (kapsam/IDOR dahil); web bileşen testleri; cihazda video oynatma ve önbellek.

**Risks:** Public video URL'leri (bilinçli tasarım; egzersiz videoları hassas değil, ama müşteriye özel videolar PRIVATE kalmalı); büyük video boyutları.

---

## Sprint 8 — iOS test, güvenlik, güvenilirlik, TestFlight

**Scope:** QA matrisi, güvenlik incelemesi, TestFlight dağıtımı. Yalnızca macOS + Xcode + Apple Developer hesabıyla yapılabilir.

**Technical tasks:**
1. Güvenlik incelemesi:
   - IDOR matrisi (CLIENT/COACH/ADMIN × kendi/başkası).
   - Token süresi ve refresh yeniden kullanım tespiti.
   - Rate limit: bellek içi limitlerin çoklu instance'ta davranışı. Gerekirse paylaşımlı depo önerisi.
   - Loglarda token/şifre olmadığının kontrolü.
   - `npm audit` / `flutter pub outdated`.
2. Self-service şifre sıfırlama: bugün EKSIK, yalnızca staff/CLI var. Mobilde "Passwort vergessen?" coach'a yönlendirme metni mi olacak, gerçek akış mı? (owner kararı; gerçek akış SMTP ister).
3. Güvenilirlik:
   - Uçak modu, zayıf ağ ve yeniden deneme senaryoları.
   - Uygulama öldürülüp açılınca oturuma devam.
   - Arka plan sayaçları.
4. iOS: imzalama, App Store Connect kaydı, `PrivacyInfo.xcprivacy`, ikon setleri, TestFlight build'i ve iç test grubu.
5. Erişilebilirlik: VoiceOver etiketleri, Dynamic Type, kontrast (design-system audit'teki 4.18:1 notunun uygulamaya taşınmaması).

**DB/API/Web:** Bulgu düzeltmeleri dışında yok. **Acceptance:** TestFlight build'i iç testçilere dağıtılır; kritik/yüksek bulgu kalmaz; QA kontrol listesi tamamdır.

**Risks:** Apple incelemesinde hesap silme gereksinimi (App Store Guideline 5.1.1(v)): hesaplar web'de oluşturulsa da uygulamada hesap silme yolu istenebilir; kullanıcılar hard-delete edilmez, deaktivasyon akışı planlanmalı. Sağlık verisi algısı da risk: proje kuralı gereği sağlık alanı yok, privacy etiketleri buna göre doldurulur.

---

## 3. Migration özeti

| Sprint | Migration | İçerik | Onay |
|---|---|---|---|
| S1 | Hayır | — | — |
| S2 | **Evet** | tip/format enum'ları, MAX, checklist, round/work/rest, set alanları + `client_set_id` unique, constraint v2 | Owner onayı (constraint değişimi + canlı DB) |
| S3 | **Evet** | template tabloları, kaynak/lineage alanları, yetkiler, auth event değerleri | Owner onayı (canlı DB) |
| S4–S6 | Hayır | — | — |
| S7 | Muhtemel değil | ölçüme göre indeks | Gerekirse |
| S8 | Hayır | — | — |

Tüm migration'lar ekleme yapar; uygulanmış migration dosyaları düzenlenmez; `APPROVED_DESTRUCTIVE.json` boş kalır. Constraint değişimi guard tarafından yakalanmadığı için ayrıca belgelenir.

## 4. Sprint 1 öncesi kontrol listesi

- [ ] Karar 1–9 owner tarafından yanıtlandı
- [ ] macOS + Xcode erişimi ve Apple Developer Team bilgisi
- [ ] Test/staging API URL'si; production'a bağlanmadan mobil geliştirme
- [ ] Kurgusal test hesapları (e-postalı + kullanıcı adlı) yalnızca test ortamında
- [ ] `SPRINT-1-PLAN.md` ile çakışmanın kontrolü (mevcut eski sprint dosyası; yeni plan `ios-training-*` adlandırmasıyla tutulur)
