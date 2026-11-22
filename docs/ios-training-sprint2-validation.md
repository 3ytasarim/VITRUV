# iOS Training — Sprint 2.5 Validation (PostgreSQL Integration & Migration)

> Tarih: 2026-11-22 · Kapsam: Sprint 2 veri modeli, `0022_training_v2`, `0023_workout_templates` ve yeni
> API'nin **gerçek, izole** bir PostgreSQL'de doğrulanması. **Production'a dokunulmadı:** Neon'a hiçbir
> bağlantı açılmadı, production migration/deploy/commit/push yapılmadı, `.env` dosyaları okunmadı ve
> değiştirilmedi. Neon branch oluşturulmadı. Bu belgede secret yok.

## 1. Ortam

| Öğe | Değer |
|---|---|
| PostgreSQL | **18.6** (x86_64-windows, msvc). Binary'ler: makinedeki `@embedded-postgres/windows-x64` paketinden (`initdb`, `pg_ctl`, `postgres`). Docker/WSL/kurulu PG yok |
| Cluster | scratchpad'de `vitruv-pg/data`. `listen_addresses = '127.0.0.1'`, port **55433**, `cluster_name = 'vitruv-it'`, `max_connections = 50`, `fsync = off` (yalnız test) |
| Kimlik doğrulama | `trust`, yalnız loopback; kullanıcı `vitruv_it` (parolasız) |
| Veritabanları | `vitruv_it_admin` (sadece yönetim), her çalıştırmada silinip yeniden oluşturulanlar: `vitruv_it_fresh`, `vitruv_it_upgrade`, `vitruv_it_api`, `vitruv_it_v2`, `vitruv_it_legacy_api` |
| Bağlantı | yalnız `VITRUV_IT_DATABASE_URL=postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable` (secret değil; yerel, parolasız). Sadece komut satırında verilir, hiçbir dosyaya yazılmaz |
| Migrator | `drizzle-orm` 0.45.4 `migrate()`. Production'daki `pnpm db:migrate` ile aynı kod yolu, önünde aynı destructive-SQL guard |
| Node / test | Vitest 5.0.4; `pnpm --filter @vitruv/db test:pg`, `pnpm --filter @vitruv/api test:pg` |
| Neon sürüm farkı | Production Neon'un PG ana sürümü bu ortamdan **bilinmiyor** (bağlanmak yasaktı). Migration'lar yalnız `gen_random_uuid()` (PG ≥ 13 çekirdeği) kullanıyor, extension yok. Yine de Neon branch provası önerilir (§13) |

Çalıştırma (owner için, yerel):

```powershell
$env:VITRUV_IT_DATABASE_URL = 'postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable'
pnpm --filter @vitruv/db test:pg
pnpm --filter @vitruv/api test:pg
```

## 2. İzolasyon kanıtı (fail-closed)

`packages/db/src/isolated-test-database.ts`:

1. **Statik kontrol (soket açılmadan):** host loopback olmalı, `sslmode=disable` olmalı, DB adı
   `vitruv_it_*` olmalı, URL'de `neon` geçmemeli, `DATABASE_URL` veya `DATABASE_URL_DIRECT` ile aynı olmamalı.
   Hata mesajı URL'yi içermez.
2. **Dinamik kontrol (her bağlantıda):** sunucu `cluster_name = 'vitruv-it'` (yalnız bu throw-away
   cluster'ın `postgresql.conf`'unda var), loopback `inet_server_addr()` ve `vitruv_it_*` veritabanı
   bildirmeli. `migrateIsolated`, `recreateIsolatedDatabase` ve API'deki her `inRollback` bunu tekrar kontrol eder.
3. **Ayrı test config'i:** `vitest.pg.config.ts` (db + api) **hiçbir `.env` yüklemez** (`load-root-env`
   yok). Setup dosyası statik guard'ı çalıştırır, ardından süreçten `DATABASE_URL`,
   `DATABASE_URL_DIRECT` ve `DIRECT_URL` değişkenlerini siler. `DATABASE_URL` hiçbir yerde değiştirilmedi
   veya yönlendirilmedi.
4. Mevcut `*.int.test.ts` dosyaları **byte-for-byte değişmedi**. İçlerindeki `./rollback` importu
   vitest alias'ı ile `test/pg/rollback-pg.ts`'e yönlenir (izole `vitruv_it_api` + her testte dinamik kontrol).
   Mevcut `test:integration` (root `.env` → canlı DB) **çalıştırılmadı**.

Kanıtlar:
- `netstat`: sunucu yalnız `127.0.0.1:55433`'te dinliyor.
- `select version(), current_setting('cluster_name')` → `PostgreSQL 18.6 …`, `vitruv-it`.
- Ret testleri, gerçek çalıştırmayla (hepsi **bağlantı açılmadan** reddedildi, "no tests"):
  boş değişken · `…neon.tech…` host · `/neondb` · `sslmode` eksik · `10.0.0.5` host ·
  `DATABASE_URL` ile aynı değer.
- Birim testi `isolated-test-database.test.ts` (5 test): yanlış `cluster_name` (başka bir yerel PG),
  loopback olmayan sunucu adresi (tünel), yanlış DB adı, URL'deki parolanın hata mesajına sızmaması.

## 3. Fresh database sonucu (`vitruv_it_fresh`, 0000 → 0023)

`packages/db/test/migrations.pg.test.ts` — **8/8 geçti**

| Kontrol | Sonuç |
|---|---|
| Journal | 24 kayıt, `idx` 0..23 sıralı, `when` monoton, uygulanan = **24** |
| Enum'lar | Drizzle'daki her `pgEnum` = DB etiketleri **ve sırası**. `workout_execution_mode` = `SETS_REPS, TOTAL_REPS, DURATION, CUSTOM, INTERVAL, CHECKLIST` (yeni değerler sonda) |
| Şema eşliği | DB'deki tablo kümesi = Drizzle tabloları. Her tabloda kolon sayısı, adlar, **nullability** ve **default** varlığı eşit (app-side `$defaultFn` hariç) |
| Constraint/index | Drizzle'daki her index, unique, CHECK ve FK DB'de kendi adıyla var |
| Partial unique index | `CREATE UNIQUE INDEX … (session_exercise_id, client_set_id) WHERE (client_set_id IS NOT NULL)` |
| Şablon FK'ları | iç ilişkiler `CASCADE`; `users`/`exercises` → `RESTRICT` (owner silinemez, test edildi) |
| CHECK davranışı | Boş CHECKLIST ataması → `training_assignments_meaningful` **hâlâ reddediyor** (production constraint değişmedi). `'Abhaken'` ile kabul. `reps_max` + `reps` → red. Şablonda: boş CHECKLIST kabul; CHECKLIST + sets red; STRENGTH reps/repsMax olmadan red; TOTAL_REPS total olmadan red |
| Uzun adlar | 63 bayttan uzun 4 FK adı PG tarafından kısaltılıyor (§12, bulgu B3) |

## 4. Upgrade database sonucu (`vitruv_it_upgrade`)

Akış: 0000→**0021** uygulandı (journal kopyası kısaltılarak; repo dosyalarına dokunulmadı) →
`packages/db/test/fixtures/legacy-0021.sql` (kurgusal veri) → kalan migration'lar → **7/7 geçti**.

| Kontrol | Sonuç |
|---|---|
| Uygulanan | önce 22, sonra 24 (yalnız 0022 + 0023 eklendi) |
| Fixture | 3 kullanıcı, koç ataması, 4 egzersiz, ACTIVE program (2 gün, WARMUP/MAIN), Sprint 2 öncesi 5 reçete şekli, COMPLETED oturum (4 egzersiz: CUSTOM/SETS_REPS/TOTAL_REPS/DURATION-SKIPPED, 4 set), başka danışanın IN_PROGRESS oturumu (TOTAL_REPS 30/70), tarihli plan (client_plans + item) |
| Veri kaybı | 13 tablonun **her satırı** `to_jsonb` ile önce/sonra karşılaştırıldı. Satır sayıları eşit, yeni kolonlar çıkarıldığında içerik **birebir aynı** |
| Yeni kolonlar | her eski satırda `execution_type = NULL`, `reps_max = false`, `client_set_id`/`actual_duration_seconds`/`client_recorded_at`/`source_template_*` = NULL |
| Eski tipler | `CUSTOM 1, DURATION 1, SETS_REPS 1, TOTAL_REPS 2` okunuyor. Yeni tip/flag kullanan satır 0 |
| Oturumlar | COMPLETED (4 egzersiz, toplam 50) ve IN_PROGRESS (30) korunmuş. Set değerleri `8 × 60.50` |
| Yeni constraint'ler upgrade sonrası | `client_set_id` NULL'lar çakışmaz, aynı id iki kez → unique index reddi. `INTERVAL` enum değeri commit sonrası kullanılabilir. Negatif `actual_duration_seconds` → CHECK reddi |
| Tarihli plan | `client_plans`/`client_plan_items` değişmedi |

## 5. startWorkout entegrasyon testi

`apps/api/test/workouts-v2.pg.test.ts`: HTTP route → servis → SQL, gerçek pool (16 bağlantı).
Plan koç API'siyle kurulur (validation + storage kuralları dahil). Plan: Warm-up (CHECKLIST metinsiz +
"2 Runden locker"), Klimmzüge 4×8 rest 90, Kniebeuge 3×MAX 60 kg rest 120, Liegestütze total 60 rest 60,
Plank INTERVAL (boş → 5/40/20).

| Doğrulama | Sonuç |
|---|---|
| Koç kaydı (DB) | INTERVAL `5/40/20` **saklanıyor**; metinsiz CHECKLIST `prescription_text = 'Abhaken'` |
| Snapshot | modlar `CHECKLIST, CHECKLIST, SETS_REPS, SETS_REPS, TOTAL_REPS, INTERVAL`; `reps_max` snapshot'a kopyalanıyor; planlı set satırları 4 / 3 (targetReps null, 60 kg) / interval 5 × 40 s |
| Owner | `workout_sessions.client_user_id` = principal, `IN_PROGRESS` |
| Shim sızıntısı | Yanıt JSON'unda `"Abhaken"` **yok**; koçun kendi metni görünüyor |
| Tekrar açma | aynı gün tekrar başlatılınca `resumed: true`, aynı id; `/current` aynı oturumu dönüyor; danışan başına oturum sayısı 1 |
| Set kalıcılığı | kayıt → yeniden okuma (GET) → değerler aynı |
| Tamamlama | `complete` sonrası tüm yazmalar 409: yeni set, set düzeltme, durum, abandon, **aynı clientSetId ile birebir retry** dahil. Okuma değişmiyor |
| Koç düzenlemesi | Oturum sürerken koç reps 8→5, total 60→100 yaptı ve bir Warm-up atamasını sildi → çalışan **ve** tamamlanmış oturumun hedefleri birebir aynı. Yeni başlatılan oturum yeni planı alıyor (5 egzersiz, reps 5, total 100) |
| Legacy program | §6'daki legacy bölümü |

## 6. Workout tipleri (gerçek DB)

| Tip | Doğrulanan |
|---|---|
| **Warm-up** | reps/süre/ağırlık PATCH → **400**; yeni set ucu → 409; yalnız `status: COMPLETED`; timer `NONE`; shim gizli |
| **Strength** | üst vücut 4 set (8,8,7,6) ve alt vücut **MAX** (15,12,11 @ 62.5) set başına kaydedildi; egzersizler COMPLETED; timer `AUTO_REST 90/120`; dinamik set eklenemez (409) |
| **Total reps** | hedef 60 / rest 60, setler **12,10,8,10,12,8 → remaining 48,38,30,20,8,0**; `restSeconds` 60,60,60,60,60,**null** (son setten sonra dinlenme yok); set numaraları 1..6; egzersiz COMPLETED, `actual_reps = 60`; 7. set → 409; son setin retry'ı → `created:false, restSeconds:null`; erken bir setin retry'ı → kendi tarihsel `restSeconds` değeri (60) |
| **Core** | `intervalPlan` = **280 s**, 4 REST, son faz WORK (son turdan sonra dinlenme yok). Tur başına `actualDurationSeconds = 40` kaydedildi, 5. turdan sonra COMPLETED. Egzersiz düzeyinde süre → 400. Timer: `mode INTERVAL`, `interval {5,40,20}`, üst düzey `restSeconds: null` (tasarım gereği, rest `interval` içinde) |
| **Legacy** (`vitruv_it_legacy_api`: 0021 + fixture + 0022/0023) | danışan eski programı okuyor (`executionType` yok, `repsMax` false, gün durumu COMPLETED/NOT_STARTED); tamamlanmış eski oturum açılıyor (eski modlar, `8 × 60.5`, eski toplam `done 50/50`, DURATION timer `MANUAL_REST 15`); eski gün başlatılınca eski türetme kuralları (`CUSTOM, SETS_REPS, TOTAL_REPS, DURATION`); koç geçmişi görüyor; **eski 30/70 + yeni 12 → 42** (düzeltme sonrası, §12 B2) |

## 7. İdempotency (POST …/sets, gerçek DB)

| Senaryo | Sonuç |
|---|---|
| Aynı istek iki kez | 201 → 200 `created:false`, aynı set, aynı `restSeconds`, **1 satır** |
| Network retry (cevaptan sonra) | aynı set + aynı tarihsel rest (son set: null, 2. set: 60) |
| Farklı id'ler | ayrı setler, numaralar ardışık |
| Farklı owner | A'nın `clientSetId`'si B'nin kendi egzersizinde → bağımsız yeni set (id egzersize göre kapsamlı). B, A'nın oturumuna → 404. A'nın satırı değişmedi |
| **Aynı id, farklı payload** | Sprint 2'de **200 dönüp eski kaydı sessizce veriyordu** (gerçek DB testinde yakalandı). Düzeltildi: `actualReps` veya `actualWeight` farklıysa → **409**, saklı kayıt aynen kalır (DB'de kontrol edildi) |
| Unique index | upgrade testinde doğrudan SQL ile: aynı id → `workout_exercise_sets_client_set_unique` ihlali |

## 8. Eşzamanlılık (gerçek bağlantılar, `Promise.all`)

| Senaryo | Sonuç |
|---|---|
| 8 eşzamanlı **aynı** istek | 1 × 201 + 7 × 200, hepsi set 1, DB'de **1 satır** |
| 10 eşzamanlı **farklı** set (10'ar tekrar, hedef 60) | **6 × 201, 4 × 409**. Setler 1..6, toplam **tam 60**, hedef aşılmadı. Rest: 45×5, son null |
| Aynı oturumda karışık yük (2 egzersize 6+6 set, GET, not yazma) | hepsi 200/201; toplamlar tutarlı (30, `actual_reps` 30) |
| Deadlock | `pg_stat_database.deadlocks` önce/sonra eşit. Tüm cluster'da toplam **0** |
| Satır kilidi | oturum satırı `FOR UPDATE` ile yazmaları sıraya koyuyor. İsteklerin hiçbiri 5xx ya da serialization hatası vermedi |

Not: `ignoreLocks` (kilitsiz yarış) senaryosu yalnız fake store'da test edilebilir (birim testi 6b);
gerçek DB'de kilit her zaman alınıyor. Unique index'in kendisi ayrıca doğrudan SQL ile test edildi.

## 9. Yetkilendirme (gerçek DB)

| Senaryo | Sonuç |
|---|---|
| Danışan kendi oturumu | 200 |
| Başka danışan: okuma / set kaydı / egzersiz PATCH / complete | **404** (self context, SQL'de kapsamlı) |
| Kendi tamamlanmış oturumunda yabancı **veya** rastgele egzersiz id'si | ikisi de **409** (önce durum kontrolü; yabancı id hakkında bilgi sızmıyor) |
| Atanmış koç: özet + detay | 200 |
| **Atanmamış** koç: özet + detay | **404** |
| Danışan admin rotasında | **403** |
| Koç, danışan workout rotasında | **403** |
| Tamamlanmış oturum | tüm yazmalar 409 (§5) |

Mevcut 404/403 kuralları aynen korunuyor. Mevcut entegrasyon paketleri (auth, management, training,
workouts, nutrition, plan, welcome, CMS, media, leads) izole DB'de çalıştırıldı (§11).

## 10. Şablon izolasyonu (DB seviyesi)

Şablon ("Push Tag" v1: CHECKLIST + STRENGTH 3×10) gerçek tablolara yazıldı. `copyTemplateForDay` ile
danışan A ve B'ye kopyalandı ve Sprint 3 endpoint'inin yapacağı gibi yeni satırlar olarak eklendi:

1. Kopyalar şablonla aynı içerikte; CHECKLIST shim'i kopyada da (`'Abhaken'`). Gün lineage = template v1.
   A ve B arasında **ortak satır id'si yok**.
2. A kopyası programla aktif edildi; A bu günü başlatıp tamamladı (oturum header'ı: template id, v1).
3. A'nın kopyası değişti (reps 6) → B (10) ve şablon (3×10) **değişmedi**.
4. Şablon değişti (5×12, version 2) → A (6) ve B (10) **değişmedi**. Tamamlanmış oturum **birebir aynı**,
   `sourceTemplateVersion` hâlâ 1.
5. Şablon **silindi** → kopyalar (FK yok) ve tamamlanmış oturum etkilenmedi.

## 11. Başarısız testler (gerçek sayılar)

| Paket | Komut | Sonuç |
|---|---|---|
| db — gerçek PG | `test:pg` | **15/15** |
| api — gerçek PG (yeni) | `workouts-v2.pg.test.ts` | **22/22** |
| api — gerçek PG (mevcut int paketleri) | `test:pg` toplam | **114 geçti, 1 başarısız, 1 atlandı** (116) |
| design-tokens | `test` | 106/106 |
| shared | `test` | 41/41 |
| contracts | `test` | 100/100 |
| db (birim) | `test` | 22/22 (+5 guard testi) |
| api (birim) | `test` | 244/244 (2 yeni test dahil: payload çakışması, legacy carry-over) |
| web | `test` | 286/286 (sıralı çalıştırmada timeout yok) |
| typecheck / lint | `pnpm -r` | temiz / temiz |
| build | `pnpm -r build` | 1. deneme **SecurityFatalError** (aşağıda), 2. deneme **başarılı** |
| Flutter | `analyze` / `test` | No issues / **260/260** |

**1 başarısız:** `management.int.test.ts › CLIENT accounts get 403 …; /v1/client/me is safe`. Test,
`/v1/client/me` yanıtında `"4711"` ve "Vertrauliche" geçmemesini bekliyor. Ancak owner kararı (commit
`827c2b2`, 2026-10-28: koç notu danışana `note` olarak gösterilir) ile bu bilerek değişti. Test o
tarihten beri güncellenmemiş. Canlı DB'yi hedeflediği için hiç çalıştırılmadığından fark edilmemiş.
Bu Sprint 2 kaynaklı bir **regresyon değil**, bir veri sızıntısı da değil. Test **değiştirilmedi** (kural: test
silinmez/gevşetilmez); ayrı bir görevde, owner onayıyla güncellenmeli.

**1 atlandı:** `health-db.int.test.ts`. Doğrudan `DATABASE_URL`'yi (Neon) hedefliyor. Setup bu değişkeni
sildiği için kasıtlı olarak atlanıyor.

**Next.js güvenlik uyarısı (tam kayıt):** `apps/web build: Error [SecurityFatalError]: Your version of
Next.js is affected by a known security vulnerability.` Paket: `next` **16.4.1** (`apps/web/package.json`:
`"next": "^16.4.1"`). Referans: npm bulk advisories endpoint. Build çıktısı bir agent'a yönelik upgrade
talimatı da içeriyordu. Uygulanmadı. **Yükseltme yapılmadı, uyarı gizlenmedi.** Öneri: ayrı bir
güvenlik görevi (sürüm yükseltme + regresyon).

## 12. Gerekli / yapılan kod düzeltmeleri

| # | Bulgu | Durum |
|---|---|---|
| **B1** | Aynı `clientSetId` + farklı payload → eski kayıt sessizce 200 ile dönüyordu | **Düzeltildi** (minimal): `sameRecordedValues()` (`set-recording.ts`) farklıysa 409. Replay ve yarış kaybeden yol ikisi de kapsanıyor. Birim + gerçek DB testi |
| **B2** | **Legacy veri kaybı:** Sprint 2 öncesi bir TOTAL_REPS egzersizi toplamı yalnız `actual_reps`'te tutar (set satırı yok). Yeni uygulama ilk seti kaydedince toplam yalnız setlerden hesaplanıp `actual_reps`'e yazılıyordu → **30 + 12 = 12** (gerçek DB'de kanıtlandı). Senaryo: deploy sırasında süren oturum veya eski uygulamayla başlatılıp yenisiyle devam edilen oturum | **Düzeltildi** (minimal, şema değişikliği yok): `legacyTotalCarryOver()`. İlk yeni setten önce eski toplam **set 1** olarak eklenir (aynı transaction; istek reddedilirse geri alınır) → **42** |
| B3 | PG 63 bayt sınırı: 4 FK adı kısaltılıyor (3'ü Sprint 2 öncesi, 1'i 0023) | Zararsız, belgelendi. Migration **değiştirilmedi** (henüz hiçbir yerde uygulanmadı, ama değişiklik gerekmiyor) |
| B4 | Migration planı "her migration kendi transaction'ında" diyordu → yanlış | Belge düzeltildi (`migration-plan.md` §2.1) |
| B5 | `pg` DeprecationWarning: aynı transaction client'ında eşzamanlı sorgu (`Promise.all` içinde `tx` sorguları; mevcut desen, ör. `focused()`). pg@9'da kaldırılacak | **Düzeltilmedi**. Ayrı bir görev olmalı (sıralı sorgu). Bugün çalışıyor (pg kuyruğa alıyor) |
| B6 | Eski `management.int` assertion'ı (§11) | Owner onayıyla ayrı görev |

Veri modeli veya migration için kırıcı bir değişiklik **gerekmedi**. 0022/0023 değişmedi.

## 13. Migration riskleri

**Warm-up shim (geçici, mevcut çözüm) — gerçek DB'de test edildi.**
Artıları: production CHECK değişmiyor (DROP CONSTRAINT yok); eski API ve eski satırlar etkilenmiyor;
geri alınması gereken bir şema değişikliği yok; shim istemciye hiç sızmıyor.
Eksileri: DB'de anlamsız bir metin ("Abhaken") tutuluyor; ham SQL/raporlar onu görür; kuralın bir kısmı
uygulama kodunda (`storagePrescription` + DTO gizleme) ve bu yolu atlayan yazan biri (script,
Sprint 3 endpoint'i) shim'i unutursa CHECK reddeder (güvenli taraf: hata, yanlış veri değil).
Not: şablonlarda (0023) boş CHECKLIST'e kendi constraint'i zaten izin veriyor. Kopyalamada shim yeniden uygulanıyor.

**Kalıcı constraint değişikliği** (`proposals/warmup-checklist-constraint.sql`, uygulanmadı).
Artıları: temiz veri, shim kaldırılabilir. Eksileri: `DROP CONSTRAINT` gerektirir
(`APPROVED_DESTRUCTIVE.json` + owner onayı); yeni CHECK tüm satırları doğrular (tarama). Shim'i kaldırmak
için önce eski satırların `'Abhaken'` → NULL backfill'i gerekir (veri yazımı).
**Öneri:** Sprint 3'te koç UI'ı canlıya alınana kadar shim kalsın; kalıcı değişiklik ayrı, onaylı bir migration olsun.

| Risk | Değerlendirme |
|---|---|
| Transaction | Bekleyen tüm migration'lar **tek transaction** → 0022+0023 atomik. Yeni enum değerini kullanan bir migration aynı çalıştırmada olmamalı (§2.1) |
| Roll-forward | Tercih edilen. Yeni kolonlar NULL/false, eski API onları yok sayar; API'yi geri almak yeterli |
| Enum rollback | `ADD VALUE` geri alınamaz. Kullanılmayan değer zararsız. Kullanılmışsa enum kalmalı |
| Yedek | Uygulamadan önce Neon PITR noktası not edilir. Önce Neon **branch** üzerinde prova yapılır (PG sürüm farkı + gerçek veri hacmi + kilit süresi) |
| Deploy sırası | 1) migration, 2) API, 3) yeni mobil uygulama sürümünün yaygınlaşması, 4) **en son** koç UI'ında yeni tipler |
| Uyumluluk | Eski API yeni şemayla çalışır. Yeni API eski verilerle çalışır (legacy testleri). Eski oturumun yeni API'de devam etmesi B2 ile güvenli |
| Kilitler | `ALTER TABLE` / index oluşturma commit'e kadar kilit tutar. Tablolar küçük. Düşük trafik saatinde uygulanmalı |

## 14. App uyumluluğu ve Sprint 3 kararı

**Mobil sözleşmeler:** yeni yanıt alanları opsiyonel (eski uygulama parse eder). Yeni Flutter sürümü
bilinmeyen modu `custom` olarak tanıyor (birim testi). **Zaten kurulu eski uygulama sürümleri** yeni
`INTERVAL`/`CHECKLIST` modunu görünce **antrenmanı yükleyemez**. Bugün hiçbir arayüz `executionType`
göndermiyor, yani production'da bu modlar oluşmaz.
**Feature flag ihtiyacı: EVET.** API, koç token'ıyla `executionType` kabul ediyor. Koç UI'ı yayına
alınmadan önce sunucu tarafında bir bayrak (ör. yeni tipler kapalıyken `executionType != null` → 400)
veya minimum uygulama sürümü kontrolü eklenmeli. Bu sprintte eklenmedi (yeni tipler aktifleştirilmedi).

**Sunucu rollout güvenliği:** migration önce, API sonra. Geri alma = API'nin eski sürümü (şema kalır).

**Sprint 3 kararı: GO (koşullu).** Sprint 2 modeli ve migration'lar gerçek PostgreSQL'de doğrulandı.
Bulunan iki gerçek hata minimal şekilde düzeltildi ve testlerle sabitlendi. Koşullar:
1. Sprint 1/2/2.5 çalışmaları commit edilmeli (şu an hiçbiri commit'li değil; owner kararı).
2. Production'dan önce Neon branch provası (sürüm farkı, veri hacmi).
3. Koç UI'ı yeni tipleri açmadan önce feature flag / minimum app sürümü ve yeni mobil sürümün dağıtımı.
4. Ayrı görevler: Next.js güvenlik güncellemesi, eski `management.int` assertion'ı, pg@9 eşzamanlı sorgu deseni.
