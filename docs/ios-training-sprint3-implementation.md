# iOS Training — Sprint 3: Workout-Bibliothek, Duplizieren, Zuweisen, Trainingswoche

Durum: **local, commit edildi, push / deploy / production migration YOK.**
Branch: `feature/ios-training`. Flag `TRAINING_EXTENDED_TYPES` varsayılan **kapalı**.

## 1. Tek veri modeli (ikinci bir çalıştırılabilir yapı yok)

```
workout_templates (0023 + category)          ← Workout-Bibliothek (sadece şablon, çalıştırılmaz)
  └ workout_template_sections → workout_template_exercises

training_programs → training_weeks → training_days (+ source_template_id/version, assignment_request_id)
  └ training_sections → training_exercise_assignments      ← kanonik, uygulamanın çalıştırdığı model
       └ workout_sessions (snapshot)                        ← başlatılmış / bitmiş antrenman
```

- "Teilnehmer zuweisen" bir şablonu **bir training_day kopyası** olarak kanonik programa yazar.
  Kopya ile şablon arasında sadece köken bilgisi (`source_template_id`, `source_template_version`)
  kalır; sonraki şablon değişiklikleri kopyaya **yansımaz**.
- `client_plans` (eski tarihli egzersiz listesi) **olduğu gibi kalır**, ayrı ve etiketli gösterilir,
  silinmez, dönüştürülmez.
- Başlatılmış / tamamlanmış session'lar kendi snapshot'ından okunur (`WORKOUT-ARCHITECTURE.md`);
  kopyanın düzenlenmesi snapshot'ı değiştirmez (FK `ON DELETE SET NULL`).

## 2. Migration 0024 (sadece dosya)

`packages/db/migrations/0024_sprint3_template_library.sql` — tamamen additive:

| SQL | Neden |
| --- | --- |
| `training_days.assignment_request_id uuid` + partial unique index | Zuweisen idempotent: aynı `requestId` ikinci kopya üretemez (çift tık / ağ tekrarı) |
| `workout_templates.category text` + CHECK (`UPPER_BODY`, `LOWER_BODY`, `TOTAL_REPS`, `CORE`) | Workout tipi (Oberkörper, Unterkörper, Gesamt-Wiederholungsziel, Core-Routine) ve tip filtresi |

`ALTER TYPE … ADD VALUE` **yok** (enum yerine text + CHECK seçildi → 0022'deki "yeni enum değeri aynı
transaction'da kullanılamaz" riski burada oluşmaz). Mevcut migration'larla birleştirilmedi;
`drizzle-kit check` temiz. Production'a **uygulanmadı**.

## 3. API (`/v1/admin/training`, hepsi Zod ile `packages/contracts/src/training.ts`)

| Endpoint | Yetki | Not |
| --- | --- | --- |
| `GET /capabilities` | templates.read | `{ extendedExecutionTypes, requiredAppCapabilityLevel: 2 }` |
| `GET /templates?q&category&status&page&pageSize` | templates.read | sunucu tarafı sayfalama (pageSize ≤ 100), yapay kütüphane limiti yok |
| `POST /templates` | templates.write | 201 |
| `GET /templates/:id` / `PUT /templates/:id` | read / write | PUT `expectedVersion` ister, eskiyse 409 |
| `POST /templates/:id/duplicate` | write | 201, tek transaction, yeni id, orijinal değişmez |
| `POST /templates/:id/archive` / `restore` | write | atanmış kopyalara dokunmaz |
| `POST /templates/:id/assign` | write + programs.update | 201 yeni / 200 replay (aynı requestId), başka client/şablonla aynı requestId → 409 |
| `GET /clients/:clientId/week?date=` | programs.read | Trainingswoche (Pzt–Paz) + legacyPlan özeti |
| `GET /days/:id/workout` / `PUT /days/:id/workout` | programs.read / update | tek client kopyası, `expectedVersion` (program.updatedAt) |

Kapsam: COACH sadece kendi şablonlarını görür (studio-wide paylaşım **yok**), ADMIN hepsini.
Client id'leri mevcut ilişki kapsamından geçer (aktif atanmış client değilse 404). Gün / section /
egzersiz id'leri program → client üzerinden doğrulanır (IDOR). Hata kodları 400 / 401 / 403 / 404 / 409.

### Zuweisen akışı

1. `requestId` replay kontrolü. 2. `pg_advisory_xact_lock('vitruv.template-assign:<clientId>')`.
3. Şablon kapsamda, arşivlenmemiş, boş değil, pasif egzersiz yok (aksi 409). 4. Hedef program:
ACTIVE → yoksa en yeni DRAFT → yoksa `mondayOf(date)` başlangıçlı yeni DRAFT "Trainingsplan"
(PROGRAM_CREATED olayı). Başlangıç tarihi yoksa 409, dönem dışı tarih 400. 5. Gerekli haftalar
oluşturulur (max 104). 6. Gün kopyası tek transaction'da yazılır, `program.updatedAt` güncellenir.

### Feature flag (sunucu tarafında zorunlu)

- `TRAINING_EXTENDED_TYPES=enabled|disabled`, varsayılan `disabled` (`apps/api/src/config/env.ts`).
- Kapalıyken `INTERVAL` (Core), `CHECKLIST` (Warm-up) ve `repsMax` (MAX) **hiçbir yazma yolunda**
  kabul edilmez: şablon create/update/duplicate, assign, client-copy PUT (yeni extended satırlar) ve
  mevcut Sprint 2 endpoint'leri `POST sections/:id/assignments` + `PATCH assignments/:id`. Yanıt 409 +
  alan yolu. STRENGTH ve TOTAL_REPS (Sprint 2'de zaten app'te var) açık kalır.
- Capability sözleşmesi: `TRAINING_CAPABILITY_LEVEL = 2` (`packages/shared/src/workout.ts`). Flag
  ancak minimum uygulama sürümü capability 2'yi zorunlu kıldıktan sonra açılmalı (rollout planı).

## 4. Web (Admin, Almanca)

| Ekran | Yol |
| --- | --- |
| Workout-Bibliothek (kart / liste, arama, Typ filtresi, Aktiv/Archiviert, sayfalama, loading/error/empty) | `/admin/training/workouts` |
| Neues Workout | `/admin/training/workouts/neu` |
| Vorlage bearbeiten + Duplizieren / Teilnehmer zuweisen / Archivieren | `/admin/training/workouts/[id]` |
| Trainingswoche (Workout hinzufügen → Aus Bibliothek wählen → Zuweisen, Workout bearbeiten) | `/admin/kunden/[id]/training` |
| Für Teilnehmer bearbeiten (tek kopya) | `/admin/kunden/[id]/training/workout/[dayId]` |

- `WorkoutEditor` tek bileşen, iki hedef; başlık + renkli not "Vorlage bearbeiten" ile "Für
  Teilnehmer bearbeiten: <Name>" ayrımını açıkça gösterir. Tip başına sadece ilgili alanlar
  (Kraft: Sätze/Wdh./MAX/Pause/Gewicht; Gesamtziel: Ziel/Pause; Core: Runden/Arbeit/Pause; Warm-up:
  sadece Hinweis). Flag kapalıyken Core/Warm-up/MAX "– noch nicht freigegeben" ile devre dışı.
  İstemci doğrulaması **aynı contract şemalarıyla** yapılır. 409 (eski sürüm) → "Neu laden".
  Kaydedilmemiş değişiklikte `beforeunload` uyarısı.
- `AssignTemplateDialog`: çoklu client seçimi, tarih, opsiyonel isim; client başına bir API çağrısı,
  `requestId` tekrar denemede yeniden kullanılır; client başına sonuç + "Für Teilnehmer bearbeiten".
- Arşivleme `ConfirmDialog` ile onay ister.
- Eski `PlanEditor` "Übungsliste · Bisheriges Format" başlığı ve açıklamasıyla ayrı bölümde kalır.
- Navigasyon: "Workout-Bibliothek" (yetki `training.templates.read`). COACH'a `website.*` eklenmedi.
- Stil: yalnız token'lar (`admin.css` `.vt-workout*`, `.vt-week*`), grid deseni yok, 48px dokunma
  hedefleri, responsive (1 → 7 sütun).
- **Yok:** coach panelinde "Workout starten" düğmesi (başlatma yalnız uygulamada vardır).

## 5. Bilinen sınırlamalar (Sprint 3 kapsamında bilinçli)

- Yeni Trainingswoche ile eski PlanEditor **birleştirilmedi**; ikisi yan yana, ayrı etiketli.
- Eşzamanlılık token'ı program düzeyinde (`program.updatedAt`): aynı programdaki başka bir günün
  kaydı da 409 tetikleyebilir (güvenli taraf; veri kaybı yok).
- Toplu atama = client başına bir çağrı (her biri idempotent); tek çok-client'lı endpoint yok.
- Flag global (sunucu), cihaz / client bazlı değil.
- API gövde limiti 32 KB (10 section × 60 egzersiz sınırı ile uyumlu).
- Web UI testleri bileşen + server-render düzeyinde; canlı tarayıcıda (gerçek API + izole PG ile)
  manuel görsel kontrol bu sprintte yapılmadı — local `.env` canlı Neon'a işaret ettiği için dev
  sunucusu bilinçli olarak başlatılmadı.
