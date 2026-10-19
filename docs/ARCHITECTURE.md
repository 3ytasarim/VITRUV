# VITRUV — Architecture

Status: Sprint 2 (CMS core). This document describes what exists and the rules later sprints
build on. Website CMS details: [CMS-ARCHITECTURE.md](CMS-ARCHITECTURE.md).

## 1. System overview

```
             ┌──────────────────────────────┐        ┌──────────────────────────┐
 Browser ───▶│ apps/web  (Next.js)          │        │ apps/mobile (Flutter)    │◀── Android / iOS
             │  • public website  /         │        │  Heute · Training ·      │
             │  • coach/admin     /admin    │        │  Ernährung · Fortschritt │
             └──────────────┬───────────────┘        │  · Profil                │
                            │ HTTPS (server-side)    └────────────┬─────────────┘
                            ▼                                     │ HTTPS
             ┌─────────────────────────────────────────────────────▼─────────┐
             │ apps/api  (Hono on Node.js)  — the ONLY owner of business logic│
             │  /health, /health/db, /v1/<domain>/…                           │
             └──────────────┬──────────────────────────────┬──────────────────┘
                            │ node-postgres (TLS, verified) │ S3 API
                            ▼                              ▼
             ┌──────────────────────────────┐   ┌──────────────────────────────┐
             │ Neon PostgreSQL (existing)   │   │ Object storage               │
             │  users, media_assets, …      │   │  public bucket (CDN)         │
             │  drizzle.__drizzle_migrations│   │  private bucket (signed URLs)│
             └──────────────────────────────┘   └──────────────────────────────┘
```

One backend, one data model, three clients' worth of UI. No microservices: a single API process
with domain modules is the right size for this product and team.

## 2. Repository layout

```
VITRUV/
├── apps/
│   ├── web/            Next.js App Router — (site) route group = public site, /admin = coach panel
│   ├── api/            Hono API — src/{config,lib,auth,infra,modules}
│   └── mobile/         Flutter app — lib/{core,api,auth,features,shared,l10n}, android/, ios/
├── packages/
│   ├── db/             Drizzle schema, migrations, client, migrate/inspect scripts
│   ├── contracts/      Zod schemas = the HTTP contract (health, errors, media, CMS primitives)
│   ├── shared/         Roles & permissions, media kinds/visibility/MIME allow-list, env helpers
│   └── config/         tsconfig bases, ESLint flat config, Prettier, Vitest env setup
├── docs/               This documentation
├── assets-source/      Untouched source material (prototypes, images, documents)
├── .env.example        Variable names only
```

Internal packages are consumed as TypeScript source (`exports` → `src/index.ts`). Next.js
transpiles them (`transpilePackages`), the API bundles them with tsup, Vitest/tsx run them directly.
Dependency direction: `apps/* → contracts → shared`, `api → db → shared`. `web` must not depend on `db`.

## 3. Key decisions

| Decision          | Choice                                          | Why                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager   | pnpm workspaces                                 | Fast, strict dependency isolation, native workspace protocol.                                                                                                                                                                                                                                                                                                 |
| API framework     | **Hono** (on `@hono/node-server`)               | Small, fast, Web-standard `Request/Response`; `app.request()` makes every route testable without a port; first-class Zod validator, built-in secure headers / CORS / body-limit / request-id middleware; can move to an edge/serverless runtime later without rewrites. Fastify was the alternative — comparable, but heavier plugin model and less portable. |
| Backend placement | Dedicated API, not Next.js route handlers       | Flutter and web must share the exact same logic and auth; a separate API keeps the web app a pure client and deploys independently.                                                                                                                                                                                                                           |
| ORM               | Drizzle + node-postgres                         | SQL-first, typed, generates reviewable SQL migrations. node-postgres pool suits a long-running API; Neon's pooler handles fan-out.                                                                                                                                                                                                                            |
| Validation        | Zod 4 everywhere                                | One schema language for env, requests, responses and CMS content.                                                                                                                                                                                                                                                                                             |
| Logging           | pino (JSON) with redaction                      | Structured logs; credentials/headers redacted at the logger.                                                                                                                                                                                                                                                                                                  |
| Web styling       | Tailwind CSS 4 with `@theme` tokens             | Design tokens as CSS variables shared by all components; dark default.                                                                                                                                                                                                                                                                                        |
| Mobile            | Flutter + Riverpod + go_router + dio + gen-l10n | See [MOBILE-ARCHITECTURE.md](MOBILE-ARCHITECTURE.md).                                                                                                                                                                                                                                                                                                         |
| TypeScript        | 6.0 (strict)                                    | TS 7 (native) is not yet supported by typescript-eslint.                                                                                                                                                                                                                                                                                                      |
| ESLint            | 9.x                                             | eslint-plugin-react (via eslint-config-next) does not yet declare ESLint 10 support.                                                                                                                                                                                                                                                                          |

## 4. API

- `src/app.ts` builds the app from injected dependencies (logger, DB ping, CORS, limits) — no I/O
  at import time. `src/server.ts` wires real dependencies, validates env, handles SIGINT/SIGTERM.
- Middleware order: request id → access log → secure headers → CORS (allow-list) → body limit.
- Errors: every failure returns `{ error: { code, message, requestId?, details? } }`
  (`apiErrorSchema`). Unknown errors become `500 INTERNAL_ERROR`; internals are logged, never returned.
- Validation: `validate(target, zodSchema)` → `400 VALIDATION_FAILED` with field paths.
- Health:
  - `GET /health` — process liveness, never touches the DB.
  - `GET /health/db` — `select 1` with a 3 s timeout → `200 {status:'ok', latencyMs}` or
    `503 {status:'unavailable'}`. No host, user, DB name or driver message is ever returned.
- Business routes live under `/v1/<audience>/<domain>` in `src/modules/<domain>/` (routes → service;
  services take a `DbExecutor` so they compose inside transactions):
  - `/v1/public/website/pages/:slug` — published website content only (ETag = content revision).
  - `/v1/auth/…` — login, refresh, logout, logout-all, me, password, activation (docs/AUTH-ARCHITECTURE.md).
  - `/v1/admin/clients`, `/v1/admin/coaches` — coach & client management, object-scoped
    (docs/CLIENT-MANAGEMENT.md); `/v1/client/me` — the client's own profile (future Flutter).
  - `/v1/admin/training/…` — exercise library, client training programs (builder, lifecycle,
    preview), training media library under `/v1/admin/training/media`; every nested id is
    client-scoped (docs/TRAINING-ARCHITECTURE.md). `/v1/client/training/active` — the client's
    ACTIVE plan (Flutter DTO).
  - `/v1/client/workouts/…` — the client's own workout sessions (start/resume, record, complete,
    abandon, history; snapshot-based) and `/v1/admin/training/clients/:id/workouts` — read-only
    coach/admin summaries (docs/WORKOUT-ARCHITECTURE.md).
  - `/v1/admin/website/…` — CMS pages/sections, draft, preview, publish (behind `authenticate`).
  - `/v1/admin/media/…` — website media library: list, detail + usage, upload, alt text, protected delete.
  - `/media/<key>` — development-only delivery of PUBLIC objects from the local storage driver.
- The global body limit (1 MB) is skipped only for the media upload routes (`POST /v1/admin/media`,
  `POST /v1/admin/training/media`), which have their own limit.

### Authorization model

- Roles: `ADMIN`, `COACH`, `CLIENT` (`packages/shared/src/roles.ts`, mirrored by the DB enum `user_role`
  and the Dart `UserRole`).
- Handlers check **permissions**, not role strings: `requirePermission('website.content.publish')`.
  The role→permission map is in one place (`website.content.read|write|publish`,
  `website.media.read|write|delete`, `admin.access`, `clients.*`, `coaches.*`, `self:read`).
- **Object-level authorization** for client data: permission + relationship. A COACH reaches only
  clients with an active assignment to them; the scope is part of every SQL query and out-of-scope
  ids answer 404 (docs/CLIENT-MANAGEMENT.md §4).
- The request `principal` is only set by `authenticate(resolver)` (`src/auth/authenticate.ts`) after
  server-side verification, with the role loaded from the database. Client-supplied role or user IDs
  are ignored (covered by tests).
- **Authentication (Sprint 4):** opaque Bearer access tokens (15 min) + rotating refresh tokens,
  database-backed sessions (`auth_sessions`, hashes only), Argon2id passwords. The session
  resolver loads role + status from `users` on every request. The web Admin keeps the tokens in
  HttpOnly cookies on the web server and calls the API server-side; Flutter will hold them in
  secure storage. The development adapter (`DEV_AUTH`) is chained only outside production for
  local API tooling. Full model: [AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md).
- Data-level rules (a coach sees only their clients, a client only their own data) belong in the
  service/repository layer and come with the corresponding features.

## 5. Database

- Provider: **existing Neon PostgreSQL** (PG 18). Reused as supplied; no other database is created.
- Connection: `DATABASE_URL` (pooled endpoint) for the app. TLS with certificate verification is
  always enforced (`rejectUnauthorized: true`); only an explicit `sslmode=disable` turns TLS off.
  Missing `DATABASE_URL` fails fast — there is no fallback database.
- Migrations: Drizzle SQL files in `packages/db/migrations`, applied by `scripts/migrate.ts`:
  1. scans every migration for destructive SQL (DROP/TRUNCATE/DELETE/RENAME/type change) and refuses
     unless the file is listed in `APPROVED_DESTRUCTIVE.json` (requires owner approval);
  2. connects to the **direct** endpoint (`-pooler` removed in memory, or `DATABASE_URL_DIRECT`);
  3. applies pending migrations, each in a transaction; history in `drizzle.__drizzle_migrations`.
- `drizzle-kit` is configured without credentials, so `push`/`drop` cannot run by accident.

### Sprint 0 schema (`0000_baseline.sql`)

| Table          | Purpose                        | Notable columns / constraints                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | Identity for all roles         | `email` (unique on `lower(email)`), `display_name`, `role user_role` (default `CLIENT`), `status user_status` (`ACTIVE`/`DISABLED`), timestamps. No credentials yet.                                                                                                                                                  |
| `media_assets` | Metadata for every stored file | `kind` (`IMAGE`/`VIDEO`/`DOCUMENT`), `visibility` (`PUBLIC`/`PRIVATE`, default `PRIVATE`), unique `storage_key`, `file_name`, `mime_type`, `size_bytes`, nullable `width`/`height`/`duration_ms`/`alt_text`, `uploaded_by_user_id → users` (`ON DELETE SET NULL`), check constraints, indexes on `kind` and uploader. |

Enums: `user_role`, `user_status`, `media_kind`, `media_visibility`. No binary data in PostgreSQL.

### Sprint 2 schema (`0001_website_cms.sql`, additive)

| Table                      | Purpose                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `website_pages`            | Pages (`home`), `content_revision` (cache key), `last_published_at`                                      |
| `website_sections`         | Stable structure: `key` unique per page, `type`, `sort_order`, `enabled`                                 |
| `website_section_versions` | Typed JSON content: max one DRAFT + one PUBLISHED per section (partial unique indexes), ARCHIVED history |
| `website_media_slots`      | Media references of live versions with role; `asset_id → media_assets ON DELETE RESTRICT`                |

`media_assets` gained `purpose media_purpose` (`WEBSITE`, `TRAINING_VIDEO`, `NUTRITION`,
`CLIENT_UPLOAD`, `FEEDBACK_VIDEO`). New enums: `media_purpose`, `website_section_type`,
`website_version_status`.

Integration tests that write (`apps/api/test/*.int.test.ts`) run each test inside one transaction on
the existing database that is **always rolled back** — nothing is committed.

### Sprint 6 schema (`0005_training_engine.sql`, additive)

`exercises` (shared library, media → `media_assets` RESTRICT), `training_programs` (per client, status
DRAFT/ACTIVE/COMPLETED/ARCHIVED, partial unique index = one ACTIVE per client) → `training_weeks` →
`training_days` → `training_sections` (WARMUP/MAIN/FINISHER) → `training_exercise_assignments`
(structured prescription with DB checks). `auth_events.entity_id` for training audit events.
Details: docs/TRAINING-ARCHITECTURE.md.

### Sprint 7 schema (`0006_workout_sessions.sql`, additive)

`workout_sessions` (one IN_PROGRESS per client, partial unique index; status ⇔ timestamps check)
→ `workout_session_exercises` (snapshot of each assignment + execution state; links to the live
plan are `SET NULL`) → `workout_exercise_sets` (SETS_REPS only). 3 enums. Details:
docs/WORKOUT-ARCHITECTURE.md.

### Future data model (not created yet — compatibility notes)

- **Exercise feedback** references **both** the exercise assignment **and** the specific workout
  session (not just the generic exercise); optional feedback video = a `PRIVATE` `media_assets` row.
- **Nutrition** stays separate: client-specific PDFs (`nutrition_documents` → `PRIVATE` media), not
  mixed into the training model.
- **Coach messages** ("Nachricht von Philipp"): per-client, with nullable `expires_at`
  (1/3/7 days, chosen date, or manual removal via `withdrawn_at`). The client API filters by expiry and
  **never returns the expiry date** to clients.
- Clients are `users` with role `CLIENT`; client-profile data goes into a separate `clients` table.

## 6. Object storage

- Interface: `apps/api/src/infra/storage/object-storage.ts` — `put / get / exists / delete`, keyed by
  `storageKey` + `visibility`. Drivers implement it; domain code never sees provider SDKs.
- Keys are generated server-side: `<visibility>/<purpose>/<yyyy>/<mm>/<uuid>.<ext>`
  (`purpose`: `website`, `training-video`, `nutrition`, `client-upload`, `feedback-video`). The user's
  original file name is stored only in `media_assets.file_name`. Keys are validated against traversal.
- **Development:** `STORAGE_DRIVER=local` writes to `STORAGE_LOCAL_DIR` (`.storage/`, git-ignored),
  split into `public/` and `private/` like production. The local driver is rejected when
  `NODE_ENV=production`.
- **Production (to plug in):** `STORAGE_DRIVER=s3` with any S3-compatible provider (Cloudflare R2,
  AWS S3, Hetzner Object Storage, …). Env validation already requires `S3_ENDPOINT`, `S3_REGION`,
  `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional
  `PUBLIC_MEDIA_BASE_URL` (CDN in front of the public bucket). Steps:
  1. implement `createS3Storage(env)` with `@aws-sdk/client-s3` in `infra/storage/s3-storage.ts`;
  2. add presigned **upload** URLs (browser/app uploads directly to the bucket, API records metadata
     after verifying size/MIME) and presigned **read** URLs (5–15 min) for `PRIVATE` objects;
  3. serve `PUBLIC` objects via `PUBLIC_MEDIA_BASE_URL`.
- Upload safety (implemented for website media in Sprint 2): browser-ready allow-list
  (`WEBSITE_MEDIA_MIME_TYPES`, no SVG/HTML/QuickTime), magic-byte sniffing must match the declared
  type, size limits per kind, HEVC rejected, server-generated keys, sanitised display names. The dev
  delivery route sends `nosniff` and `CSP: sandbox`. Documents (later) get
  `Content-Disposition: attachment`; uploads are never executed.
- Status: local driver complete for development (upload, delivery with byte ranges, delete);
  the S3 driver is still deferred.

## 7. Web

- Route groups: `app/(site)` = public website, `app/admin` = coach panel. `error.tsx` and
  `not-found.tsx` at the root; no root `loading.tsx` (the public site must stream complete HTML,
  not a spinner — the admin has its own loading states).
- Public homepage (Sprint 3 Stage B): `app/(site)/page.tsx` renders PUBLISHED CMS content through
  the public section registry (`components/site/section-registry.tsx`, one production renderer per
  section type) in API/DB order; `app/(site)/layout.tsx` renders the CMS-driven header (links from
  the CMS footer navigation, CTA from the CTA section, accessible `<dialog>` mobile menu) and footer.
  Data: `lib/public-site.ts` (`unstable_cache`, tag `website:home`, 300 s safety expiry),
  invalidated by `app/api/revalidate` (shared secret) after every committed publish. Details:
  CMS-ARCHITECTURE.md §11.
- Stage C: `/kontakt` (contact form → server action → `POST /v1/public/leads`), SEO metadata from
  the published `seo` settings, `robots.ts`, `sitemap.ts`, JSON-LD (`lib/seo.ts`), consent-gated
  analytics abstraction (`lib/analytics.ts`), per-request nonce CSP in `src/proxy.ts`
  (CMS-ARCHITECTURE.md §12). Client components import contract types with `import type` only
  (enforced by lint) so no schema code reaches the browser.
- Design tokens in `src/styles/globals.css` (`@theme`): anthracite / off-white / electric blue palette,
  semantic colours (`bg`, `surface`, `fg`, `accent` …), fluid type scale, spacing, radius, motion tokens,
  reduced-motion handling. Dark is the default; `data-theme="light"` enables the light variant.
- Server-only data access via `src/lib/api.ts` and `src/lib/admin-api.ts` (typed + Zod-validated).
  The web app never touches the database; `next.config.ts` copies only an allow-list of web keys
  from the root `.env` (never `DATABASE_URL`).
- Admin: `app/admin/(shell)` = navigation shell (Website → Übersicht / Inhalte / Medien /
  Einstellungen, Systemstatus); `app/admin/website/vorschau/[key]` = full-width draft preview;
  `app/admin/api/media` = upload proxy. Mutations are server actions (`app/admin/website-actions.ts`)
  that forward to the API. `/admin` is `noindex` (metadata + `X-Robots-Tag`).
- Training (Sprint 6): `app/admin/(shell)/training/uebungen` (exercise library),
  `kunden/[id]/training` (plans, builder `[programId]`, client preview `[programId]/vorschau`),
  `app/admin/api/training-media` (training media upload proxy), server actions in
  `app/admin/training-actions.ts` (validated with the shared contracts before calling the API).
- Security headers via `next.config.ts` (`nosniff`, `DENY` framing, referrer & permissions policy).

## 8. Security baseline

- Secrets only in git-ignored `.env*`; `.env.example` has names only; env validated at startup with
  messages that name variables but never echo values.
- TLS-verified DB connection; DB errors never reach clients; logger redaction.
- CORS allow-list, secure headers, body-size limit, request IDs.
- Permission-based server-side authorization; client-supplied identities ignored.
- Private media via signed URLs only (when the S3 driver lands); MIME allow-list + content sniffing;
  no real customer data in fixtures.
- CMS: plain structured text only (no HTML), safe-link validation, drafts never served publicly.
- Public site: nonce-based CSP, HSTS (production), COOP; contact endpoint with validation, body
  limit, honeypot, timing check and rate limits; leads never readable publicly, no PII in logs.

## 9. Deployment (to be decided)

Not part of Sprint 0. The API is a plain Node process (`node dist/server.js`), the web app a standard
Next.js build; both deploy independently against the same Neon database. Typical: Vercel (web) +
Fly.io/Railway/Hetzner (API) + R2/S3 (storage). CI should run lint, typecheck, unit tests, build,
`flutter analyze`, `flutter test`; integration tests only where `DATABASE_URL` is provided as a secret.
