# iOS Training — Sprint 2 API Contracts

> Tarih: 2026-11-22. Kaynak: `packages/contracts/src/{training,workout}.ts`, `packages/shared/src/{workout,workout-engine}.ts`.
> Kural: **yalnızca eklemeler.** Mevcut alanlar, yollar ve durum kodları değişmedi; yeni yanıt alanları
> `optional` olarak tanımlı (eski API yanıtları yeni şemayla da parse edilir — test 13).

## 1. Sözlük

| Değer | Nerede | Anlam |
|---|---|---|
| `TRAINING_EXECUTION_TYPES` = `STRENGTH`, `TOTAL_REPS`, `INTERVAL`, `CHECKLIST` | atama (`executionType`, null = eski satır) | koçun seçtiği antrenman tipi |
| `WORKOUT_EXECUTION_MODES` += `INTERVAL`, `CHECKLIST` (sona eklendi) | oturum egzersizi (`executionMode`) | snapshot'taki çalıştırma modu |
| `WORKOUT_TIMER_MODES` = `NONE`, `MANUAL_REST`, `AUTO_REST`, `INTERVAL` | `exercise.timer.mode` | uygulamanın çalıştıracağı sayaç |
| `WORKOUT_DAY_STATUSES` = `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED` | client programında gün | türetilir; DB'de saklanmaz |
| `INTERVAL_DEFAULTS` = 5 × 40 s / 20 s | Core | boş bırakılırsa API bunu **saklar** |

Tip → mod eşlemesi: `STRENGTH→SETS_REPS`, `TOTAL_REPS→TOTAL_REPS`, `INTERVAL→INTERVAL`,
`CHECKLIST→CHECKLIST`. `executionType = null` ise eski kural: sets/reps/(repsMax) → `SETS_REPS`,
totalReps → `TOTAL_REPS`, duration → `DURATION`, yoksa `CUSTOM`.

## 2. Koç: atama yazma (mevcut uç noktalar, yeni opsiyonel alanlar)

`POST /v1/admin/training/sections/:sectionId/assignments`, `PATCH /v1/admin/training/assignments/:id`
(yetki ve kapsam değişmedi: `programOf()` → `clientAccessible`, COACH yalnız atanmış danışanlar).

Yeni opsiyonel alanlar: `executionType: STRENGTH|TOTAL_REPS|INTERVAL|CHECKLIST|null`, `repsMax: boolean`.

| Tip | Zorunlu | Yasak | API'nin sakladığı ek değer |
|---|---|---|---|
| `STRENGTH` | `sets` ve (`reps` **veya** `repsMax`) | `totalReps`; `reps` + `repsMax` birlikte | — |
| `TOTAL_REPS` | `totalReps` (+ ops. `restSeconds`) | `sets`, `reps`, `repsMax` | — |
| `INTERVAL` | — (`sets`=tur, `durationSeconds`=çalışma, `restSeconds`=dinlenme) | `reps`, `totalReps`, `repsMax` | boşlar → 5 / 40 / 20 |
| `CHECKLIST` | — | `sets`, `reps`, `totalReps`, `durationSeconds`, `restSeconds`, `repsMax` | metin yoksa `prescriptionText = "Abhaken"` (istemciye gösterilmez) |
| `null` (eski) | eski kural (en az bir alan) | — | — (`repsMax` için `sets` zorunlu) |

Kurallar `prescriptionIssues()` içinde; create şemada ve update'te **birleştirilmiş** satır üzerinde
çalışır. Mevcut gövdeler (tip olmadan) aynen kabul edilir.

Yanıt (`AdminAssignment`) += `executionType?`, `repsMax?`.

## 3. Danışan: program okuma

`GET /v1/client/training/active`: egzersiz += `executionType?`, `repsMax?`; gün += `workoutStatus?`
(`NOT_STARTED | IN_PROGRESS | COMPLETED`, kendi oturumlarından; `ABANDONED` = başlanmamış sayılır).

## 4. Danışan: oturum (self context, `training.self.workout`, yalnız CLIENT)

Mevcut uç noktalar değişmedi: `POST /v1/client/workouts` (başlat/devam), `GET /current`,
`GET /:sessionId`, `PATCH …/exercises/:exerciseId`, `PATCH …/sets/:setNumber`, notlar,
`POST …/complete|abandon`. `setNumber` üst sınırı 50 → 500'e **genişletildi** (dinamik setler için;
hiçbir eski istek reddedilmez).

### 4.1 Oturum DTO eklemeleri (hepsi optional)

```
session      += sourceTemplateId?, sourceTemplateVersion?
target       += repsMax?
exercise     += timer?: { mode, restSeconds|null, interval: {rounds, workSeconds, restSeconds}|null }
exercise     += totalReps?: { target, done, remaining, reached, setCount } | null   (yalnız TOTAL_REPS)
set          += actualDurationSeconds?, clientSetId?
```

`sets[]`: `SETS_REPS` = plan setleri; `INTERVAL` = tur başına bir satır (`targetDurationSeconds` =
çalışma); `TOTAL_REPS` = kaydedilen her set (büyür); `CHECKLIST`/`DURATION`/`CUSTOM` = boş.

### 4.2 YENİ — `POST /v1/client/workouts/:sessionId/exercises/:exerciseId/sets`

Yalnız `TOTAL_REPS`. İstek (strict):

```json
{ "clientSetId": "uuid (uygulama set başına bir kez üretir)", "actualReps": 12,
  "actualWeight": 0, "recordedAt": "2026-11-20T08:00:00+01:00" }
```

Yanıt `201` (yeni) / `200` (tekrar):

```json
{ "exercise": { …WorkoutSessionExercise }, "progress": { … },
  "set": { "setNumber": 2, "actualReps": 12, "clientSetId": "…", … },
  "created": true, "restSeconds": 60 }
```

- **İdempotent:** aynı `clientSetId` tekrar → saklı set, `created:false`, hiçbir şey değişmez; `restSeconds`
  ilk cevaptakiyle aynı (yalnız o sete kadarki setler sayılır).
- **Sprint 2.5:** aynı `clientSetId` **farklı değerlerle** (`actualReps` veya `actualWeight`) → `409`.
  Saklı kayıt değişmez, iki kayıt birleştirilmez. `recordedAt` karşılaştırılmaz.
- **Sprint 2.5 — eski toplam:** eski uygulamanın egzersiz düzeyinde yazdığı toplam (`actualReps`, set
  satırı yok) ilk yeni sette önce **set 1** olarak taşınır. Örnek: 70 hedefte eski 30 + yeni 12 → `done: 42`.
  Eski toplam kaybolmaz.
- **Eşzamanlılık:** oturum satırı `FOR UPDATE` kilitlenir; son savunma partial unique index
  `(session_exercise_id, client_set_id)` + `ON CONFLICT DO NOTHING` → yarışı kaybeden istek kazananın
  satırını döner.
- **Hedefe ulaşınca:** egzersiz `COMPLETED`, `restSeconds: null` (son setten sonra dinlenme yok);
  yeni `clientSetId` ile ek set → `409`. `exercise.actualReps` = toplam (eski alan senkron).
- Hatalar: başka danışanın oturumu/egzersizi → `404`; tamamlanmış/terk edilmiş oturum → `409`;
  `TOTAL_REPS` olmayan egzersiz → `409`; geçersiz gövde (client id, hedef alanı, `actualReps` < 1) → `400`.

### 4.3 Mevcut uç noktalarda yeni davranış

| Uç nokta | Ek kural |
|---|---|
| `PATCH …/exercises/:id` | `CHECKLIST`/`INTERVAL`: `actualReps/Duration/Weight` → 400 (yalnız `status`). `TOTAL_REPS` + kayıtlı set varsa `actualReps` → 400 (çift sayım yok). Kayıtlı set yoksa eski yol aynen çalışır |
| `PATCH …/sets/:n` | `actualDurationSeconds` eklendi (interval turu). `TOTAL_REPS` setinin tekrarı düzeltilirse toplam ve durum yeniden hesaplanır |

### 4.4 Tamamlanmış oturum politikası

`IN_PROGRESS` dışındaki oturumda kayıt değişmez (`409`) — değişiklik yok. Not ekleme (mevcut)
serbest kalır, çünkü not bir sonuç değildir. Düzeltme politikası: Sprint 2'de **yok** (immutable);
koç düzeltmesi gerekirse ayrı, denetlenen bir uç nokta olarak tasarlanmalı.

## 5. Sayaç hesapları (`@vitruv/shared/workout-engine`)

| Fonksiyon | Sonuç |
|---|---|
| `timerConfigOf(exercise)` | CHECKLIST→NONE · INTERVAL→INTERVAL(+config) · SETS_REPS/TOTAL_REPS + rest>0 → AUTO_REST · DURATION/CUSTOM + rest>0 → MANUAL_REST · aksi NONE |
| `totalRepsProgress(60, [12,10])` | `{ done: 22, remaining: 38, reached: false, setCount: 2 }` (remaining ≥ 0) |
| `restAfterSet(config, …)` | Strength son plan setinden sonra `null`; Total reps hedefe ulaşınca `null` |
| `intervalPlan({5,40,20})` | WORK,REST,…,WORK (9 faz), toplam 280 s, son turdan sonra dinlenme yok |
| `intervalPositionAt(plan, 45)` | `{ round: 1, phase: REST, remainingSeconds: 15 }` (uygulama yeniden başlayınca devam) |
| `workoutDayStatus(sessions)` | IN_PROGRESS > COMPLETED > NOT_STARTED; ABANDONED sayılmaz |

## 6. Flutter uyumluluğu

`ExecutionMode.fromWire` artık `INTERVAL`, `CHECKLIST` tanır; bilinmeyen değer → `custom` (eskiden
exception → tüm antrenman yüklenemezdi). **Not:** Zaten kurulmuş eski uygulama sürümleri yeni modu görünce
hata verir. Bu yüzden koç UI'ı yeni tipleri açmadan (Sprint 3) **önce** bu uygulama sürümü dağıtılmalı.
Bugün hiçbir arayüz `executionType` göndermiyor → production'da yeni mod oluşmaz.
