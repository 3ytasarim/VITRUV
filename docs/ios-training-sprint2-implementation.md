# iOS Training — Sprint 2 Implementation Report

> Tarih: 2026-11-22 · Kapsam: Training Data Model v2 & API Foundation.
> Commit/push **yok**. Production DB'ye bağlantı, migration, seed, push, deploy **yok**.
> Sprint 1 değişiklikleri (commit edilmemiş) korunuyor; reset, clean veya silme yapılmadı.
> İlgili: [migration planı](ios-training-sprint2-migration-plan.md) · [API contract'ları](ios-training-sprint2-api-contracts.md)

## 1. Mimari karar: tek çalıştırılabilir model

**Karar:** Çalıştırılabilir tek model mevcut zincirdir:
`training_programs → training_weeks → training_days → training_sections → training_exercise_assignments`.

Koç bu zinciri oluşturup atar, iPhone atanmış günü çalıştırır, başlatma da snapshot alan bir oturum açar.

**Kanıt (koddan):**

- `workout_sessions.training_day_id` ve `workout_session_exercises.training_exercise_assignment_id` bu zincire bağlıdır.
- `startWorkout()` snapshot'ı tek bir `INSERT … SELECT` ile `training_exercise_assignments`'tan alır.
- `client_plans` / `client_plan_items` (PlanEditor) set, tekrar ve dinlenme taşımaz. `docs/TRAINING-ARCHITECTURE.md`'ye göre bu tablolardan oturum oluşturulmaz.
- Dated plan'ı çalıştırılabilir yapmak, oturum/snapshot katmanının yeniden yazılması demekti. Bu, Sprint 0 roadmap'inde de önerilmemişti.

**Spec'ten sapma:** Spec'in tercihi "PlanEditor haftalık planlama UI'ı olsun" idi.

- Sprint 2'de PlanEditor'a dokunulmadı (UI Sprint 3).
- PlanEditor'ın ortak modele (program günlerine) yazması Sprint 3'ün işi.
- ProgramBuilder fonksiyonları (copyDay / duplicateWeek / duplicateDay) değişmeden uyumlu kalıyor: `copyDay` atamaları `...rest` ile kopyaladığı için yeni kolonları (`execution_type`, `reps_max`) otomatik taşır.

**İki gerçeklik oluşmaz:** Sprint 2 hiçbir ikinci "workout" tablosu açmadı. Şablonlar (`workout_templates*`) çalıştırılmaz; yalnızca programın içine **kopyalanır**.

**Production verisi nasıl korunuyor:**

- Yalnız additive DDL yazıldı.
- Mevcut satırların `execution_type` değeri NULL; NULL iken eski türetme kuralı birebir sürüyor (SQL `CASE`'in son dalları değişmedi).
- `client_plans` verisine dokunulmadı. Satır sayısı DOĞRULANAMADI, çünkü DB'ye bağlanılmadı.

## 2. Dört antrenman tipi

| Tip | Saklama (mevcut kolonlar tekrar kullanıldı) | Oturumda | Kayıt |
|---|---|---|---|
| A. Strength | `execution_type=STRENGTH`, `sets`, `reps` **veya** `reps_max=true`, `rest_seconds`, sıra = `sort_order`, video = egzersiz medyası | `SETS_REPS`, plan seti başına satır (`target_reps` MAX'ta null) | `PATCH …/sets/:n` (`actualReps` set başına) |
| B. Total reps | `execution_type=TOTAL_REPS`, `total_reps`, `rest_seconds` | `TOTAL_REPS`, satır yok → kaydedildikçe eklenir | **yeni** `POST …/sets` (`clientSetId`); kalan = hedef − toplam; hedefe ulaşınca biter, son setten sonra dinlenme yok |
| C. Core interval | `execution_type=INTERVAL`, `sets`=tur, `duration_seconds`=çalışma, `rest_seconds`=dinlenme (boş → 5/40/20) | `INTERVAL`, tur başına satır (`target_duration_seconds`) | `PATCH …/sets/:n` (`completed`, `actualDurationSeconds`); faz planı çalışmayla başlar |
| D. Warm-up | `execution_type=CHECKLIST`, sayı yok; video = egzersiz medyası | `CHECKLIST`, satır yok | yalnız `PATCH …/exercises/:id {status}`; sayı gönderilirse 400 |

**Warm-up ve production constraint'i:** Constraint değiştirilmedi. Uyumluluk metni olarak `"Abhaken"` saklanıyor; istemciye gösterilmiyor. Owner onaylı kalıcı çözüm `packages/db/proposals/` altında duruyor. Ayrıntı: migration planı §4.

## 3. Data model v2 (özet)

**Yeni kolonlar (hepsi NULL veya default'lu):**

- `training_exercise_assignments`: `execution_type`, `reps_max`
- `training_days`: `source_template_id`, `source_template_version`
- `workout_sessions`: `source_template_id`, `source_template_version`
- `workout_session_exercises`: `reps_max`
- `workout_exercise_sets`: `client_set_id`, `actual_duration_seconds`, `client_recorded_at`

**Diğer şema değişiklikleri:**

- Yeni index: `workout_exercise_sets_client_set_unique` (partial).
- Yeni tablolar: `workout_templates`, `workout_template_sections`, `workout_template_exercises`.
- Şablon tablolarının tip bazlı CHECK'i Warm-up'a sayısız izin veriyor; yeni tablo olduğu için production kuralı etkilenmiyor.

## 4. Şablonlar (foundation)

**İzolasyon:** Kopya modeli kullanılıyor. `copyTemplateForDay()` (`apps/api/src/modules/training/template-copy.ts`) saf bir derin kopyadır: yeni sıra numaraları üretir, aynı saklama kuralları (`storagePrescription`) uygulanır, gün üzerinde yalnız soy bilgisi (lineage = template id + version) kalır.

- Template A'dan Client A kopyası ile Client B kopyası farklı satırlar olur.
- Şablon düzenlemesi `version`'ı artırır ve hiçbir kopyaya ulaşmaz (test 12).
- Oturumlar zaten kendi snapshot'ını kullandığı için geçmiş etkilenmez.

**Sprint 3'e kalanlar:**

- Şablon CRUD uç noktaları, sahiplik/kapsam kuralları (COACH yalnız kendi şablonları mı, paylaşımlı kütüphane mi?) ve koç UI'ı.
- `copyTemplateForDay` çıktısını tek transaction'da insert eden uç nokta.

## 5. Oturumlar

**Durumlar:**

- DB'de mevcut durumlar korunuyor: `IN_PROGRESS`, `COMPLETED`, `ABANDONED`.
- `NOT_STARTED` türetilir: o gün için oturum yoksa veya yalnız terk edilmiş oturum varsa.
- Client programında gün başına `workoutStatus` olarak döner.

**Davranış:**

- **Devam:** `POST /v1/client/workouts` aynı gün için mevcut oturumu döner (`resumed: true`), `GET /current` da devam eden oturumu verir. Mevcut davranış korunuyor.
- **Snapshot:** INSERT…SELECT artık `reps_max` alanını da ve açık tipi de kopyalıyor; INTERVAL turları için satır üretiliyor.
- **Tamamlanmış oturum:** Immutable (409). Notlar istisna, bu mevcut davranış.

## 6. Set kalıcılığı ve eşzamanlılık

Her set ayrı bir satırdır. `client_set_id` uygulamada üretilir. Kapsam: `(session_exercise_id, client_set_id)`. Egzersiz tek bir oturuma, oturum da tek bir kullanıcıya ait olduğu için bu kapsam oturum ve kullanıcı başına anlamına gelir.

Mükerrer satırı üç katman engeller:

1. Aynı id saklıysa replay döner (`created:false`).
2. Oturum satırı `FOR UPDATE` ile kilitlenir; aynı oturuma yazan istekler sıraya girer.
3. Unique index + `ON CONFLICT DO NOTHING` uygulanır; yarışı kaybeden istek kazananın satırını döner.

Karar mantığı (`set-recording.ts`) saf fonksiyonlardan oluşur.

## 7. Yetkilendirme

**Danışan uç noktaları:**

- Hepsi `requirePermission('training.self.workout')` ile korunuyor; bu izin yalnız CLIENT'ta var.
- Her sorgu `client_user_id = principal.userId`; yolda ya da gövdede client id yok.

**IDOR davranışı:**

- Yabancı oturum ya da yabancı egzersiz id'si eksik id ile aynı 404'ü verir.
- Test 2 sızıntıyı enjekte edilmiş bir hatayla doğruladı: scope kaldırılınca test kırıldı, kod geri alındı.

**Koç yazımları:**

- Mevcut `programOf()` + `clientAccessible()` (COACH: aktif atanmış danışan) değişmeden kullanılıyor.
- COACH, danışan workout uç noktalarında 403 alıyor (yeni uç nokta dahil).

## 8. Test sonuçları (2026-11-22, Windows)

| Kontrol | Sonuç |
|---|---|
| `pnpm -r typecheck` | 7/7 paket temiz |
| `pnpm -r lint` | temiz (ilk turda 20 bulgu çıktı, düzeltildi: `==`, `!`) |
| `@vitruv/shared` test | **41** (önce 27, +14 `workout-engine.test.ts`) |
| `@vitruv/contracts` test | **100** (önce 90, +10 `sprint2.test.ts`) |
| `@vitruv/db` test | **17** (önce 12, +5 migration güvenliği) |
| `@vitruv/api` unit | **242** (önce 223, +19 `sprint2.test.ts`) |
| `@vitruv/web` test | **286/286** tek başına çalıştırıldığında. `pnpm -r test` paralel koşuda 6 web testi zaman aşımına uğradı (6–9 s/dosya); tek başına tümü geçiyor. Sprint 2 web koduna dokunmadı |
| `@vitruv/design-tokens` test + check | **106/106**, "up to date" |
| `pnpm -r build` | api OK. web: Next.js 16.4.1 ilk denemede "known security vulnerability" uyarısıyla durdu ("retry the same command"); ikinci denemede build başarılı. **Bağımlılık yükseltilmedi**, karar owner'da |
| `flutter analyze` | No issues |
| `flutter test` | **260/260** (257 baz + 3 `execution_mode_compat_test.dart`) |
| Integration (`test:integration`) | **ÇALIŞTIRILMADI**: izole test DB yok, yerel env production'ı gösteriyor |
| `drizzle-kit check` | Everything's fine |

### 14 senaryo → testler

| # | Senaryo | Test | Yöntem |
|---|---|---|---|
| 1 | Danışan kendi antrenmanını alır | api `sprint2.test.ts` "1." | servis + in-memory fake (contract'a göre doğrulandı) |
| 2 | Başka danışanınkini alamaz | "2." | servis + fake; SQL parametrelerinde yalnız çağıranın id'si var; mutasyon testi yapıldı |
| 3 | Koç yalnız yetkili danışanları yönetir | "3." | route 403 + `clientAccessible` SQL'i (coach_client_assignments, ended_at is null) |
| 4 | Snapshot korunur | "4." | okuma yolu `training_*` tablolarına hiç dokunmuyor |
| 5 | Aynı client_set_id → tek satır | "5." | servis + fake |
| 6 | Eşzamanlı retry → tek satır | "6a" (kilitli), "6b" (kilitsiz: unique index + ON CONFLICT) | servis + fake (eşzamanlı 2–3 bağlantı) |
| 7 | Warm-up repsiz geçerli | "7." + contracts | contract, storage shim, tick-off, sayı → 400 |
| 8 | Strength MAX kabul | "8." + contracts | contract, snapshot bayrağı, set başına actual |
| 9 | Total reps kalan doğru | "9." + shared | 12+10 → 38 kalan |
| 10 | Hedefte dinlenme yok | "10." + shared | son set `restSeconds:null`, COMPLETED, ek set 409 |
| 11 | Core 5×40/20 okunur | "11." + shared | config, 5 tur satırı, plan 280 s |
| 12 | Geçmiş şablon değişiminden etkilenmez | "12." | kopya izolasyonu + versiyon |
| 13 | Eski contract'lar çalışır | "13." + contracts | eski gövdeler ve eski yanıt şekli parse ediliyor |
| 14 | Mevcut kayıtlar korunur | "14." + db | eski TOTAL_REPS kaydı okunuyor ve yazılıyor; migration'da UPDATE/DELETE yok |

**Test altyapısı notu:** `apps/api/test/fake-pg.ts` gerçek bir DB değildir.

- Ne yapar: Drizzle'ın bu yazma yolunda ürettiği basit SQL'i bellek içinde yanıtlar. Unique anahtarları ve satır kilitlerini modeller; desteklemediği SQL'de exception atar.
- Neyi test etmez: `startWorkout`'un ham SQL'ini (INSERT…SELECT snapshot, advisory lock) ve gerçek PostgreSQL davranışını. Bunlar izole bir Neon branch'inde `test:integration` ile doğrulanmalı.

## 9. Değişen / yeni dosyalar (Sprint 2)

**Shared:**

- `packages/shared/src/workout.ts`
- `workout-engine.ts` (+test)
- `index.ts`

**DB:**

- `packages/db/src/schema/{enums,training,workouts,index}.ts`
- `templates.ts` (yeni)
- `migration-guard.ts` (+test)
- `migrations/0022_*`, `0023_*`, `meta/*`
- `proposals/warmup-checklist-constraint.sql`

**Contracts:**

- `packages/contracts/src/{training,workout}.ts`
- `sprint2.test.ts`

**API:**

- `apps/api/src/modules/training/programs.service.ts`
- `prescription-storage.ts` (yeni)
- `template-copy.ts` (yeni)
- `apps/api/src/modules/workouts/{workouts.service,workouts.routes}.ts`
- `set-recording.ts` (yeni)
- `sprint2.test.ts`
- `apps/api/test/fake-pg.ts`

**Flutter:**

- `apps/mobile/lib/features/workout/workout_models.dart` (forward-compatible enum)
- `test/workout/execution_mode_compat_test.dart`

## 10. Açık maddeler

1. Migration'ları önce bir Neon branch'inde uygulamak ve entegrasyon testlerini o branch'e karşı çalıştırmak (owner).
2. Warm-up constraint önerisini onaylamak ya da reddetmek (owner).
3. Next.js 16.4.1 güvenlik uyarısı: sürüm yükseltme kararı (owner).
4. Sprint 3:
   - PlanEditor'ın ortak modele yazması
   - şablon CRUD ve UI
   - koç UI'ında 4 tip
   - web portalında dinamik set kaydı
   - iPhone timer UI'ı
5. Yeni modlar koç UI'ında açılmadan önce yeni Flutter sürümünün dağıtılması (eski sürümler bilinmeyen modda hata verir).
