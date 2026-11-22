# VITRUV — iOS Training App: Veri Modeli ve API Denetimi

Tarih: 2026-11-22 · Kapsam: salt okunur denetim (kod, şema, migration, contract, route, web admin).
Hiçbir DB bağlantısı, migration veya ağ isteği yapılmadı. `.env*` dosyaları açılmadı.

Durum etiketleri: **MEVCUT** / **KISMEN MEVCUT** / **EKSIK** / **DOGRULANAMADI**.

> Not (migration sayısı): Görev tanımında "24 migration" geçiyor. Repoda `packages/db/migrations/`
> altında **22** SQL dosyası var (`0000_baseline.sql` … `0021_welcome_videos.sql`) ve
> `meta/_journal.json` içinde 22 kayıt bulunuyor. 0022/0023 dosyası **DOGRULANAMADI** (mevcut değil).

Okunan ana kaynaklar:

- Dokümanlar: `docs/TRAINING-ARCHITECTURE.md`, `docs/WORKOUT-ARCHITECTURE.md`, `docs/CLIENT-MANAGEMENT.md`, `docs/ARCHITECTURE.md`
- Şema: `packages/db/src/schema/{users,auth,coaching,training,workouts,media-assets,nutrition,welcome,enums,columns}.ts`
- Enum kaynakları: `packages/shared/src/{roles,training,workout,media,clients,auth}.ts`
- Contract: `packages/contracts/src/{training,workout,management,auth,media}.ts`
- API: `apps/api/src/app.ts`, `apps/api/src/modules/{training,workouts,management,media,auth,nutrition,welcome,dashboard}/*`
- Web: `apps/web/src/app/admin/(shell)/kunden/[id]/training/**`, `apps/web/src/app/admin/(shell)/training/uebungen/**`, `apps/web/src/components/admin/training/*`, `apps/web/src/app/admin/training-actions.ts`
- Mobil: `apps/mobile/lib/**` (`workout_api.dart`, `training_api.dart`, `auth_api.dart`, `pubspec.yaml`)
- Guard: `packages/db/src/migration-guard.ts`, `packages/db/migrations/APPROVED_DESTRUCTIVE.json` (içerik: `[]`)

---

## 0. Yönetici özeti

| Konu | Durum | Kısa kanıt |
| --- | --- | --- |
| Workout Template Library (koç kütüphanesi) | **EKSIK** | Şemada template tablosu/flag yok; `training_programs.client_user_id` NOT NULL (`trainingPrograms`, 0005). `grep template` API/DB/contract'ta eşleşme yok. |
| Template kopyala → danışana ata → bağımsız kopya | **EKSIK** (altyapı KISMEN) | Deep-copy mantığı yalnızca program içinde var: `copyDay()` / `duplicateWeek()` / `duplicateDay()` (`apps/api/src/modules/training/programs.service.ts:680-850`). Programlar arası kopya yok ("Moving items across parents is not supported", TRAINING-ARCHITECTURE §4). |
| Snapshot (geçmiş antrenmanlar plan değişikliğinden etkilenmez) | **MEVCUT** | `startWorkout()` tek `INSERT … SELECT` ile hedefleri `workout_session_exercises`'e kopyalar (`workouts.service.ts:360-457`). |
| Dört antrenman tipi | **KISMEN MEVCUT** | `SETS_REPS`, `TOTAL_REPS`, `DURATION`, `CUSTOM` (`WORKOUT_EXECUTION_MODES`). MAX tekrar, sınırsız set, round/work/rest interval **EKSIK**. Warm-up "alan yok" DB check'i ile engelleniyor. |
| Set log idempotency | **KISMEN MEVCUT** | `unique(session_exercise_id, set_number)` + mutlak değerli `PATCH …/sets/:n`. Idempotency-Key, client-generated id, client timestamp **EKSIK**. |
| Offline senkron | **EKSIK** | WORKOUT-ARCHITECTURE §7: "No offline queue / sync in Sprint 7". `pubspec.yaml`'da yerel DB/kuyruk paketi yok. |
| Koç web UI (program builder) | **KISMEN MEVCUT** | `ProgramBuilder` sayfası var ama `ProgramCreateForm` hiçbir sayfada import edilmiyor; Kund:in → Training sekmesi 2026-10-19'dan beri `PlanEditor` (tarihli plan) gösteriyor. |

---

## 1. Tablo envanteri

Tüm tablolarda `created_at`/`updated_at` (`timestamps`, `columns.ts`) vardır; aksi belirtilmedikçe PK `id uuid defaultRandom()`.

### 1.1 Kimlik, rol, oturum

| Tablo (Drizzle export) | Anahtar kolonlar | FK | Unique / check | Migration |
| --- | --- | --- | --- | --- |
| `users` (`users`) | `email` (nullable), `username`, `display_name`, `role user_role` (ADMIN/COACH/CLIENT), `status user_status`, `password_hash` (argon2id), `password_changed_at`, `last_login_at` | – | `users_email_lower_unique` (lower(email)), `users_username_unique`, `users_login_identifier` (email veya username), format check'leri | 0000 (tablo), 0003 (password kolonları), 0012 (`username`), 0016 (`email DROP NOT NULL`) |
| `auth_sessions` (`authSessions`) | `client_type` (WEB/MOBILE), `access_token_hash`, `refresh_token_hash`, `previous_refresh_token_hash`, `access_expires_at`, `refresh_expires_at`, `expires_at`, `revoked_at`, `revoked_reason` | `user_id → users` CASCADE | 3 hash kolonu unique; sha256 hex format check | 0003 |
| `auth_events` (`authEvents`) | `type auth_event_type`, `entity_id`, `session_id`, `client_type` | `user_id`, `actor_user_id → users` SET NULL | – | 0003; `actor_user_id` 0004; `entity_id` 0005 |
| `account_activation_tokens` (`accountActivationTokens`) | `token_hash`, `expires_at`, `consumed_at`, `revoked_at` | `user_id` CASCADE, `created_by_user_id` SET NULL | `account_activation_tokens_live_unique` (kullanıcı başına 1 canlı token) | 0004 |

Roller/izinler DB'de değil, kodda: `PERMISSIONS` ve `ROLE_PERMISSIONS` (`packages/shared/src/roles.ts`).

### 1.2 Koç ↔ danışan

| Tablo | Anahtar kolonlar | FK | Unique / check | Migration |
| --- | --- | --- | --- | --- |
| `coach_profiles` (`coachProfiles`) | `display_name`, `phone` | `user_id → users` RESTRICT (unique) | uzunluk check'leri | 0004 |
| `client_profiles` (`clientProfiles`) | `first_name`, `last_name`, `phone`, `coaching_status` (ACTIVE/PAUSED/COMPLETED), `internal_notes`, `archived_at` | `user_id` RESTRICT (unique), `created_by_user_id` SET NULL | uzunluk check'leri | 0004; `archived_at` 0020 |
| `coach_client_assignments` (`coachClientAssignments`) | `assigned_at`, `ended_at` | `coach_user_id`, `client_user_id` RESTRICT, `assigned_by_user_id` SET NULL | `coach_client_assignments_one_active` (client başına 1 aktif koç, partial), distinct check | 0004 |

### 1.3 Egzersiz kütüphanesi ve antrenman planı

| Tablo | Anahtar kolonlar | FK | Unique / check | Migration |
| --- | --- | --- | --- | --- |
| `exercise_categories` (`exerciseCategories`) | `name`, `sort_order` | – | `lower(name)` unique | 0017 |
| `exercises` (`exercises`) | `name`, `description` ("Ausführung"), `code` (ör. `OK-01`), `capture_type` ("Erfassung", serbest metin), `standard` (serbest metin, ör. "3 Sätze · Pause 1:30 Min."), `usage` ("Einsatz"), `active` | `media_asset_id → media_assets` RESTRICT, `category_id → exercise_categories` RESTRICT, `created_by_user_id` SET NULL | `exercises_name_lower_unique`, `exercises_code_unique`, code format | 0005; katalog kolonları 0017 |
| `training_programs` (`trainingPrograms`) | `client_user_id` **NOT NULL**, `title`, `description`, `status` (DRAFT/ACTIVE/COMPLETED/ARCHIVED), `starts_on`, `ends_on`, `activated_at`, `retired_at` | `client_user_id` RESTRICT, `created_by_user_id` SET NULL | `training_programs_one_active` (client başına 1 ACTIVE, partial) | 0005 |
| `training_weeks` (`trainingWeeks`) | `sort_order`, `title`, `notes` | `program_id` CASCADE | `unique(program_id, sort_order)` | 0005 |
| `training_days` (`trainingDays`) | `sort_order`, `title`, `notes`, `scheduled_weekday` (1–7, opsiyonel) | `week_id` CASCADE | `unique(week_id, sort_order)` | 0005 |
| `training_sections` (`trainingSections`) | `type training_section_type` (WARMUP/MAIN/FINISHER), `title`, `sort_order` | `day_id` CASCADE | `unique(day_id, sort_order)` | 0005 |
| `training_exercise_assignments` (`trainingExerciseAssignments`) | `sort_order`, `sets`, `reps`, `total_reps`, `duration_seconds`, `rest_seconds`, `target_weight`, `weight_unit`, `prescription_text`, `instructions_override` | `section_id` CASCADE, `exercise_id` RESTRICT | `unique(section_id, sort_order)`; `training_assignments_meaningful` (sets/reps/total_reps/duration_seconds/prescription_text'ten en az biri dolu) | 0005 |
| `client_plans` (`clientPlans`) | PK = `client_user_id`, `starts_on`, `ends_on` | `client_user_id` RESTRICT, `updated_by_user_id` SET NULL | period check | 0017 |
| `client_plan_items` (`clientPlanItems`) | `scheduled_on` (legacy), `ends_on`, `note`, `sort_order` — **set/tekrar/pause yok** | `client_user_id`, `exercise_id` RESTRICT | index'ler, period check | 0013; `ends_on` 0015; `scheduled_on DROP NOT NULL` 0017 |

### 1.4 Antrenman oturumları (workout sessions)

| Tablo | Anahtar kolonlar | FK | Unique / check | Migration |
| --- | --- | --- | --- | --- |
| `workout_sessions` (`workoutSessions`) | `program_title_snapshot`, `day_title_snapshot`, `week_order_snapshot`, `day_order_snapshot`, `status` (IN_PROGRESS/COMPLETED/ABANDONED), `started_at`, `completed_at`, `abandoned_at`, `client_note` | `client_user_id` RESTRICT, `training_program_id` RESTRICT, `training_day_id` **SET NULL** | `workout_sessions_one_in_progress` (client başına 1, partial); status⇔timestamp check | 0006; notlar 0010 |
| `workout_session_exercises` (`workoutSessionExercises`) | snapshot: `exercise_name_snapshot`, `instructions_snapshot`, `section_type`, `section_title_snapshot`, `section_order`, `sets`, `reps`, `total_reps`, `duration_seconds`, `rest_seconds`, `target_weight`, `weight_unit`, `prescription_text`, `execution_mode`; durum: `status` (PENDING/COMPLETED/SKIPPED), `completed_at`, `actual_reps`, `actual_duration_seconds`, `actual_weight`, `client_note` | `session_id` CASCADE, `training_exercise_assignment_id` SET NULL, `exercise_id` RESTRICT | `unique(session_id, sort_order)` | 0006; notlar 0010 |
| `workout_exercise_sets` (`workoutExerciseSets`) | `set_number`, `target_reps`, `target_duration_seconds`, `target_weight`, `actual_reps`, `actual_weight`, `completed_at` — **`actual_duration_seconds` yok** | `session_exercise_id` CASCADE | `workout_exercise_sets_number_unique (session_exercise_id, set_number)` | 0006 |

### 1.5 Medya, beslenme, karşılama (kısa)

| Tablo | Not | Migration |
| --- | --- | --- |
| `media_assets` (`mediaAssets`) | `kind` (IMAGE/VIDEO/DOCUMENT), `purpose` (WEBSITE/TRAINING_VIDEO/NUTRITION/CLIENT_UPLOAD/FEEDBACK_VIDEO), `visibility` (PUBLIC/PRIVATE), `storage_key` unique, `mime_type`, `duration_ms`, `width/height`, `focal_x/y` | 0000; `purpose` 0001; focal 0019 |
| `nutrition_documents` (`nutritionDocuments`) | client başına PDF versiyonu, PRIVATE medya, `nutrition_documents_one_active`, `unique(client_user_id, version_number)` | 0007 |
| `welcome_categories`, `welcome_videos` | "Willkommen" videoları, `media_asset_id` | 0021 |

---

## 2. Kavram eşleme tablosu

| Kavram | Mevcut karşılık | Durum |
| --- | --- | --- |
| Users | `users` (+ `auth_sessions`, `client_type MOBILE`) | **MEVCUT** |
| Coaches | `users.role='COACH'` + `coach_profiles` | **MEVCUT** |
| Participants (Teilnehmer) | `users.role='CLIENT'` + `client_profiles`; koç bağı `coach_client_assignments` | **MEVCUT** |
| Workout templates | Yok. `training_programs` her zaman bir danışana bağlı (`client_user_id NOT NULL`). | **EKSIK** |
| Workout exercises | `training_exercise_assignments` (program içi), `exercises` (kütüphane) | **MEVCUT** (yalnız danışan programında) |
| Workout assignments (template → danışan) | Yok; program doğrudan danışan için oluşturulur (`createProgram`, `programs.service.ts:423`). | **EKSIK** |
| Weekly schedule | `training_weeks` + `training_days.scheduled_weekday` (yalnız ipucu, takvim yok); `currentWeekId` `starts_on`'dan hesaplanır (TRAINING-ARCHITECTURE §3). Ayrıca `client_plans` dönemi. | **KISMEN MEVCUT** |
| Workout sessions | `workout_sessions` | **MEVCUT** |
| Exercise sets | `workout_exercise_sets` (yalnız `SETS_REPS`, başlangıçta sabit sayıda üretilir) | **KISMEN MEVCUT** (dinamik set ekleme yok) |
| Repetition logs | `workout_exercise_sets.actual_reps` (set başı), `workout_session_exercises.actual_reps` (TOTAL_REPS toplamı) | **KISMEN MEVCUT** (TOTAL_REPS'te set-başı log yok) |
| Timer config: rest seconds | `training_exercise_assignments.rest_seconds` → snapshot `workout_session_exercises.rest_seconds` | **MEVCUT** |
| Timer config: work/rest interval | Yalnız `duration_seconds` (tek çalışma süresi) + `rest_seconds`; interval başına ayrı alan yok | **KISMEN MEVCUT** |
| Timer config: rounds | Yok | **EKSIK** |
| Exercise videos | `exercises.media_asset_id → media_assets` (`purpose TRAINING_VIDEO`, PUBLIC); DTO `resolvedMediaSchema` | **MEVCUT** |
| Workout history | `GET /v1/client/workouts` (`workoutSessionSummaryListSchema`), coach: `GET /v1/admin/training/clients/:clientId/workouts` | **MEVCUT** (özet; trend/karşılaştırma yok) |

---

## 3. Workout Template Library (kritik gereksinim)

### 3.1 Bugünkü durum — kanıtlı

| Alt gereksinim | Durum | Kanıt |
| --- | --- | --- |
| Template modeli | **EKSIK** | `packages/db/src/schema/*.ts` içinde template tablosu yok; `trainingPrograms.clientUserId` `.notNull()`. |
| Sınırsız template oluşturma | **EKSIK** | Program oluşturma yalnız `POST /v1/admin/training/clients/:clientId/programs` (`createProgramRequestSchema`) ile ve kapsam içindeki danışana. |
| Düzenleme | **MEVCUT (program için)** | `PATCH /programs/:id`, `/weeks/:id`, `/days/:id`, `/sections/:id`, `/assignments/:id` (`training.programs.update`) — `mutate()` + `assertEditable()` (DRAFT/ACTIVE). |
| Çoğaltma (duplicate) | **KISMEN MEVCUT** | `POST /weeks/:id/duplicate` → `duplicateWeek()`, `POST /days/:id/duplicate` → `duplicateDay()`; ikisi de `copyDay()` ile section + assignment deep-copy yapar, ama **yalnız aynı program içinde**. Program/template çoğaltma endpoint'i yok. |
| Kütüphane görünümü | **EKSIK** | Web'de yalnız egzersiz kütüphanesi var (`/admin/training/uebungen`, `exercise-library.tsx`). |
| Egzersiz sıralama | **MEVCUT** | `POST /sections/:id/assignments/reorder` (`reorderRequestSchema`), `ordering.ts` `reorder()/normalize()/placeAfter()`; dense `sort_order` + unique. |
| Set sayısı, tekrar hedefi, pause, video | **MEVCUT** | `sets`, `reps`, `rest_seconds` (saniye), video `exercises.media_asset_id` üzerinden. |
| MAX tekrar hedefi | **EKSIK** | Yapısal alan yok; yalnız `prescription_text` serbest metni ("AMRAP"). Execution mode `CUSTOM`'a düşer ya da `reps` dolu ise sabit hedef olur. |
| Template → danışana kopya | **EKSIK** | Programlar arası kopya yok (TRAINING-ARCHITECTURE §4: "Moving items across parents is not supported"). |
| Danışana özgü bağımsız düzenleme | **MEVCUT (yapısal olarak)** | Her danışanın programı kendi satırları; A'nın `training_exercise_assignments` satırı B'yi etkilemez. Ancak ortak kaynak yok. |
| Versiyonlama / lineage | **EKSIK** | `source_template_id`, `version` vb. kolon yok. |
| Snapshot (oturum) | **MEVCUT** | `startWorkout()` snapshot; plan değişikliği geçmişi değiştirmez (WORKOUT-ARCHITECTURE §3). |
| Yetki | **KISMEN MEVCUT** | `training.programs.*` + `clientAccessible()` (`management.service.ts:148`). Template için ayrı izin yok. |
| Koç web UI | **KISMEN MEVCUT** | `ProgramBuilder` (`components/admin/training/program-builder.tsx`) yalnız `/admin/kunden/[id]/training/[programId]` doğrudan URL'si ile erişilebilir. `ProgramCreateForm` hiçbir sayfada import edilmiyor (yalnız test). `kunden/[id]/training/page.tsx` yorum: "Owner decision 2026-10-19: this replaces the week/day program screens here". |

Ek tespit: `client_plan_items` (dated plan, PlanEditor) yalnız egzersiz + not + sıra tutar; set/tekrar/pause yoktur ve dokümana göre "No workout sessions are created from these entries" (TRAINING-ARCHITECTURE "Dated client plan"). Yani bugün koçun web'de aktif kullandığı ekran, iPhone app'in çalıştıracağı yapısal antrenmanı **üretmez**.

### 3.2 Seçenekler

**Seçenek A — Program tablolarını yeniden kullan, `client_user_id NULL` = template.**
- Gerekli: `training_programs.client_user_id DROP NOT NULL` + `is_template boolean` (guard'a takılmaz; 0016'da benzer `DROP NOT NULL` yapıldı).
- Risk: `clientAccessible()` `exists (… u.role='CLIENT')` koşulu NULL için false döner → tüm builder endpoint'leri template'i 404 görür; her servis (`scopedProgram`, `programOf`, `startWorkout`, `activateProgram`, `listPrograms`, `toClientProgram`) iki ayrı kapsam mantığı ister. Program yaşam döngüsü (DRAFT/ACTIVE/one-active index) template için anlamsız. Bir template'in yanlışlıkla danışan DTO'suna sızma ihtimali kapsam hatasına bağlı kalır. Week katmanı template için gereksiz.

**Seçenek B — Ayrı template tabloları + atamada deep-copy (ÖNERİLEN).**
- Template = tek bir "Workout" (= bir antrenman günü). Hiyerarşi: `workout_templates → workout_template_sections → workout_template_exercises` (program'daki day → section → assignment ile birebir aynı alanlar).
- Atama: template'in o anki hali danışanın programına yeni bir `training_days` (+ sections + assignments) olarak **deep-copy** edilir; yeni satırlar yeni id alır.
- Lineage: `training_days.source_template_id` (FK SET NULL) + `training_days.source_template_version` (int) — salt bilgi amaçlı.
- Oturum: mevcut `POST /v1/client/workouts {trainingDayId}` hiç değişmeden çalışır; snapshot zaten var.

### 3.3 Öneri: Seçenek B — gerekçe

1. **İzolasyon yapı gereği**: template satırları ile danışan satırları farklı tablolarda; template düzenlemesi `training_*` tablolarına hiç dokunmaz → "template sonradan değişirse mevcut kopyalar değişmez" garantisi kodla değil şemayla sağlanır.
2. **Üç katmanlı bağımsızlık**: Template (koç kütüphanesi) → danışan kopyası (`training_days`/`training_exercise_assignments`, danışana özel; A 3x12, B 4x8) → oturum snapshot'ı (`workout_session_exercises`). Her katman bir öncekinden kopya alır, geri yazmaz.
3. **Mevcut kontratlar korunur**: `clientTrainingProgramSchema`, `workoutSessionSchema`, `startWorkoutRequestSchema` değişmez; Flutter'ın zaten çağırdığı `/v1/client/training/active` ve `/v1/client/workouts` aynen kullanılır.
4. **Kapsam mantığı basit kalır**: template kapsamı (organizasyon kütüphanesi) ile danışan kapsamı (`clientAccessible`) karışmaz.
5. **Mevcut kod tekrar kullanılır**: `copyDay()` (`programs.service.ts:680`) deep-copy deseni ve `ordering.ts` sıralama yardımcıları template tablolarına genellenebilir.

### 3.4 Önerilen şema (tamamı additive)

```
workout_templates
  id uuid pk
  title text not null (1..160)
  description text null (<= 4000)
  training_type workout_training_type not null      -- §4: WARMUP | STRENGTH | TOTAL_TARGET | CIRCUIT (veya bölüm bazlı, bkz. §4)
  body_focus text null                               -- "Oberkörper" / "Unterkörper" (etiket)
  version integer not null default 1                 -- her kaydetmede +1
  archived_at timestamptz null                       -- silmek yerine arşiv
  owner_user_id uuid null -> users (SET NULL)        -- oluşturan koç
  visibility template_visibility not null default 'SHARED'  -- SHARED | PRIVATE (sahip kararı, bkz. 3.6)
  duplicated_from_template_id uuid null -> workout_templates (SET NULL)
  created_at, updated_at
  index (archived_at, title)

workout_template_sections
  id, template_id -> workout_templates CASCADE, type training_section_type, title, sort_order
  + §4 alanları (format, rounds, work_seconds, round_rest_seconds)
  unique (template_id, sort_order)

workout_template_exercises
  id, section_id -> workout_template_sections CASCADE, exercise_id -> exercises RESTRICT, sort_order,
  sets, reps, total_reps, duration_seconds, rest_seconds, target_weight, weight_unit,
  prescription_text, instructions_override
  + §4 alanları (rep_target_type, ...)
  unique (section_id, sort_order)
  aynı check'ler (training_assignments_* ile birebir)

training_days  (ADD COLUMN, nullable)
  source_template_id uuid null -> workout_templates (SET NULL)
  source_template_version integer null
  assigned_from_template_at timestamptz null

workout_sessions  (ADD COLUMN, nullable — karşılaştırma için lineage snapshot'ı)
  source_template_id uuid null (FK yok veya SET NULL)
  training_type_snapshot ... (bkz. §4)
```

Yeni `auth_event_type` değerleri (`ALTER TYPE … ADD VALUE`, 0005/0014'teki gibi): `TEMPLATE_CREATED`, `TEMPLATE_ARCHIVED`, `TEMPLATE_ASSIGNED`.

### 3.5 Önerilen API (yeni, `/v1/admin/training` altında)

| Method + path | İzin (yeni) | Davranış |
| --- | --- | --- |
| `GET /templates?q=&type=&archived=` | `training.templates.read` | kütüphane listesi |
| `POST /templates` | `training.templates.write` | oluştur |
| `GET /templates/:id` | `training.templates.read` | tam ağaç |
| `PATCH /templates/:id` | `training.templates.write` | başlık/tip; `version += 1` |
| `POST /templates/:id/duplicate` | `training.templates.write` | deep-copy, "(Kopie)", `duplicated_from_template_id` |
| `POST /templates/:id/archive` · `/restore` | `training.templates.write` | arşiv (hard delete yok) |
| `POST /templates/:id/sections` · `/sections/reorder`, `PATCH/DELETE /template-sections/:id` | `training.templates.write` | builder ile aynı desen |
| `POST /template-sections/:id/exercises` · `/exercises/reorder`, `PATCH/DELETE /template-exercises/:id` | `training.templates.write` | aynı |
| `POST /templates/:id/assign` `{ clientIds: uuid[], programId?: uuid, weekId?: uuid, scheduledWeekday?: 1..7 }` | `training.templates.read` **ve** `training.programs.update` + her `clientId` için `clientAccessible()` | tek transaction: hedef program (yoksa ACTIVE "Trainingsplan" + 1 hafta oluşturma, sahip kararı) kilitlenir → `copyTemplateToDay()` → `TEMPLATE_ASSIGNED` audit |

Danışan kopyasının düzenlenmesi mevcut endpoint'lerle yapılır: `PATCH /days/:id`, `PATCH /assignments/:id`, `POST /sections/:id/assignments` vb. (kapsam: `programOf()` + `clientAccessible()`).

`PERMISSIONS`'a eklenecek: `training.templates.read`, `training.templates.write` → ADMIN (hepsi) ve COACH. CLIENT'a verilmez. Contract: `packages/contracts/src/training-templates.ts` (yeni dosya; `prescriptionShape` ve `prescriptionIssues()` yeniden kullanılır).

### 3.6 Açık sahip kararları

- Template görünürlüğü: organizasyon geneli (egzersiz kütüphanesi gibi, `training.exercises.*` modeli) mi, koç başına özel mi? Öneri: varsayılan SHARED; `visibility` kolonu ileride PRIVATE'ı açık tutar.
- Danışan kopyası nereye gider: (a) mevcut ACTIVE programın tek haftasına gün olarak (öneri — haftalık plan = `scheduled_weekday`), (b) her atamada yeni program. Ayrıca web'de gizlenmiş `ProgramBuilder` danışana özgü kopya düzenleyicisi olarak yeniden açılmalı mı, yoksa `PlanEditor` mi genişletilmeli? `client_plan_items` set/tekrar taşımadığından iPhone antrenmanı için yeterli değil.
- Template değişince "mevcut kopyalara uygula" isteğe bağlı bir aksiyon olsun mu? Öneri: hayır (gereksinim yayılmama diyor); yalnız UI'da "Vorlage wurde seit der Zuweisung geändert (v3 → v5)" bilgisi `source_template_version` karşılaştırmasıyla gösterilir.

---

## 4. Dört antrenman tipi — veri modeli desteği

Bugünkü alanlar:

- `training_section_type`: `WARMUP`, `MAIN`, `FINISHER` (`TRAINING_SECTION_TYPES`, `packages/shared/src/training.ts:11`) — bölüm etiketi; yürütme biçimini belirlemez.
- `workout_execution_mode`: `SETS_REPS`, `TOTAL_REPS`, `DURATION`, `CUSTOM` — `startWorkout()` içindeki SQL `CASE` ve `executionModeOf()` (`packages/shared/src/workout.ts`) ile **yapısal alanlardan türetilir**, saklanmaz-girilmez.
- DB check `training_assignments_meaningful`: `sets`, `reps`, `total_reps`, `duration_seconds`, `prescription_text`'ten en az biri zorunlu (Zod tarafında `prescriptionIssues()`).

| Tip | Gereken | Bugün | Durum | Boşluk |
| --- | --- | --- | --- | --- |
| **Warm-up** (tekrar/timer yok) | yalnız egzersiz listesi + "erledigt" | `CUSTOM` mode ancak `prescription_text` doluysa; alanlar boşsa DB check + Zod reddeder | **KISMEN MEVCUT** | "Alan yok" warm-up'ı kaydetmek için ya `prescription_text` zorlaması ya da check'in genişletilmesi gerekir. |
| **Oberkörper / Unterkörper** (set, tekrar veya MAX, pause) | sets, reps \| MAX, rest | `sets`, `reps`, `rest_seconds` → `SETS_REPS`; set başı `actual_reps` | **KISMEN MEVCUT** | MAX hedefi yok (`rep_target_type`). Oberkörper/Unterkörper yalnız etiket (gün/bölüm başlığı veya egzersiz kategorisi). |
| **Gesamt-Wiederholungsziel** (toplam hedef, sınırsız set, set başı tekrar, pause) | total target + dinamik set log | `total_reps` → `TOTAL_REPS`; yalnız egzersiz seviyesinde tek `actual_reps`; set satırı üretilmez (`WSET` insert yalnız `SETS_REPS`) | **KISMEN MEVCUT** | Dinamik set ekleme endpoint'i ve TOTAL_REPS için set satırları yok; toplam = set toplamı türetilmeli. |
| **Core** (round, work s, rest s) | rounds, work_seconds, rest_seconds (+ round arası pause) | yalnız `duration_seconds` + `rest_seconds` → `DURATION`; round kavramı yok; `workout_exercise_sets.actual_duration_seconds` yok | **EKSIK** | Interval/circuit modeli gerekli. |

### 4.1 Önerilen additive şema

Enum'lar (yeni tip veya `ADD VALUE`):

```
-- yeni enum
CREATE TYPE training_section_format AS ENUM ('CHECKLIST','SETS','TOTAL_TARGET','CIRCUIT');
CREATE TYPE rep_target_type AS ENUM ('FIXED','MAX');
-- mevcut enum genişletme (additive)
ALTER TYPE workout_execution_mode ADD VALUE 'CHECKLIST';
ALTER TYPE workout_execution_mode ADD VALUE 'INTERVAL';
```

`training_sections` (+ `workout_template_sections`) ADD COLUMN:
- `format training_section_format NULL` — NULL = bugünkü davranış (geri uyumlu türetme).
- `rounds smallint NULL` (CIRCUIT: 1..50), `round_rest_seconds integer NULL` (round arası).

`training_exercise_assignments` (+ `workout_template_exercises`) ADD COLUMN:
- `rep_target_type rep_target_type NULL` — NULL/`FIXED` = `reps`; `MAX` = tekrar hedefi "maksimum" (reps NULL olabilir).
- `work_seconds integer NULL` (CIRCUIT çalışma süresi; mevcut `duration_seconds` ile aynı anlamı taşıyabileceğinden alternatif: `duration_seconds`'u work olarak kullanmak — tercih: yeni kolon açmadan `duration_seconds` = work, `rest_seconds` = interval rest; böylece tek yeni kolon `rounds` bölümde kalır).
- Check: `rep_target_type = 'MAX'` ise `total_reps IS NULL`.

`training_assignments_meaningful` check'i: CHECKLIST ve MAX için genişletilmesi gerekir (ör. `… or rep_target_type = 'MAX' or <section format CHECKLIST>`). Check bölüm tablosuna bakamayacağı için pratik yol: assignment'a `checklist boolean not null default false` eklemek ve yeni check `training_assignments_meaningful_v2` = eski koşul **or** `checklist` **or** `rep_target_type='MAX'`; ardından eski check'in `DROP CONSTRAINT` ile kaldırılması. Not: `migration-guard.ts` desenleri `DROP CONSTRAINT`'ı yakalamaz (yalnız DROP DATABASE/SCHEMA/TABLE/COLUMN/TYPE, TRUNCATE, DELETE FROM, RENAME, ALTER COLUMN TYPE) — ama bu bir kısıt gevşetmesi olduğu için sahip onayı alınmalı ve dokümante edilmeli.

Snapshot (`workout_session_exercises`) ADD COLUMN: `rep_target_type`, `section_format`, `rounds`, `round_rest_seconds`, `checklist` — başlangıç `INSERT … SELECT`'ine eklenir.

Set/round log (`workout_exercise_sets`) ADD COLUMN:
- `actual_duration_seconds integer NULL` (CIRCUIT round çalışma süresi),
- `round_number smallint NULL` (CIRCUIT; set_number ile aynı da kullanılabilir),
- `is_extra boolean not null default false` (TOTAL_TARGET / MAX'te danışanın eklediği set),
- `client_set_id uuid NULL` + `unique(session_exercise_id, client_set_id)` (bkz. §8),
- `client_recorded_at timestamptz NULL`.

Yürütme kuralı (API, türetme sırası, geri uyumlu): `checklist` → CHECKLIST; section CIRCUIT veya `rounds` → INTERVAL (round başına satır = `rounds` adet); `sets`/`reps`/`MAX` → SETS_REPS; `total_reps` → TOTAL_REPS (artık set satırı ile); `duration_seconds` → DURATION; aksi CUSTOM. `executionModeOf()` (`packages/shared/src/workout.ts`) ve SQL `CASE` birlikte güncellenmeli (doküman: "same rule in SQL").

Yeni endpoint: `POST /v1/client/workouts/:sessionId/exercises/:exerciseId/sets` `{ clientSetId, actualReps?, actualWeight?, completed? }` → TOTAL_TARGET/MAX için set ekleme (idempotent, §8). `DELETE …/sets/:n` yalnız `is_extra` satırlar için.

---

## 5. Geçmiş ve snapshot

### 5.1 Tamamlanmış bir oturumun sakladıkları

| Bilgi | Kaynak | Durum |
| --- | --- | --- |
| Tarih / süre | `workout_sessions.started_at`, `completed_at`/`abandoned_at`; özet `durationSeconds` (`durationOf()`, `workouts.service.ts:69`) | **MEVCUT** |
| Antrenman adı | `program_title_snapshot`, `day_title_snapshot`, `week_order_snapshot`, `day_order_snapshot` | **MEVCUT** |
| Antrenman tipi | Yalnız egzersiz başına `section_type` + `execution_mode`; oturum seviyesinde tip yok | **KISMEN MEVCUT** |
| Egzersizler | `workout_session_exercises` (isim, talimat, hedef, sıra snapshot'ı) | **MEVCUT** |
| Set başı gerçek tekrar | `workout_exercise_sets.actual_reps` (+ `actual_weight`) — yalnız SETS_REPS | **KISMEN MEVCUT** |
| Toplamlar | Özet yalnız `exercisesTotal/Completed/Skipped`, `notesCount` (`workoutSessionSummarySchema`); toplam tekrar/hacim alanı yok (sorgu ile türetilebilir) | **KISMEN MEVCUT** |
| Set sayısı | set satırı sayısı (SETS_REPS) | **KISMEN MEVCUT** |
| Tamamlanma durumu | oturum `status` + egzersiz `status` (PENDING/COMPLETED/SKIPPED) | **MEVCUT** |
| Video | snapshot edilmez; `exercise_id` üzerinden güncel medya çözülür (WORKOUT-ARCHITECTURE §3) | **MEVCUT** (bilinçli tasarım) |

### 5.2 Bugün planı düzenlemek geçmişi değiştirir mi?

**Hayır — MEVCUT.** `startWorkout()` hedefleri kopyalar; `training_day_id` ve `training_exercise_assignment_id` `SET NULL`; program `FOR SHARE` kilitlenir. Doküman örneği: koç 4×12/60 → 5×8/90 yaparsa çalışan oturum 4×12/60 kalır (WORKOUT-ARCHITECTURE §3). Bitmiş oturumlar salt okunur (`ownRunningSession()` → 409). Önerilen template katmanı bu garantiyi bozmaz.

### 5.3 Karşılaştırma için gerekenler

| İhtiyaç | Bugün | Durum | Gerekli |
| --- | --- | --- | --- |
| Önceki oturum (aynı antrenman) | `training_day_id` ile eşleşir ama gün silinince NULL olur; template lineage yok | **KISMEN MEVCUT** | `workout_sessions.source_template_id` (+ gerekirse `training_day_id` korunurken) ve `GET /v1/client/workouts/:sessionId/previous` veya `GET /v1/client/workouts?dayId=` |
| Haftalık ilerleme | `workout_sessions_client_started_idx (client_user_id, started_at)` var; endpoint yok | **KISMEN MEVCUT** | `GET /v1/client/progress/weekly?from=&to=` (sayım, süre, toplam tekrar) |
| Egzersiz bazlı ilerleme | `workout_session_exercises_exercise_idx (exercise_id)` var; endpoint yok | **KISMEN MEVCUT** | `GET /v1/client/progress/exercises/:exerciseId` (oturum başı toplam/max tekrar, ağırlık) |
| Tamamlanan vs bekleyen | Planlı tarih yok (`scheduled_weekday` yalnız ipucu); bekleyen = bu hafta oturumu olmayan günler türetilebilir | **KISMEN MEVCUT** | Haftalık plan görünümü endpoint'i (`GET /v1/client/training/week?date=`), gün başı `completedSessionId` |
| Koç tarafı | `GET /v1/admin/training/clients/:clientId/workouts[/:sessionId]` | **MEVCUT** (özet/detay) | Aynı ilerleme endpoint'lerinin `clientAccessible` kapsamlı admin karşılıkları |

---

## 6. API endpoint envanteri

Montaj: `apps/api/src/app.ts:142-190`. `/v1/admin/*`, `/v1/auth/*`, `/v1/client/*` için `authenticate()` middleware. "Mobil" sütunu: `apps/mobile/lib` içinde path grep sonucu.

### 6.1 Auth

| Method + path | İzin | Contract | Mobil |
| --- | --- | --- | --- |
| `POST /v1/auth/login` | – (rate limit) | `loginRequestSchema` → `authSessionResponseSchema` | Evet (`auth_api.dart`) |
| `POST /v1/auth/refresh` | – | `refreshRequestSchema` → `authSessionResponseSchema` | Evet |
| `POST /v1/auth/logout` | oturum | `logoutRequestSchema` | Evet |
| `POST /v1/auth/logout-all` | oturum | – | Hayır |
| `GET /v1/auth/me` | oturum | `meResponseSchema` | Evet (`auth_state.dart`) |
| `POST /v1/auth/password` | oturum | `changePasswordRequestSchema` | Hayır |
| `POST /v1/auth/activation/check` · `POST /v1/auth/activate` | – (rate limit) | `activationCheckRequestSchema`, `activateRequestSchema` → `activateResponseSchema` (`PANEL`/`APP`) | Hayır |

### 6.2 Danışan / koç yönetimi

| Method + path | İzin | Kapsam | Contract |
| --- | --- | --- | --- |
| `GET /v1/admin/clients` | `clients.read` | COACH: aktif atanmış | `clientListQuerySchema` → `adminClientListSchema` |
| `POST /v1/admin/clients` | `clients.create` | | `createClientRequestSchema` → `createClientResponseSchema` |
| `GET /v1/admin/clients/coach-options` | `clients.assign` | | `coachOptionsSchema` |
| `GET /v1/admin/clients/:id` · `PATCH /:id` | `clients.read` · `clients.update` | client scope | `adminClientDetailSchema`, `updateClientRequestSchema` |
| `PUT /v1/admin/clients/:id/assignment` | `clients.assign` (ADMIN) | | `assignClientRequestSchema` |
| `PUT /:id/password` · `PUT /:id/account` · `POST /:id/activation` | `clients.account.manage` | client scope | `setClientPasswordRequestSchema`, `accountStatusRequestSchema`, `issuedActivationSchema` |
| `POST /:id/archive` · `POST /:id/restore` | `clients.archive` (ADMIN) | | – |
| `GET/POST /v1/admin/coaches`, `GET/PATCH /:id`, `PUT /:id/account`, `POST /:id/activation` | `coaches.*` (ADMIN) | | `createCoachRequestSchema`, `updateCoachRequestSchema`, `adminCoachListSchema` |
| `GET /v1/client/me` | `self:read` | self | `clientSelfProfileSchema` — **Mobil: Evet** (`training_api.dart`) |
| `GET /v1/admin/dashboard` | `clients.read` | | (`dashboard.ts`) |

### 6.3 Training (admin, `/v1/admin/training`)

| Method + path | İzin | Contract (request → response) |
| --- | --- | --- |
| `GET /exercise-categories` · `POST` | `training.exercises.read` · `.write` | `createExerciseCategoryRequestSchema` → `exerciseCategoryListSchema`/`exerciseCategorySchema` |
| `GET /exercises` · `POST` | `training.exercises.read` · `.write` | `exerciseListQuerySchema` → `adminExerciseListSchema`; `createExerciseRequestSchema` → `adminExerciseSchema` |
| `GET /exercises/:id` · `PATCH` · `DELETE` | `.read` · `.write` · `.write` | `updateExerciseRequestSchema`; DELETE yalnız hiç kullanılmamışsa (`deleteExercise()`, aksi 409) |
| `POST /exercises/:id/deactivate` · `/reactivate` | `.write` | – |
| `GET /clients/:clientId/plan` · `PUT` | `training.programs.read` · `.update` | `saveClientPlanRequestSchema` → `clientPlanSchema` |
| `GET /clients/:clientId/programs` · `POST` | `training.programs.read` · `.create` | `createProgramRequestSchema` → `adminProgramListSchema`/`adminProgramSchema` |
| `GET/PATCH/DELETE /programs/:id`, `GET /programs/:id/preview` | `.read`/`.update` | `updateProgramRequestSchema` → `adminProgramSchema`; preview → `clientTrainingProgramSchema` |
| `POST /programs/:id/activate` · `/complete` · `/archive` | `training.programs.activate` | – |
| `POST /programs/:id/weeks` · `/weeks/reorder` | `.update` | `weekInputSchema`, `reorderRequestSchema` |
| `PATCH/DELETE /weeks/:id`, `POST /weeks/:id/duplicate`, `POST /weeks/:id/days` · `/days/reorder` | `.update` | `updateWeekRequestSchema`, `createDayRequestSchema` |
| `PATCH/DELETE /days/:id`, `POST /days/:id/duplicate`, `POST /days/:id/sections` · `/sections/reorder` | `.update` | `updateDayRequestSchema`, `createSectionRequestSchema` |
| `PATCH/DELETE /sections/:id`, `POST /sections/:id/assignments` · `/assignments/reorder` | `.update` | `updateSectionRequestSchema`, `createAssignmentRequestSchema` |
| `PATCH/DELETE /assignments/:id` | `.update` | `updateAssignmentRequestSchema` |
| `GET /clients/:clientId/workouts?limit=` | `training.sessions.read` | `workoutHistoryQuerySchema` → `workoutSessionSummaryListSchema` |
| `GET /clients/:clientId/workouts/:sessionId` | `training.sessions.read` | → `workoutSessionSchema` |

Kapsam: tüm program/hafta/gün/bölüm/atama id'leri `scopedProgram()`/`programOf()` ile `clientAccessible(actor, training_programs.client_user_id)` üzerinden çözülür; kapsam dışı = 404. Yapı mutasyonları `mutate()` içinde program satırını `FOR UPDATE` kilitler.

### 6.4 Training media (`/v1/admin/training/media`)

| Method + path | İzin | Not |
| --- | --- | --- |
| `GET /` · `GET /:id` | `training.exercises.read` | `adminMediaListSchema`, `adminMediaDetailSchema` |
| `POST /` · `POST /:id/replace` | `training.exercises.write` | upload, büyük body limiti (`UPLOAD_PATHS`) |
| `PATCH /:id` | `training.exercises.write` | `updateMediaRequestSchema` |
| `DELETE /:id` | `training.media.delete` (ADMIN) | kullanılıyorsa 409 |
| `GET /media/*` | public | PUBLIC medya teslimi (egzersiz videoları) |

### 6.5 Client (self context)

| Method + path | İzin | Contract | Mobil |
| --- | --- | --- | --- |
| `GET /v1/client/training/active` | `training.self.read` | `clientActiveTrainingResponseSchema` | **Evet** (`training_api.dart`) |
| `GET /v1/client/training/plan` | `training.self.read` | `clientPlanSchema` | Hayır (yalnız web portal) |
| `GET /v1/client/workouts?limit=` | `training.self.workout` | `workoutSessionSummaryListSchema` | **Evet** |
| `POST /v1/client/workouts` | `training.self.workout` | `startWorkoutRequestSchema` → `startWorkoutResponseSchema` | **Evet** |
| `GET /v1/client/workouts/current` | `training.self.workout` | `currentWorkoutResponseSchema` | **Evet** |
| `GET /v1/client/workouts/:sessionId` | `training.self.workout` | `workoutSessionSchema` | Hayır |
| `PATCH /v1/client/workouts/:sessionId/exercises/:exerciseId` | `training.self.workout` | `updateWorkoutExerciseRequestSchema` → `workoutExecutionUpdateResponseSchema` | **Evet** |
| `PATCH /v1/client/workouts/:sessionId/exercises/:exerciseId/sets/:n` | `training.self.workout` | `updateWorkoutSetRequestSchema` → `workoutExecutionUpdateResponseSchema` | **Evet** |
| `PUT /v1/client/workouts/:sessionId/note` · `…/exercises/:id/note` | `training.self.workout` | `updateWorkoutNoteRequestSchema` → `workoutNoteResponseSchema` | Hayır |
| `POST /v1/client/workouts/:sessionId/complete` · `/abandon` | `training.self.workout` | → `finishWorkoutResponseSchema` | **Evet** |
| `GET /v1/client/nutrition/active` · `GET /:documentId/file` | `nutrition.self.read` | (`nutrition.ts`) | Hayır |
| `GET /v1/client/welcome` | `welcome.self.read` | (`welcome.ts`) | Hayır |

Ek: Flutter bağımlılıkları (`pubspec.yaml`): `dio`, `flutter_riverpod`, `go_router`, `flutter_secure_storage`, `video_player`, `pdfx`, `path_provider` — yerel veritabanı/kuyruk/bağlantı izleme paketi yok. WORKOUT-ARCHITECTURE §8a: "the Flutter client is suspended and unchanged" (müşteriler 2026-10-18'den beri web `/mein-training` kullanıyor).

---

## 7. Boşluk analizi

| Eksik özellik | DB | API | Web (koç) | Mobil (iPhone) | Migration |
| --- | --- | --- | --- | --- | --- |
| Template kütüphanesi (oluştur/düzenle/arşiv) | `workout_templates`, `workout_template_sections`, `workout_template_exercises`, yeni enum'lar | `/v1/admin/training/templates…` CRUD + reorder; `training.templates.*` izinleri; yeni contract dosyası | `/admin/training/vorlagen` liste + editör (builder-controls yeniden kullanımı) | – | Evet |
| Template duplicate | `duplicated_from_template_id` | `POST /templates/:id/duplicate` | "Duplizieren" butonu | – | Evet (yukarıdakiyle aynı) |
| Template → danışan atama (deep-copy) | `training_days.source_template_id`, `source_template_version`, `assigned_from_template_at` | `POST /templates/:id/assign` (çoklu client, transaction, audit) | Kund:in → Training'de "Vorlage zuweisen" + kopya editörü | – (yeni gün `/training/active`'te otomatik görünür) | Evet |
| Danışana özgü kopya düzenleme | mevcut | mevcut builder endpoint'leri | `ProgramBuilder`'ı tekrar erişilebilir yapmak / `ProgramCreateForm`'u bağlamak | – | Hayır |
| Template versiyon bilgisi | `workout_templates.version` | PATCH'te `version+1`; admin DTO'da kaynak/versiyon | "Vorlage geändert" rozeti | – | Evet |
| MAX tekrar hedefi | `rep_target_type` (assignment, template, snapshot) | contract `prescriptionShape` genişletme, `executionModeOf` | alan + "MAX" seçeneği | "MAX" etiketi, serbest tekrar girişi | Evet |
| Warm-up checklist (alan yok) | `checklist boolean`, `meaningful_v2` check | Zod kuralı | bölüm formatı seçimi | işaretleme listesi | Evet (+ eski check DROP CONSTRAINT, sahip onayı) |
| Toplam hedef + sınırsız set | `workout_exercise_sets.is_extra`, `client_set_id`; TOTAL_REPS için set satırları | `POST …/sets` (idempotent), `DELETE …/sets/:n` (extra) ; toplam türetme | – | set ekle, toplam ilerleme çubuğu | Evet |
| Core interval (round/work/rest) | `training_sections.format`, `rounds`, `round_rest_seconds`; set satırına `actual_duration_seconds`, `round_number`; enum `INTERVAL` | snapshot SQL + mode türetme; round satırı üretimi | bölüm formatı CIRCUIT formu | interval timer (mevcut `countdown.dart` genişletilir) | Evet |
| Oturum tipi / lineage snapshot | `workout_sessions.source_template_id`, `training_type_snapshot` | summary DTO genişletme (opsiyonel alanlar) | geçmişte tip | geçmiş filtreleri | Evet |
| Önceki oturum karşılaştırma | (index mevcut) | `GET /v1/client/workouts/:id/previous` | detayda "letztes Mal" | "Letztes Mal: 12/10/9" | Hayır |
| Haftalık/egzersiz ilerleme | (index mevcut) | `GET /v1/client/progress/weekly`, `/progress/exercises/:id` + admin karşılıkları | grafik | Fortschritt ekranı | Hayır |
| Haftalık plan tamamlanan/bekleyen | opsiyonel `training_days.scheduled_weekday` yeterli | `GET /v1/client/training/week` | – | "Diese Woche" görünümü | Hayır |
| Idempotent set log + offline | `client_set_id`, `client_recorded_at`; opsiyonel `api_idempotency_keys` | `Idempotency-Key` header desteği, client timestamp kabulü | – | yerel kuyruk (ör. `sqflite`/`drift`), yeniden deneme | Evet |
| Oturum offline başlatma | `workout_sessions.client_session_id uuid unique` (opsiyonel) | `POST /workouts` body'sine opsiyonel `clientSessionId` (contract `strictObject` → yeni alan opsiyonel eklenir) | – | çevrimdışı başlat, sonra senkron | Evet (opsiyonel) |

---

## 8. Idempotency ve offline senkron

### 8.1 Bugünkü durum

| Mutasyon | Idempotent mi? | Kanıt |
| --- | --- | --- |
| `POST /v1/client/workouts` (start) | **Evet (pratikte)** | Danışan başına advisory lock `pg_advisory_xact_lock(hashtext('vitruv.workout.start:<userId>'))`; aynı gün IN_PROGRESS varsa `200 {resumed:true}`; partial unique `workout_sessions_one_in_progress`. |
| `PATCH …/sets/:n` | **Büyük ölçüde** | Satır `unique(session_exercise_id, set_number)` ile önceden var; güncelleme mutlak değer (`actualReps`, `completed`). Tekrar = aynı durum. Yan etki: `completed:true` tekrarında `completed_at` sunucu `now`'ı ile yeniden yazılır. Yinelenen satır oluşamaz. |
| `PATCH …/exercises/:id` | **Büyük ölçüde** | mutlak değer; `completed_at` yeniden yazılır. |
| `POST …/complete` · `/abandon` | **Evet** | `finishWorkout()`: aynı hedef durumdaysa aynı özet döner; ters geçiş 409. |
| `PUT …/note` | **Evet** | tam değiştirme. |
| Gelecekte `POST …/sets` (dinamik set) | **Risk** | Client-generated id olmadan retry yinelenen set üretir. |

Eksikler: `Idempotency-Key` header desteği **EKSIK** (`grep -i idempoten` API'de yalnız auth logout ve management için yorum); client-generated id **EKSIK**; istemci zaman damgası **EKSIK** (tüm `completed_at` = sunucu `nowOf(deps)`), bu yüzden offline sonradan gönderilen kayıtlar yanlış saatle yazılır. Bitmiş oturuma geç gelen set güncellemesi 409 alır (`ownRunningSession()`).

### 8.2 Önerilen strateji

1. **Mutlak durum mutasyonları korunur**: set/egzersiz güncellemeleri "son durum" olarak gönderilir (delta değil) → yeniden deneme güvenli. Mevcut PATCH sözleşmesi bunu zaten sağlıyor.
2. **Oluşturma işlemlerinde client-generated UUID**: `POST …/sets { clientSetId }` + `unique(session_exercise_id, client_set_id)`; çakışmada mevcut satır döner (`INSERT … ON CONFLICT DO NOTHING RETURNING` + select). Opsiyonel `clientSessionId` (start).
3. **İstemci zamanı**: opsiyonel `clientRecordedAt` alanı (ISO); sunucu `started_at ≤ x ≤ now + tolerans` kontrolüyle kabul eder, aksi halde sunucu zamanı. Yeni alanlar contract'ta `.optional()` → mevcut `strictObject` kontratları geriye uyumlu genişler.
4. **Genel Idempotency-Key (opsiyonel, ikinci aşama)**: `api_idempotency_keys (user_id, key, method, path, request_hash, response_status, response_body jsonb, created_at)`, `unique(user_id, key)`, 24-48 saat TTL. Yalnız POST'lar için zorunlu tutulabilir.
5. **Mobil kuyruk**: yerel kalıcı kuyruk (ör. `drift`/`sqflite`), oturum başına FIFO, seri gönderim (mevcut "optimistic and serialised" davranışın kalıcı hali); `complete` her zaman kuyruğun sonunda; 409 `WORKOUT_IN_PROGRESS` ve "bereits beendet" için açık çatışma UI'ı.
6. **Bitiş sonrası senkron**: kuyruğun `complete`'ten önce boşaltılması zorunlu; alternatif olarak `complete` isteğine kuyruktaki set durumlarının toplu gönderimi (`POST …/complete { sets?: [...] }` opsiyonel alan) — tek atomik işlem.
7. **Offline başlatma**: Snapshot sunucuda üretildiği için en güvenli yol, çevrimiçi iken günün antrenmanını önceden başlatmak/önbelleğe almak; tam offline başlatma için `clientSessionId` + istemcide `/training/active` DTO'sundan yerel snapshot, senkronda sunucu snapshot'ı ile hedeflerin karşılaştırılması (fark varsa sunucu kazanır, uyarı).

---

## 9. Migration planı taslağı

Kurallar (`packages/db/src/migration-guard.ts`): `DROP DATABASE/SCHEMA/TABLE/COLUMN/TYPE`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE … RENAME`, `ALTER COLUMN … TYPE` içeren ve `APPROVED_DESTRUCTIVE.json`'da (şu an `[]`) listelenmeyen migration reddedilir. Aşağıdaki planın tamamı additive'dir; tek istisna §4'teki `DROP CONSTRAINT` (guard yakalamaz ama kısıt gevşetmesidir → sahip onayı ve doküman notu). Snapshot JSON'ları (`migrations/meta/00xx_snapshot.json`) drizzle-kit ile üretilmeli; mevcut sorun: `meta/_journal.json` 22 kayıt.

| Sprint (öneri) | Migration | İçerik | Destructive? |
| --- | --- | --- | --- |
| S-T1 Template kütüphanesi | `0022_workout_templates.sql` | `template_visibility` enum; `workout_templates`, `workout_template_sections`, `workout_template_exercises` (FK: exercises RESTRICT, users SET NULL, iç hiyerarşi CASCADE; unique sort_order; check'ler); `auth_event_type ADD VALUE 'TEMPLATE_CREATED','TEMPLATE_ARCHIVED','TEMPLATE_ASSIGNED'` | Hayır |
| S-T2 Atama + lineage | `0023_template_lineage.sql` | `training_days ADD COLUMN source_template_id uuid REFERENCES workout_templates ON DELETE SET NULL`, `source_template_version integer`, `assigned_from_template_at timestamptz`; `workout_sessions ADD COLUMN source_template_id uuid`; index'ler | Hayır |
| S-T3 Antrenman tipleri | `0024_training_formats.sql` | `training_section_format`, `rep_target_type` enum; `workout_execution_mode ADD VALUE 'CHECKLIST','INTERVAL'`; `training_sections`/`workout_template_sections` ADD `format`, `rounds`, `round_rest_seconds`; `training_exercise_assignments`/`workout_template_exercises` ADD `rep_target_type`, `checklist`; `workout_session_exercises` snapshot kolonları; `workout_exercise_sets` ADD `actual_duration_seconds`, `round_number`, `is_extra` | Hayır |
| S-T3b Check genişletme | `0025_assignment_meaningful_v2.sql` | `ADD CONSTRAINT training_assignments_meaningful_v2 …` + `DROP CONSTRAINT training_assignments_meaningful` | Guard yakalamaz; **sahip onayı gerekli** (kısıt gevşetmesi) |
| S-M1 Idempotency/offline | `0026_workout_idempotency.sql` | `workout_exercise_sets ADD client_set_id uuid`, `client_recorded_at timestamptz`, `unique(session_exercise_id, client_set_id)`; `workout_sessions ADD client_session_id uuid` + partial unique; opsiyonel `api_idempotency_keys` tablosu | Hayır |
| S-P İlerleme/karşılaştırma | – | Yalnız API/sorgu; mevcut index'ler (`workout_sessions_client_started_idx`, `workout_session_exercises_exercise_idx`) yeterli; gerekirse `ADD INDEX` | Hayır |

Notlar:
- `ALTER TYPE … ADD VALUE` bu repoda daha önce kullanıldı (0002, 0004, 0005, 0007, 0008, 0011, 0014, 0016, 0018); PostgreSQL'de yeni değer aynı transaction içinde kullanılamaz — enum ekleme ile o değeri kullanan check/default ayrı migration'a konmalı.
- İş akışı (`CLAUDE.md` → Database): şema düzenle → `pnpm db:generate` → SQL'i oku → `pnpm db:migrate` → `pnpm db:inspect`; uygulanmış migration dosyası asla düzenlenmez.
- Yeni kolonların hepsi nullable veya default'lu → mevcut satırlar ve mevcut contract'lar etkilenmez; yürütme modu türetmesi NULL için bugünkü kuralı korur.
