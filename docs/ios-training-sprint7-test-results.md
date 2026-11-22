# iOS Training — Sprint 7 Test Results

All numbers are from real runs on Windows, 2026-11-23. PostgreSQL tests ran against the
**isolated local cluster** (`127.0.0.1:55433`, `vitruv_it_admin`), never Neon; the Sprint 2.5
fail-closed guard is unchanged. `test:integration` (which would use the live `.env` database) was
**not** run.

## Counts

| Suite | Baseline (Sprint 6) | Sprint 7 | New |
|---|---|---|---|
| Flutter (`flutter test`) | 386 | **413 / 413** | +27 |
| API unit (`vitest run`) | 244 | **244 / 244** | 0 |
| API PostgreSQL (`vitest.pg.config.ts`) | 149 + 1 skipped | **165 passed + 1 skipped** | +16 |
| DB PostgreSQL | 15 | **17 / 17** | +2 |
| DB unit | 24 | **24 / 24** | 0 (one guard test extended for 0025) |
| Web (vitest + happy-dom) | 295 | **317 / 317** | +22 |
| Contracts | 108 | **113 / 113** | +5 |
| Shared | 41 | **54 / 54** | +13 |
| Design tokens | 106 | **106 / 106** | 0 |

Other gates: `flutter analyze` — no issues. `pnpm -r lint` — 0 errors. `pnpm -r typecheck` — 0
errors. `pnpm -r build` — all packages build; the web build first stopped with Next.js'
`SecurityFatalError` (known advisory, release blocker) and passed unchanged on retry. No dependency
was upgraded.

Skipped: the one API PG test skipped since Sprint 2.5 (unchanged). No test was deleted or skipped
in Sprint 7.

## Changed existing assertions (documented)

- `sprint6_engines_flow_test.dart`: the history line "Gesamt: 65 von 60 Wdh." was replaced by the
  Sprint 7 spec format (Gesamtziel 60 / Geschafft 65 / Benötigte Sätze 2).
- `packages/db` migration guard / `migrations.pg` / API PG global setup: 25 → 26 migrations,
  0025 columns + FK actions added to the expected schema.
- `apps/web/.../workouts.test.tsx`: one extra module mock (website media actions) because the
  editor now contains the media picker. No assertion changed.

## New test files

- `apps/api/test/sprint7-history.pg.test.ts` (16)
- `packages/db/test/migrations.pg.test.ts` — new block C: 0025 backfill, RESTRICT (23001) / SET NULL
- `packages/contracts/src/sprint7.test.ts` (5), `packages/shared/src/workout-history.test.ts` (13)
- `apps/mobile/test/features/sprint7_video_test.dart` (8)
- `apps/mobile/test/features/sprint7_history_test.dart` (16)
- `apps/mobile/test/features/sprint7_warmup_semantics_test.dart` (3)
- `apps/web/src/components/admin/training/sprint7.test.tsx` (22)

## Spec test list (§23) → where it is covered

| # | Case | Covered by |
|---|---|---|
| 1–2 | coach adds / replaces a video | API PG 2, 5; web "picks a video…", "keeps an assigned video…" |
| 3 | exercise without video works | API PG 2, 6+8; Flutter video 8 |
| 4 | video ref copied to template copy | API PG 4 |
| 5 | client A's change does not affect B | API PG 5 |
| 6 | supported format handled | API PG 1; Flutter video 7 (`canPlayVideo`) |
| 7 | WebM/Ogg on iOS handled safely | API PG 1 (upload refused); Flutter video "WebM on an iPhone"; web WebM warning |
| 8 | network error does not crash | Flutter video 6 (error state + retry, no exception) |
| 9 | unauthorized media access | API PG 3 (website/unknown asset refused), 36–40 |
| 10 | closing the video keeps workout state | Flutter video 9 (rest timer + no mutations) |
| 11–12 | completed session listed / detail opens | API PG 11–15, 18–21; Flutter history |
| 13–17 | Strength / MAX / Total sets / Core / Warm-up | API PG 18–21; Flutter "26-30", "27. MAX"; web result tests |
| 18 | incomplete data never shown as 0 | Flutter "25.", detail "Runde 3: 0 Sek." absent; web "nothing recorded" |
| 19–20 | newest first / pagination | API PG 11–15, 16–17; Flutter "23.", "24."; web pagination links |
| 21 | template edit does not change history | API PG 32–33 |
| 22 | assignment edit does not change history | API PG 9 (assignment video changed after start → snapshot unchanged); general snapshot rule tested since Sprint 5 |
| 23 | archive does not delete history | API PG 32–33 |
| 24 | history survives app restart | indirect: history is server data, the app reloads it (Flutter pull-to-refresh test); no dedicated restart test |
| 25–29 | comparison per set, totals, sets, missing data | API PG 22–29; Flutter "31-33", "34."; web comparison tests |
| 30 | different exercise ids never merged | API PG 22–29 (match key exerciseId + mode + MAX); shared tests |
| 31–32 | weekly completed / pending | API PG 34–35; web Trainingsfortschritt |
| 33 | several workouts on one day | API PG 34–35 counts per workout (one status each); no separate same-day UI test |
| 34 | timezone / date consistency | dated week from Sprint 4 tests (Europe/Berlin); no new Sprint 7 test |
| 35 | refresh shows the new result | app: Flutter "35. app resume…" + pull-to-refresh; coach: server-rendered page, not tested in a real browser |
| 36–39 | isolation / unauthorized coach / ownership | API PG 36–40, 10 |
| 40 | old API contracts kept | contracts tests (additive fields optional); Flutter fake keeps old shapes |
| 41–48 | engine regressions, 409, idempotency, flag OFF, watch fake | existing Sprint 4–6 suites, all green |
| 49 | one-item Warm-up VoiceOver | `sprint7_warmup_semantics_test.dart` |
| 50 | 320 px + large text | Flutter video "10.", history "38." (found + fixed a real overflow in the history row) |

Honest gaps: 24, 33, 34 and the coach side of 35 have no dedicated new test (see table).

## Real-device limitations

- No iOS build, no Simulator, no iPhone run — Windows cannot build or run iOS.
- In Flutter tests there is no video plugin: opening a video ends in the error state. Real
  playback (AVPlayer, H.264/AAC, seeking, buffering, range requests) is **untested** and must be
  checked on a real iPhone.
- No real-browser E2E for the coach pages (component tests only).
- Apple Watch: unchanged fake transport only.
