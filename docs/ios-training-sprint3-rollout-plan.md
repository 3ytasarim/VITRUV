# iOS Training — Sprint 3 rollout planı

**Production release ONAYLANMADI.** Bu belge bir plan; hiçbir adım uygulanmadı. Her adım proje
sahibinin açık onayını ister.

## 1. Migration sırası

| Sıra | Dosya | Durum |
| --- | --- | --- |
| 1 | `0022_training_v2.sql` | production'da **uygulanmadı** |
| 2 | `0023_workout_templates.sql` | production'da **uygulanmadı** |
| 3 | `0024_sprint3_template_library.sql` | production'da **uygulanmadı** |

- 0022 `ALTER TYPE … ADD VALUE` içerir; eklenen değerler aynı transaction'da kullanılamaz. 0023 ve
  0024 bu değerleri **kullanmaz** (0024'te enum değişikliği yok, category text + CHECK). Bu yüzden
  üçü aynı `migrate` çalıştırmasında güvenle beklenebilir — yine de önerilen: önce 0022+0023, ayrı
  bir çalıştırmada 0024 (hata halinde kapsamı küçük tutar).
- İleride `INTERVAL`/`CHECKLIST` değerini **kullanan** bir migration (backfill, CHECK) 0022 ile aynı
  çalıştırmada beklememeli.
- Migration'lar doğrudan host ile (pooler değil) uygulanır.

## 2. Neon branch provası (production'dan önce zorunlu)

1. Neon'da production'dan **branch** (yalnız onayla, sahibi tarafından).
2. Branch'e `pnpm db:migrate` → `pnpm db:inspect`; yeni kolon / index / CHECK kontrolü.
3. Branch'e karşı API'yi flag **kapalı** çalıştır; mevcut client'lar, eski uygulama, eski
   `client_plans` ekranı, Sprint 2 akışları regresyon.
4. Branch'te bir şablon oluştur → ata → kopyayı düzenle → session başlat / bitir (sentetik hesap).
5. Branch silinir; sonuç bu belgeye not edilir.

## 3. Yedek / geri alma

- Önce: Neon point-in-time restore noktası notu + şema dökümü (veri dökümü repoya **girmez**).
- 0024 geri alma SQL'i (yalnız yeni kolonlarda veri yokken / kabul edildiyse; destructive →
  `APPROVED_DESTRUCTIVE.json` + sahibi onayı gerekir):

```sql
ALTER TABLE "workout_templates" DROP CONSTRAINT IF EXISTS "workout_templates_category_valid";
DROP INDEX IF EXISTS "training_days_assignment_request_unique";
ALTER TABLE "workout_templates" DROP COLUMN IF EXISTS "category";
ALTER TABLE "training_days" DROP COLUMN IF EXISTS "assignment_request_id";
```

- Tercih edilen geri alma: **kodu geri al, şemayı bırak** (additive kolonlar eski kodu bozmaz).

## 4. Feature flag rollout

1. Deploy: `TRAINING_EXTENDED_TYPES` ayarlanmaz / `disabled` (varsayılan). Kütüphane, Duplizieren,
   Zuweisen, Trainingswoche STRENGTH + TOTAL_REPS ile çalışır — bunlar mevcut uygulamada zaten var.
2. Capability 2'yi destekleyen uygulama (Sprint 4: Core-Timer, Warm-up-Checklist, MAX girişi)
   mağazalarda yayınlanır.
3. Minimum uygulama sürümü capability 2'ye yükseltilir (zorunlu güncelleme).
4. Ancak bundan sonra `TRAINING_EXTENDED_TYPES=enabled`. Geri dönüş: flag'i kapatmak yeni extended
   satır yazımını anında durdurur; mevcut satırlar okunmaya devam eder.

## 5. Mobil uyumluluk / mevcut kullanıcılar

- Client DTO'su değişmedi; admin DTO'larına yalnız **opsiyonel** alanlar eklendi (`sourceTemplateId`,
  `sourceTemplateVersion`). Flutter 260 test geçti.
- Eski uygulama flag kapalıyken bilinmeyen bir tip görmez. Flag açılmadan önce §4.3 şart.
- Mevcut programlar, günler, session geçmişi, `client_plans` kayıtları **değiştirilmez**; toplu
  dönüştürme yok. Yeni bir DRAFT program yalnız coach bir workout atadığında ve client'ın programı
  yoksa oluşur — client'a ancak aktifleştirilince görünür.

## 6. Güvenlik blokerleri (release öncesi)

| Konu | Durum | Gerekli |
| --- | --- | --- |
| **Next.js 16.4.1** | `pnpm audit`: 7 moderate advisory, etkilenen aralık `<=16.4.4`, düzeltilmiş: **16.4.5** (GHSA-mfr8-8qww-v76h, -vc7v-qv4w-wrv8, -7qx7-33qx-rqx2, -f3mh-rxg3-f5g2, -pc58-hwjq-p385, -rhh4-g77r-r9qj, -vvgp-ww4w-46vf). `next build` ilk denemede `SecurityFatalError` ile durur. | **Minimum güvenli sürüm 16.4.5** (patch, major değil). Ayrı güvenlik görevi: upgrade + tam regresyon + build. Bu sprintte otomatik upgrade yapılmadı; build çıktısındaki "upgrade çalıştır" talimatları uygulanmadı. **Release bloker.** |
| `hono` < 4.13.16 | 5 advisory (moderate/low; middleware bypass, csrf, form validator) | Ayrı görev: `hono >= 4.13.16` |
| `@hono/node-server` < 2.1.6 | 2 moderate advisory | Ayrı görev: `>= 2.1.6` |
| `minimatch` (geçişli) | moderate DoS | lockfile override değerlendirmesi |
| **pg@9 riski** | Kurulu `pg` 8.23.1. `workouts.service.ts` `focused()` bir transaction client'ında `Promise.all` ile eşzamanlı sorgu atıyor; pg 8 bunları sıraya koyar (deprecation), **pg 9'da hata** olur. `website.service.ts listPages` pool üzerinde → sorun yok. Sprint 3 kodu (`training/*`) `Promise.all` kullanmaz. | pg 9'a geçmeden önce `focused()` sıralı sorgulara çevrilmeli; şimdilik `pg@^8` sabit kalmalı. Upgrade yapılmadı. |

## 7. Sprint 4 bağımlılıkları

- Flutter: Core-Timer (INTERVAL), Warm-up-Checklist (CHECKLIST), MAX girişi, capability 2 bildirimi
  ve minimum sürüm kontrolü.
- Flag açma kararı (§4) ve Neon provası (§2).
- İsteğe bağlı: eski PlanEditor'ün Trainingswoche ile birleştirilmesi / `client_plans`'ın açık,
  coach onaylı dönüştürme aracı (sessiz değil).
- İsteğe bağlı: gün bazlı eşzamanlılık token'ı, çok-client'lı tek atama endpoint'i.
- Güvenlik görevleri §6 (Next.js 16.4.5 release bloker).
