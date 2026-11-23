# iOS Training — Sprint 7.5 Browser E2E Results

Real browser, real servers, isolated database — 2026-11-23, Windows.

## Setup (`apps/web/e2e`, commit 4f9cd9b)

| Part | What runs |
|---|---|
| Browser | Chromium 1248 (already installed for Playwright) driven by `playwright-core` 1.64.1, headless |
| Web | `next build` + `next start` (production mode) on `http://localhost:3291` |
| API | Hono (`src/server.ts` via tsx) on `127.0.0.1:4291`, `DEV_AUTH=disabled`, local storage driver in the artifacts folder |
| DB | isolated local PostgreSQL 18 (`vitruv-it` cluster, 127.0.0.1:55433), database `vitruv_it_e2e`, recreated per run, migrations 0000–0025 |
| Data | fictional: 1 admin, Coach Alpha (2 clients), Coach Beta (none), Anna Beispiel, Ben Muster, 3 exercises |

Fail-closed: child processes get **system variables only** (nothing like `DATABASE_URL` is inherited
from the shell, no `--env-file`); every web key that `next.config.ts` would otherwise take from the
live root `.env` is set explicitly; the seed refuses anything but the loopback `vitruv-it` cluster
(static URL checks + server identity check) and the runner re-checks the returned database before
the API starts. Random password per run, never printed. Artifacts in the OS temp folder.

Run: `VITRUV_IT_DATABASE_URL='postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable' pnpm --filter @vitruv/web test:e2e`
(`--build` forces a rebuild; `E2E_TRAINING_EXTENDED_TYPES=enabled` for the flag-ON run).

> The E2E build writes `apps/web/.next` for the E2E origin. Rebuild normally before any other use.

## Results — 18/18 with the flag OFF, 18/18 with the flag ON

| # | Flow | Result | Evidence |
|---|---|---|---|
| 1 | Coach logs in through the real `/login` form (HttpOnly `__Host-` cookies) | ✅ | — |
| 2 | Workout library opens — empty state "Noch keine Workouts" | ✅ | — |
| 3 | New template: empty-name validation, add exercise via search, Sätze 3 / Wdh. 10, save | ✅ | 03-template-saved |
| 3b | Template appears in the library | ✅ | — |
| 4 | Duplicate → editor of "(Kopie)", status "das Original bleibt unverändert"; original still 1 Übung · Version 1 | ✅ | — |
| 5 | Assign to Anna **and** Ben (one dialog) → two separate per-client copies | ✅ | 05-assigned |
| 6 | Edit Anna's copy 3 → 5 sets → Ben's copy and the template still 3 | ✅ | 06-copy-a-saved |
| 7 | Trainingswoche: workout on today; second workout on the same day via "Aus Bibliothek wählen" → two entries, two ids | ✅ | 07-two-workouts-same-day |
| 8 | Activate the draft plan | ✅ | — |
| 9 | Participant (real API) completes both same-day workouts; the session snapshots Anna's 5 sets; two separate history entries | ✅ | — |
| 10 | Coach refresh: Trainingsfortschritt "Erledigt 2"; Einheit detail "Satz 1: 10 von 10 Wdh." … "Gesamt: 45 Wiederholungen"; "Noch keine Vergleichsdaten" (no fake 0) | ✅ | 10-coach-progress, 10-session-detail |
| 11 | Dashboard refresh: "Letzte Einheiten" lists Anna, "Einheiten diese Woche 2" | ✅ | 11-dashboard |
| 12 | Coach Beta (not assigned): client training page, session detail and Anna's copy editor → **404**, no name leaked; API `GET …/clients/{Anna}/workouts` → 404 | ✅ | 12-unassigned-coach-404 |
| 13 | Archive "(Kopie)" → 1 Workout; Status filter "Archiviert" lists it; template page "Archiviert – nicht zuweisbar" → Wiederherstellen; Anna's recorded session unchanged | ✅ | — |
| 14 | Same template open in two tabs: tab 1 saves (Version 2), tab 2 saves → **409** "Neu laden"; reload shows tab 1's version | ✅ | 14-conflict |
| 15 | Exercise search: loading "Suche …" (delayed request), network failure → "Keine Verbindung zum Server…" (no stale results), "Erneut versuchen" → results | ✅ | 15-network-error |
| 16 | History pagination: 23 more dated workouts (real admin API, incl. **idempotency**: same `requestId` → `created:false`, same dayId), 25 sessions → page 1 + "Ältere Einheiten" = 25, no duplicates | ✅ | 16-history-page-2 |
| 17 | Feature flag: OFF → Core/Warm-up types disabled + "noch nicht freigegeben" note; ON (isolated API only) → enabled, no note | ✅ / ✅ | 17-flag-disabled, 17-flag-enabled |

Spec list (20 coach scenarios) → all covered by rows 1–12; extra states: loading (15), empty
(2, 10), validation (3), 409 (14), network failure + retry (15), pagination (16), archive/restore
(13).

## Bugs the E2E found (fixed in 17bc551, see the security doc §4)

1. Editing any existing library template failed with "Bitte prüfe die markierten Felder." — the
   first E2E attempt of row 14 failed on this. Component tests had only covered the client copy.
2. Network failures left searches on "Suche …" forever (row 15's first attempt).

Both rows pass only with the fix (rebuilt with `--build`).

## Not covered (honest)

- The **participant UI is the Flutter app**; here the participant side runs through the real API.
  Flutter widget tests cover the app UI; no device E2E (no iPhone/Simulator on Windows).
- Uploading/playing real videos in the browser (local storage driver, no S3/CDN).
- Public website pages in the E2E database have no CMS content, so `/` logs "public website API"
  errors in the web log — expected for an empty CMS, not part of these flows.
- Firefox/WebKit, mobile viewports and screen-reader runs were not part of this E2E.
