# iOS Training — Sprint 2 Migration Plan

> Tarih: 2026-11-22 · Durum: **YALNIZCA KOD.** Hiçbir migration production'a (veya başka bir DB'ye)
> uygulanmadı. DB bağlantısı açılmadı, seed/push/reset yapılmadı.
> Dosyalar `drizzle-kit generate` ile çevrimdışı üretildi (`drizzle.config.ts` kimlik bilgisi içermez).

## 1. Dosyalar

| Dosya | Tür | İçerik |
|---|---|---|
| `packages/db/migrations/0022_training_v2.sql` | additive | yeni enum `training_execution_type`; `workout_execution_mode` + `INTERVAL`, `CHECKLIST` (ADD VALUE); 9 yeni kolon; 1 partial unique index; 2 yeni CHECK |
| `packages/db/migrations/0023_workout_templates.sql` | additive | 3 yeni, boş tablo (`workout_templates`, `workout_template_sections`, `workout_template_exercises`) |
| `packages/db/migrations/meta/0022_snapshot.json`, `0023_snapshot.json`, `_journal.json` | drizzle meta | generate çıktısı |
| `packages/db/proposals/warmup-checklist-constraint.sql` | **ÖNERİ, migration değil** | `training_assignments_meaningful` değişikliği. `migrations/` dışında, journal'da yok; runner asla uygulamaz |

`drizzle-kit check`: "Everything's fine". Guard testi: tüm 24 migration dosyası onaysız geçer
(`APPROVED_DESTRUCTIVE.json` = `[]` olarak kaldı).

## 2. 0022 — satır satır etki

| İfade | Kilit / etki | Mevcut veri |
|---|---|---|
| `CREATE TYPE training_execution_type` | yok | — |
| `ALTER TYPE workout_execution_mode ADD VALUE 'INTERVAL'/'CHECKLIST'` | kısa katalog kilidi | Mevcut değerler aynı sırada kalır. Yeni değerler aynı transaction içinde **kullanılmaz** (PG kuralı), bu yüzden bu dosyada sadece eklenir |
| `training_days.source_template_id uuid`, `source_template_version int` | metadata-only (NULL) | dokunulmaz |
| `training_exercise_assignments.execution_type` (NULL) | metadata-only | NULL = eski türetme kuralı → davranış değişmez |
| `training_exercise_assignments.reps_max boolean DEFAULT false NOT NULL` | PG ≥ 11: sabit default, tablo yeniden yazılmaz | tüm satırlar `false` |
| `workout_exercise_sets.client_set_id uuid`, `actual_duration_seconds int`, `client_recorded_at timestamptz` | metadata-only | NULL |
| `workout_session_exercises.reps_max boolean DEFAULT false NOT NULL` | sabit default | `false` |
| `workout_sessions.source_template_id/version` | metadata-only | NULL |
| `CREATE UNIQUE INDEX workout_exercise_sets_client_set_unique … WHERE client_set_id IS NOT NULL` | index oluşurken tablo yazmaya kilitli (CONCURRENTLY değil: runner transaction kullanır). Tablo küçük; mevcut satırlar NULL ve partial index `WHERE client_set_id IS NOT NULL` olduğu için onları içermez → index boş başlar | çakışma imkânsız |
| `CHECK training_assignments_reps_max_without_reps` (`not reps_max or reps is null`) | doğrulama taraması | tüm satırlar `reps_max=false` → geçer |
| `CHECK workout_exercise_sets_actual_duration_nonnegative` | doğrulama taraması | kolon NULL → geçer |

**Backfill gerekmez.** Hiçbir `UPDATE`/`INSERT`/`DELETE` yok (test: `migration-guard.test.ts`
"0022/0023 are additive only"). Eski kayıtlar `execution_type = NULL` ile eskisi gibi türetilir
(`SETS_REPS / TOTAL_REPS / DURATION / CUSTOM`). İsteğe bağlı bilgi amaçlı backfill (ör. eski satırlara
`execution_type` yazmak) **yapılmayacak** — gerek yok ve production verisini değiştirir.

### 2.1 Transaction davranışı (Sprint 2.5'te gerçek PostgreSQL'de doğrulandı — DÜZELTME)

Bu belgenin önceki hâli "her migration kendi transaction'ında çalışır" varsayımına dayanıyordu.
Bu **yanlış**. `drizzle-orm` 0.45.4 migrator'ı (`pnpm db:migrate`), **bekleyen TÜM migration'ları TEK
bir transaction'da** uygular. Bir migration'ın bekleyip beklemediğine journal'daki `when` değeri ile
`drizzle.__drizzle_migrations` tablosundaki son `created_at` karşılaştırılarak karar verilir.

Sonuçlar:
- 0022 ve 0023 birlikte bekliyorsa **atomik** uygulanırlar: biri hata verirse ikisi de geri alınır,
  yarım şema kalmaz.
- `ALTER TYPE … ADD VALUE` ile eklenen değer (`INTERVAL`, `CHECKLIST`) **aynı transaction'da kullanılamaz**
  (PG: *unsafe use of new value*). 0022/0023 bu değerleri kullanmadığı için sorun yok; bunu 2.5 fresh
  ve upgrade testleri gösterdi. **Kural:** Bu enum değerlerini kullanan ileride yazılacak bir migration
  (ör. backfill veya CHECK), 0022 ile **aynı `migrate` çalıştırmasında** bekliyor olmamalı. Önce
  0022/0023 ayrı bir çalıştırmada uygulanmalı.
- 0023'teki yeni tip `training_execution_type` aynı transaction'da oluşturulup kullanılabiliyor
  (`CREATE TYPE` bu kısıta tabi değil, doğrulandı).
- Kilitler commit'e kadar tutulur (0022'nin `ALTER TABLE`'ları dahil). İfadeler metadata-only ve
  tablolar küçük olduğu için sürenin kısa olması beklenir. Production veri hacminde **ölçülmedi**; Neon
  branch provasında ölçülmeli.

## 3. 0023 — şablon tabloları

Yalnızca `CREATE TABLE` + FK (`users`, `exercises` → `ON DELETE RESTRICT`; iç ilişkiler `CASCADE`) +
index. Mevcut tablolara yalnız referans verilir; mevcut satırlar değişmez. Tablolar boş başlar;
API/UI Sprint 3'te.

## 4. Warm-up ve `training_assignments_meaningful`

Production CHECK'i: `sets OR reps OR total_reps OR duration_seconds OR prescription_text` NOT NULL.
Sayısız bir Warm-up checklist maddesi bunu ihlal eder. Spec: "Production constraint'ini değiştirme".

**Sprint 2 çözümü (constraint değişmeden):** `execution_type = 'CHECKLIST'` olan ve metin
verilmemiş atamada API, `prescription_text = 'Abhaken'` (`CHECKLIST_PRESCRIPTION_FALLBACK`) yazar.
Bu metin istemciye hiç gösterilmez (client program DTO ve session DTO'da `null` döner). Koç kendi metnini
("2 Runden locker") girerse o metin saklanır ve gösterilir.

**İleride (owner onayıyla):** `proposals/warmup-checklist-constraint.sql`. Yeni constraint eskisinin
katı bir üst kümesidir (önce eklenir, sonra eskisi düşer). Yeni guard kuralı `DROP CONSTRAINT`'i
yakaladığı için dosya `APPROVED_DESTRUCTIVE.json`'a girmeden uygulanamaz (test edildi).

## 5. Guard değişikliği

`packages/db/src/migration-guard.ts`'e iki desen eklendi: `DROP CONSTRAINT` ve `DROP INDEX`.
Mevcut 22 migration'ın hiçbiri bunları içermiyor (grep + test) → mevcut zincir etkilenmez.

## 6. Uygulama prosedürü (OWNER tarafından, ileride)

1. Neon'da production'dan bir **branch** aç (izole kopya). Bağlantı dizesini yalnızca o oturumda
   ortam değişkeni olarak ver; dosyaya yazma, loglama.
2. Branch'e karşı: `pnpm --filter @vitruv/db migrate` → `inspect`. Ardından
   `apps/api` entegrasyon testleri (`test:integration`) **yalnızca branch URL'siyle**.
3. Kontroller: `select count(*) from training_exercise_assignments where reps_max` = 0;
   `select execution_type, count(*) … group by 1` → yalnız NULL; mevcut oturumların okunması.
4. Sorun yoksa production'a aynı komut, düşük trafik saatinde. Önce Neon point-in-time restore
   noktasını not al.
5. **Önce** API deploy edilmez: migration önce, API sonra (yeni API yeni kolonları okur; eski API yeni
   kolonları yok sayar → migration'dan sonra eski API çalışmaya devam eder).

## 7. Rollback

Tercih edilen: **ileri düzeltme** (yeni kolonlar NULL/false olduğundan eski kod onları görmez; API'yi
önceki sürüme döndürmek yeterlidir, şema yerinde kalabilir).

Tam şema geri alma gerekirse (owner onayı + `APPROVED_DESTRUCTIVE.json`, yıkıcıdır):

```sql
-- 0023
DROP TABLE "workout_template_exercises";
DROP TABLE "workout_template_sections";
DROP TABLE "workout_templates";
-- 0022 (önce veri kontrolü: client_set_id / execution_type kullanılmış mı?)
DROP INDEX "workout_exercise_sets_client_set_unique";
ALTER TABLE "workout_exercise_sets" DROP CONSTRAINT "workout_exercise_sets_actual_duration_nonnegative";
ALTER TABLE "training_exercise_assignments" DROP CONSTRAINT "training_assignments_reps_max_without_reps";
ALTER TABLE ... DROP COLUMN ...;   -- 9 kolon
DROP TYPE "training_execution_type";
```

`ALTER TYPE … ADD VALUE` geri alınamaz (PostgreSQL enum değeri silmeyi desteklemez). Ancak
kullanılmayan bir enum değeri zararsızdır. `INTERVAL`/`CHECKLIST` ile oturum oluşmuşsa enum
olduğu gibi kalmalıdır.

## 8. Bilinen sınırlamalar

- ~~Migration'lar gerçek bir PostgreSQL'e karşı çalıştırılmadı.~~ **Sprint 2.5 güncellemesi:** İzole bir
  yerel PostgreSQL 18.6'da (loopback, `cluster_name = vitruv-it`, production'a hiçbir bağlantı yok)
  fresh (0000→0023) ve upgrade (0000→0021 + legacy veri → 0022→0023) senaryoları **geçti**. Ayrıntılar:
  `docs/ios-training-sprint2-validation.md`. Neon'un PG sürümü ile fark → adım 6.1–6.2 (Neon branch
  provası) hâlâ önerilir.
- PostgreSQL tanımlayıcıları 63 bayta kısaltır. Dört FK adı daha uzun (üçü Sprint 2'den önce vardı,
  biri 0023'te): DB'deki ad kısaltılmış hâlidir. Zararsız (drizzle `generate` snapshot'a göre çalışır).
  Ama `drizzle-kit push`/introspection bir fark gösterebilir; zaten bu projede yasak.
