# iOS Training — Sprint 7.5 Security Hardening

Branch `feature/ios-training`, 2026-11-23. Local commits only — nothing pushed, deployed or migrated;
no production database, storage, flag or `.env` was touched.

## 1. Dependency audit

Source: `pnpm audit` on the real lockfile + the GitHub advisories it reports. Before the upgrade:
**18 advisories** (1 high, 15 moderate, 2 low).

| Package | Before | After | Advisories fixed | Reachable in VITRUV? |
|---|---|---|---|---|
| `next` | 16.4.1 | **16.4.6** | GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2, GHSA-pc58-hwjq-p385, GHSA-rhh4-g77r-r9qj, GHSA-vvgp-ww4w-46vf | yes (runtime) — patched |
| `eslint-config-next` | 16.4.1 | 16.4.6 | (kept in step with next) | dev |
| `hono` | 4.13.13 | **4.13.20** | GHSA-4m76-xfj5-7975 (`mount`), GHSA-h7mg-cq63-vhpq (RegExpRouter wildcard middleware / encoded line terminator), GHSA-3gg2-335m-rxc6 (css helper), GHSA-46wx-v44x-9hh2 (`csrf()`), GHSA-4h7h-rv7c-7m2v (`validator('form')` multipart) | only h7mg was plausibly relevant (wildcard `authenticate`); the others use features VITRUV does not use — all patched anyway |
| `@hono/node-server` | 2.1.5 | **2.1.11** | GHSA-qv5m-9pm6-hqp3 (ECONNRESET on WS upgrade), GHSA-jpvv-r467-5p4w (backslash path) | no WebSocket upgrades; backslash path tested (see §3) — patched |
| `happy-dom` | 21.0.1 | 21.0.4 | GHSA-834v-8h66-3h79 (high) | dev/test only |
| `minimatch` | 10.2.6 | 11.0.x | GHSA-g3hv-75wg-m249 | dev only (via `typescript-eslint` → `typescript-estree`); fixed by `typescript-eslint` 8.73.0, which itself depends on `minimatch ^11` — **no override/forced resolution** |

`pnpm dedupe` removed the now-unused `minimatch@10.2.6` and `@typescript-eslint/parser@8.71.2`.
`pnpm install --frozen-lockfile` passes. No major upgrade, no `pnpm.overrides`, no ignore list.

**After:** `pnpm audit --prod` → **No known vulnerabilities found.** Full audit: **2 remaining, dev-only**:

| ID | Package | Installed | Fixed in | Path | Exploitability | Status |
|---|---|---|---|---|---|---|
| GHSA-67mh-4wv8-2f99 | esbuild | 0.18.20 | 0.25.0 | `packages/db` > drizzle-kit > @esbuild-kit/* | only esbuild's **dev server** (`esbuild --serve`) answers cross-origin requests; drizzle-kit never starts it; not in any runtime bundle | accepted, dev-only; needs a drizzle-kit release without @esbuild-kit (latest 0.31.11 still has it) |
| GHSA-g7r4-m6w7-qqqr | esbuild | 0.27.7 | 0.28.1 | `apps/api` > tsup 8.5.x | same class (dev server); tsup bundles, never serves | accepted, dev-only; tsup 9 is a major (not forced) |

## 2. Next.js

- Clean build (`rm -rf .next`, next 16.4.6): **first attempt green**, no `SecurityFatalError`
  (the Sprint 7 build needed a retry — that advisory is fixed in 16.4.5+). `pnpm -r build` green in
  one run. Not retried to hide warnings.
- Routes, server components/actions, auth, admin, public pages, CMS, workout library and history
  were exercised by the unit suite (web 317 → see final counts) and the real-browser E2E (18 flows,
  see `ios-training-sprint7-5-e2e-results.md`).

### "Forbidden: invalid request origin" (seen in production earlier)

The text comes only from `apps/web/src/proxy.ts`: a state-changing request (POST …) to `/admin/*`,
`/login` or `/aktivieren` whose `Origin` header is not exactly `new URL(PUBLIC_SITE_URL).origin`.
Possible causes from the code (no production access in this sprint, so none is confirmed):

1. The admin is opened on another host than `PUBLIC_SITE_URL`: `www.` vs apex, the server IP, a
   second domain, a preview URL. Origins are compared exactly (scheme + host + port).
2. Scheme mismatch: site reached via `http://` while `PUBLIC_SITE_URL` is `https://` (or a proxy
   terminates TLS and the browser still sends the https origin while the variable says http).
3. `PUBLIC_SITE_URL` missing in the web server's runtime environment → default
   `http://localhost:3000` → every real origin is rejected. (`next.config.ts` fills it from the
   repo-root `.env` only if that file exists next to the app at start time.)
4. A port in the public URL (`:8443`) or a privacy proxy sending `Origin: null`.

**Not changed:** the check stays strict (no allow-all, no header-derived origin). **Added:** one
non-secret diagnostic line per rejection — `{"event":"csrf_origin_rejected","method","path",
"origin","expected","host"}` (no cookies, tokens or bodies) — so the next occurrence shows which of
the four causes it is. Tests (`auth-web.test.ts`): www vs apex, http vs https, other port and
`null` origin → 403 + one log line each; exact origin → 200; the log never contains cookie values.
**Fix on the server (owner):** set `PUBLIC_SITE_URL` to the one canonical origin and redirect all
other hosts to it at the proxy (as `docs/AUTH-ARCHITECTURE.md` §3 requires).

## 3. Hono / API

New `apps/api/src/security-paths.test.ts` (11 tests):

- Sweeps **every** registered `/v1/admin|client|auth/*` route (> 80) without credentials → **401**
  on all (never 2xx, the test app's DB throws on use, so a bypass would show as 500). Only the five
  intentionally public auth endpoints are exempt (login, refresh, logout, activate,
  activation/check — credential in the validated JSON body, rate-limited).
- Invalid bearer token = no token (401); `x-vitruv-dev-auth` ignored when DEV_AUTH is not wired.
- Path spellings on 5 protected targets: `%0A`, `%0D`, `%0D%0A`, `%E2%80%A8`, trailing slash,
  `%2F`, `//`, uppercase, `/./`, `/x/../`, `%61dmin` → **401 or 404 only**.
- Real `@hono/node-server` on port 0 with raw HTTP/1.1: backslash variants (`/v1\admin\clients`,
  `%5C`, `/health\..\v1\…`) → 400/401/404, never data; `/health` stays 200.

Reviewed, unchanged and still covered by the existing suites (API unit 244, API PG 165 + 1
skipped, all green on hono 4.13.20): login/refresh rotation + reuse detection, roles via
`requirePermission`, client scoping (COACH = assigned clients only, 404 otherwise), Zod validation
on every input, streaming uploads (raw stream, MIME sniff, size limits), media, workouts
(snapshot-only reads), rate limits (login 30/15 min per IP + per e-mail failures). CSRF: the API is
Bearer-only (no cookies) and therefore not CSRF-exposed; the web uses HttpOnly + SameSite=Lax
cookies + the proxy origin check + Next's own server-action Origin/Host check.

## 4. Bugs found in this sprint (fixed, commit 17bc551)

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | Saving an **existing** workout template always failed: "Bitte prüfe die markierten Felder." with no marked field (strict create schema + `expectedVersion: undefined` → Zod 4 `unrecognized_keys`; since a882fe0) | coaches could not edit any library template in the web admin | validate each target with its own request schema; regression test |
| 2 | Network failure (rejected server action) left the exercise search / "Aus Bibliothek wählen" stuck on "Suche …" and threw inside the save / assign transitions | stuck UI, lost form on save | `callAction()` → existing error state + "Erneut versuchen"; form kept; assign retry reuses the `requestId` (idempotent); 4 component tests |

Found but **not** changed (cosmetic, out of scope): the dashboard greets a COACH without
`users.display_name` as "Admin" (fallback string); the library picker shows "Keine Workouts
gefunden." for the 250 ms debounce before the first search.

## 5. Secrets

No `.env` value read or printed. Secret scans over every staged diff (connection strings with
credentials, Neon hosts, AWS keys, inline passwords) were empty. E2E password: random per run,
never printed; E2E artifacts (screenshots, logs, results) live outside the repo and were scanned
(no password, hash, bearer token or Neon reference).
