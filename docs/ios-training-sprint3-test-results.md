# iOS Training — Sprint 3 test sonuçları

Tarih: 2026-11-22. Tüm DB testleri **izole local PostgreSQL 18.6** (`127.0.0.1:55433`, sentetik veri)
üzerinde. Production Neon'a bağlanılmadı; `test:integration` çalıştırılmadı.

## 1. Özet

| Kontrol | Sonuç |
| --- | --- |
| `pnpm -r lint` | temiz |
| `pnpm -r typecheck` | temiz |
| `pnpm -r test` | design-tokens 106, shared 41, contracts 108, db 23, web 295, api 244 — hepsi geçti |
| `packages/db` `test:pg` | 15/15 (25 migration fresh + upgrade, 0024 dahil) |
| `apps/api` `test:pg` | 132 geçti, 1 atlandı (`health-db`, sadece Neon) — `templates.pg.test.ts` 17/17 |
| `pnpm --filter @vitruv/web build` | derleme başarılı (tüm yeni rotalar listelendi); ilk denemede Next.js `SecurityFatalError` (bkz. rollout planı §7), ikinci denemede exit 0 |
| `flutter analyze` | No issues |
| `flutter test` | 260/260 |

## 2. 25 senaryo → test

Dosya: `apps/api/test/templates.pg.test.ts` (gerçek PG + gerçek Hono uygulaması).

| # | Senaryo | Test |
| --- | --- | --- |
| 1 | Şablon oluşturma (4 tip) | `1 + 22.` |
| 2 | Şablon düzenleme (version +1) | `2 + 25.` |
| 3 | Duplizieren → yeni id | `3 + 4.` |
| 4 | Orijinal değişmez | `3 + 4.` |
| 5 | Client A'ya atama | `5 + 6 + 22 + 21.` |
| 6 | Client B'ye bağımsız kopya | `5 + 6 + 22 + 21.` |
| 7 | A'nın kopyasını düzenlemek B'yi / şablonu etkilemez | `7.` |
| 8 | Sonraki şablon değişikliği kopyalara yansımaz | `8.` |
| 9 | Arşivleme atanmış kopyaları korur; arşivli şablon atanamaz | `9.` |
| 10–12 | Başlamış session snapshot'ı korunur; bitmiş sonuçlar değişmez | `10 + 11 + 12.` |
| 13, 15 | Başka coach hiçbir şey görmez; çapraz client id'leri reddedilir (IDOR) | `13 + 15.` |
| 14 | CLIENT şablon okuyamaz / yazamaz | `14.` |
| 16 | Eşzamanlı atama: tek requestId → tek kopya; paralel ilk atamalar → tek program | `16.` |
| 17–18 | Trainingswoche doğru tarih; legacy liste aynen kalır | `17 + 18.` |
| 19 | Eski mobil / API sözleşmeleri parse olur | `19.` |
| 20 | Flag OFF: extended tipler hiçbir yolda oluşturulamaz / atanamaz | `20.` |
| 21 | Warm-up bölümü kopyalanır | `5 + 6 + 22 + 21.` |
| 22 | Tip başına alanlar sunucu tarafında doğrulanır | `1 + 22.`, `5 + 6 + 22 + 21.` |
| 23 | Sunucu tarafı sayfalama, arama, tip filtresi (yapay limit yok) | `23.` |
| 24 | Hatalı kayıt kısmi kopya / yarım güncelleme bırakmaz | `24.` |
| 25 | Aynı kopyanın eşzamanlı düzenlenmesi: biri kazanır, diğeri 409 | `25.`, `2 + 25.` |

Ek olarak: `workouts-v2.pg.test.ts` Sprint 2 regresyonu (flag `extendedTypes: true` ile), tüm
önceki PG testleri.

## 3. Unit / contract / web

- `packages/contracts/src/templates.test.ts` (8): tip başına alanlar, MAX kuralları, sayfa sınırları,
  assign `date` XOR `weekId`, client-copy şeması.
- `packages/shared` — `usesExtendedTraining`, yeni izinler (`roles.test.ts`).
- `packages/db/src/migration-guard.test.ts` — 0024 additive, enum ADD VALUE yok.
- `apps/web/src/components/admin/training/workouts.test.tsx` (9):
  tip başına alanlar (Kraft / Gesamtziel / Core / Warm-up), flag kapalıyken "noch nicht
  freigegeben" + MAX devre dışı, "Vorlage bearbeiten" ↔ "Für Teilnehmer bearbeiten" ayrımı,
  client kopyası yalnız client action ile ve `expectedVersion` ile kaydedilir (satır id'leri korunur),
  409 → "Neu laden", geçersiz şablon istemcide durdurulur, Trainingswoche render / yetkisiz ekleme
  yok / plansız boş hafta, "starten" düğmesi yok.
- `training-pages.test.tsx` — client training sayfası yeni `searchParams` imzasıyla.

## 4. Tech debt A — `management.int` "4711"

Test silinmedi / atlanmadı. Beklenti 2026-10-28 kararına göre düzeltildi (kendi client'ı için coach
notu görünür) ve yeni no-leak regresyonu eklendi: aynı coach'un başka client'ında not yok, admin
rotasında 403, ham gövdede `internalNotes` / `passwordHash` / `account` yok. İzole PG'de geçti.

## 5. Yapılmayanlar

- Gerçek tarayıcıda uçtan uca görsel kontrol (dev sunucusu canlı Neon'a bağlanacağı için bilinçli
  olarak başlatılmadı).
- iOS build (Windows'ta mümkün değil).
