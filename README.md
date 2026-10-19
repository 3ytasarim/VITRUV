# VITRUV

Coaching platform — public website, coach/admin panel, shared API and Flutter app on one
PostgreSQL database.

| Part            | Path                 | Stack                                                    |
| --------------- | -------------------- | -------------------------------------------------------- |
| Website + Admin | `apps/web`           | Next.js 16 (App Router), React 19, Tailwind CSS 4        |
| API             | `apps/api`           | Hono on Node.js, Zod, pino                               |
| Mobile app      | `apps/mobile`        | Flutter / Dart (Android + iOS), Riverpod, go_router, dio |
| Database        | `packages/db`        | Drizzle ORM + node-postgres → existing Neon PostgreSQL   |
| API contracts   | `packages/contracts` | Zod schemas shared by API and web (mirrored in Dart)     |
| Domain basics   | `packages/shared`    | Roles/permissions, media vocabulary, env helpers         |
| Tooling         | `packages/config`    | Shared tsconfig, ESLint, Prettier, Vitest setup          |

Docs: [Architecture](docs/ARCHITECTURE.md) · [CMS](docs/CMS-ARCHITECTURE.md) ·
[Mobile](docs/MOBILE-ARCHITECTURE.md) · [Design system](docs/DESIGN-SYSTEM.md)

## Requirements

- Node.js ≥ 22.12 (developed on 24) and pnpm 10 (`corepack enable`)
- Flutter 3.47+ stable (Dart 3.13) for `apps/mobile`
- Android: Android SDK + JDK 17 (Android Studio) · iOS: macOS + Xcode (build/signing only possible on a Mac)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL (provided by the project owner)
```

`.env` lives in the repository root and is git-ignored. The API and the DB scripts read it;
the web app only needs `API_BASE_URL` / `PUBLIC_SITE_URL` (defaults work locally).

## Development

```bash
pnpm --filter @vitruv/api dev     # API on http://localhost:4000  (GET /health, /health/db)
pnpm --filter @vitruv/web dev     # Web on http://localhost:3000  (/ and /admin)
cd apps/mobile && flutter run     # App; Android emulator reaches the API via 10.0.2.2:4000
```

### Website CMS (development)

```bash
pnpm --filter @vitruv/db migrate             # applies the CMS tables (additive)
pnpm --filter @vitruv/api seed:website       # idempotent: home page, 9 sections, neutral content, dev user
```

The admin requires a real login (Sprint 4). Create the first ADMIN once (the password is prompted,
never passed as an argument), then sign in at `/login`:

```bash
pnpm --filter @vitruv/api auth:bootstrap-admin -- --email=you@example.com
pnpm --filter @vitruv/api auth:set-password -- --email=you@example.com   # operator reset
pnpm --filter @vitruv/api auth:cleanup                                   # remove dead sessions/events
```

Details: [docs/AUTH-ARCHITECTURE.md](docs/AUTH-ARCHITECTURE.md),
[docs/CMS-ARCHITECTURE.md](docs/CMS-ARCHITECTURE.md). `DEV_AUTH` remains only for local API tooling.

Coaches and clients are created in the admin (`/admin/coaches`, `/admin/kunden`); each gets a
one-time activation link (`/aktivieren#t=…`) to set their own password — see
[docs/CLIENT-MANAGEMENT.md](docs/CLIENT-MANAGEMENT.md).

Training (Sprint 6): exercise library at `/admin/training/uebungen`, client plans at
`/admin/kunden/<id>/training` (builder, activation, client preview); the app reads
`GET /v1/client/training/active` — see [docs/TRAINING-ARCHITECTURE.md](docs/TRAINING-ARCHITECTURE.md).

Workouts (Sprint 7): the Flutter app (client login, Heute, Training, live workout with rest timer,
history, profile) records sessions via `/v1/client/workouts`; coaches see read-only summaries in
the client Training tab — see [docs/WORKOUT-ARCHITECTURE.md](docs/WORKOUT-ARCHITECTURE.md) and
[docs/MOBILE-ARCHITECTURE.md](docs/MOBILE-ARCHITECTURE.md).

Mobile against another API: `flutter run --dart-define=API_BASE_URL=https://… --dart-define=APP_ENV=staging`.

## Quality checks

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test                      # unit tests (no network)
pnpm -r test:integration          # read-only checks against the configured database
pnpm --filter @vitruv/design-tokens check   # generated tokens up to date
pnpm -r build                     # Next.js production build + API bundle
cd apps/mobile && flutter analyze && flutter test
```

## Design tokens

All colours, type, spacing, shape, effects and motion live in `packages/design-tokens/src/tokens.ts`
and are generated for web (`apps/web/src/styles/tokens.generated.css`) and Flutter
(`apps/mobile/lib/core/theme/vitruv_tokens.g.dart`). Never edit the generated files.

```bash
pnpm --filter @vitruv/design-tokens generate   # after changing tokens.ts
pnpm --filter @vitruv/design-tokens check      # fails if generated files are stale
```

See [docs/DESIGN-SYSTEM.md §11](docs/DESIGN-SYSTEM.md#11-implemented-token-architecture-sprint-1--stage-a).

## Database (existing Neon PostgreSQL)

The database already exists and is **reused** — never create another one, never reset it.

```bash
pnpm --filter @vitruv/db inspect    # read-only: schemas, tables, row counts, migration history
pnpm --filter @vitruv/db generate   # schema → new SQL migration in packages/db/migrations
#   → read the generated SQL before applying it
pnpm --filter @vitruv/db migrate    # apply pending migrations (destructive SQL is refused)
pnpm --filter @vitruv/db check      # migration folder consistency
```

Migrations run against the direct Neon endpoint (derived in memory from `DATABASE_URL`, or
`DATABASE_URL_DIRECT` if set) because multi-statement DDL is unreliable through the pooler.
History is stored in `drizzle.__drizzle_migrations`. `drizzle-kit push` is deliberately not used.

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable                                     | Used by    | Notes                                                                                      |
| -------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                               | api, db    | Required. Existing Neon DB. Never commit/print it.                                         |
| `DATABASE_URL_DIRECT`                        | db scripts | Optional direct endpoint for migrations                                                    |
| `API_PORT`, `API_HOST`, `LOG_LEVEL`          | api        | Defaults 4000 / 0.0.0.0 / info                                                             |
| `CORS_ORIGINS`                               | api        | Comma-separated browser origins (allow-list, no credentials)                               |
| `TRUSTED_PROXY_IPS`                          | api        | Peers whose X-Forwarded-For is trusted for login rate limits (default loopback)            |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`        | api        | `local` (dev only) or `s3`                                                                 |
| `S3_*`, `PUBLIC_MEDIA_BASE_URL`              | api        | Required when `STORAGE_DRIVER=s3`                                                          |
| `API_PUBLIC_URL`                             | api        | Base for local media URLs (default http://localhost:4000)                                  |
| `MEDIA_MAX_IMAGE/VIDEO_BYTES`                | api        | Website upload limits (defaults 20 MB / 100 MB)                                            |
| `DEV_AUTH`, `DEV_AUTH_TOKEN/EMAIL`           | api        | Development auth adapter for local API tooling; refused in production                      |
| `BOOTSTRAP_ADMIN_PASSWORD`                   | api script | Optional non-interactive bootstrap password — unset after use, never commit                |
| `TRUSTED_CLIENT_IP_HEADER`                   | web        | Header your hosting proxy sets to the browser IP (login rate limits); empty without one    |
| `API_BASE_URL`                               | web        | Server-side API base URL                                                                   |
| `PUBLIC_SITE_URL`, `SITE_INDEXING`           | web        | Canonical public base URL (https in production); `disabled` = noindex staging              |
| `REVALIDATE_SECRET`, `WEB_REVALIDATE_URL`    | api, web   | Publish → web cache revalidation (server-to-server)                                        |
| `CMS_MEDIA_ORIGINS`, `CMS_MEDIA_ALLOW_LOCAL` | web        | Media hosts for next/image + CSP; local optimisation (development only)                    |
| `DESIGN_PREVIEW`                             | web        | `enabled` exposes the internal `/design` preview in production (always on in dev; noindex) |
| `API_BASE_URL`, `APP_ENV` (dart-define)      | mobile     | Build-time, no secrets                                                                     |

## Storage

Files (images, videos, PDFs, client uploads) live in object storage; PostgreSQL holds metadata in
`media_assets`. Development uses the local disk driver (`.storage/`, git-ignored). Production plugs
in an S3-compatible provider — see [Architecture → Object storage](docs/ARCHITECTURE.md#object-storage).

## Windows note

If your user profile path contains `&` (e.g. `C:\Users\Name & Co`), root scripts that invoke
`pnpm` a second time can fail in `cmd`. Use `pnpm -r <script>` or `pnpm --filter <pkg> <script>`.
