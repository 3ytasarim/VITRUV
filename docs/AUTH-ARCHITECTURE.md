# VITRUV — Authentication & Session Architecture

Status: Sprint 4 (2026-10-16). One authentication system for the web Admin/Coach panel and the
future Flutter app, owned by the API (`apps/api/src/modules/auth`). Authorization stays
permission-based and server-side (`requirePermission`), with the role always loaded from the
database.

## 1. Credential model

| Piece         | What                                                                | Stored as                                    |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Password      | user-chosen, policy = length only (12–256 chars, spaces/Unicode ok) | Argon2id PHC string in `users.password_hash` |
| Access token  | 256-bit CSPRNG, base64url (43 chars), **15 min**                    | SHA-256 hex in `auth_sessions`               |
| Refresh token | 256-bit CSPRNG, base64url, rotated on every use                     | SHA-256 hex in `auth_sessions`               |
| Session       | one row per login: user, client type, expiries, revocation          | `auth_sessions`                              |

- Tokens are **opaque** (no JWT): every API request looks the access token up by hash, joined with
  the user. Revocation, role changes and account disabling therefore take effect immediately; no
  signing key exists that could leak.
- Raw tokens exist only in the HTTP response to the client and in the client's storage (web:
  HttpOnly cookies; mobile: secure storage). Neither tokens nor passwords are ever logged
  (pino redaction + no logging of bodies; tests assert it).
- Fast SHA-256 is correct for tokens (256 random bits — nothing to brute-force); slow Argon2id is
  used only for passwords.

### Passwords (Argon2id)

`@node-rs/argon2` (Rust `argon2` crate, standard PHC strings). Parameters = OWASP Password Storage
Cheat Sheet minimum: **m = 19 MiB (19456 KiB), t = 2, p = 1**, 16-byte random salt, 32-byte tag.
Hashes with other parameters are re-hashed on the next successful login (`needsRehash`).
Passwords are never trimmed, normalised or truncated; the DB check
`users_password_hash_format` only accepts `$argon2id$…`.

### Session lifetimes (`modules/auth/tokens.ts`)

| Client   | Access | Refresh idle (sliding) | Absolute session |
| -------- | ------ | ---------------------- | ---------------- |
| `WEB`    | 15 min | 12 h                   | 7 days           |
| `MOBILE` | 15 min | 30 days                | 90 days          |

No credential is valid indefinitely; every refresh renews the idle window but never beyond the
absolute expiry.

### Rotation & reuse detection

`POST /v1/auth/refresh` with the refresh token:

1. found as the **current** refresh hash, session not revoked/expired, user ACTIVE → both tokens
   are replaced (compare-and-swap on the presented hash, so of two parallel refreshes only one
   wins); the old refresh hash moves to `previous_refresh_token_hash`.
2. found as the **previous** hash:
   - within 30 s of the rotation → benign race (two tabs/requests) → 401, session kept;
   - later → the token was copied → **the whole session is revoked** (`REFRESH_REUSE`) and an
     audit event `REFRESH_REUSE_DETECTED` is written.
3. anything else → 401.

A disabled user's refresh revokes the session (`USER_DISABLED`).

## 2. API endpoints (`/v1/auth`, contracts: `packages/contracts/src/auth.ts`)

| Endpoint           | Auth            | Body                                          | Response                     |
| ------------------ | --------------- | --------------------------------------------- | ---------------------------- |
| `POST /login`      | —               | `{ email, password, clientType: WEB/MOBILE }` | `{ tokens, user }`           |
| `POST /refresh`    | —               | `{ refreshToken }`                            | `{ tokens, user }`           |
| `POST /logout`     | Bearer optional | `{ refreshToken? }`                           | 204 (idempotent)             |
| `POST /logout-all` | Bearer          | `{}`                                          | 204                          |
| `GET /me`          | Bearer          | —                                             | `{ user }`                   |
| `POST /password`   | Bearer          | `{ currentPassword, newPassword }`            | `{ tokens, user }` (rotated) |

- `user` = `{ id, email, displayName, role, status, permissions[] }` — never hashes or session
  internals. `permissions` is derived server-side and is for UI shaping only.
- Errors use the standard envelope: **401** `UNAUTHENTICATED` (one generic message for every
  login failure: wrong password, unknown e-mail, disabled account, no password set), **403**
  `FORBIDDEN`, **429** `RATE_LIMITED`, **400** `VALIDATION_FAILED`. Database errors never leak.
- On protected endpoints authentication is checked **before** body validation.
- Every `/v1/auth/*` and `/v1/admin/*` response carries `Cache-Control: no-store`.
- Bodies are limited to 8 KB (bounds Argon2 work).

### Login behaviour

- Exactly one Argon2 verification per attempt — unknown accounts verify against a real dummy hash,
  so timing does not reveal whether an e-mail exists.
- Success: session row, `users.last_login_at`, audit `LOGIN_SUCCEEDED`, lazy cleanup of this user's
  dead sessions — all in one transaction.

### Rate limiting (in-memory, per API process)

| Limit                              | Counts        | Window |
| ---------------------------------- | ------------- | ------ |
| 30 per client IP                   | every attempt | 15 min |
| 5 per (client IP + e-mail)         | failures only | 15 min |
| 20 per e-mail (all IPs)            | failures only | 60 min |
| 5 wrong current passwords per user | failures only | 15 min |

Lockouts are always **temporary** (window expiry) — never permanent, so an attacker cannot lock
an account out for good. The per-e-mail brake needs 20 failures within an hour from many IPs.
E-mails are rate-limit keys only as SHA-256. A multi-instance deployment needs a shared store
(Redis) — launch blocker.

**Client IP:** the API honours `X-Forwarded-For` only from `TRUSTED_PROXY_IPS` (default loopback:
the web server on the same host). The web server forwards the browser IP only from a header that
its hosting proxy guarantees (`TRUSTED_CLIENT_IP_HEADER`, e.g. `x-real-ip`, `cf-connecting-ip`);
without that setting it forwards nothing — a client-supplied `X-Forwarded-For` never picks its own
bucket. (Then all web logins share the web server's per-IP bucket — configure the header in
production.)

## 3. Browser flow (Admin/Coach)

```
Browser ──HttpOnly cookies──▶ Next.js server (proxy, server actions, RSC) ──Bearer──▶ API ──▶ DB
```

- The **web server** holds the token pair in two cookies: `__Host-vitruv_at` (access) and
  `__Host-vitruv_rt` (refresh) — **HttpOnly, Secure, SameSite=Lax, Path=/**, no Domain, expiry =
  token expiry (access cookie 30 s earlier). Without https in development: same flags minus
  `Secure`, names without the `__Host-` prefix. Tokens are never visible to JavaScript and never
  stored in localStorage/sessionStorage. The API itself never reads cookies.
- **Login** (`/login`, server action) → API login (`clientType: WEB`) → cookies → redirect to a
  validated `next` path (`/admin…` only — open-redirect safe). CLIENT accounts are refused for the
  panel and their just-created session is revoked immediately.
- **Proxy** (`src/proxy.ts`) for `/admin/*`: no cookies → 303 to `/login?next=…`; access cookie
  missing but refresh cookie present → rotate via API, set new cookies on the response **and** on
  the in-flight request; refresh fails → cookies cleared, redirect to login. The proxy only routes;
  token validity is decided by the API on each call.
- **Admin guard** (`app/admin/layout.tsx`, also covers `/admin/website/vorschau/*`): `/v1/auth/me`
  with the access token; no user → `/login`; no `admin.access` permission (CLIENT) → "Kein Zugriff"
  page with logout only. Every data call is authorised again by the API with real permissions.
- **Logout** (shell button): API `POST /logout` with access + refresh token → session revoked
  server-side → cookies deleted. **Überall abmelden** (Konto page): `POST /logout-all`.
- **Password change** (`/admin/konto`): current + new (+ confirmation). Policy: **this session
  continues with a freshly rotated token pair; every other session of the account is revoked.**
- `/admin*` and `/login` responses: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`;
  `/login` is disallowed in robots.txt. Public pages are untouched by auth.

### CSRF / origin

The API is CSRF-immune by construction (Bearer header only; browsers never attach it on their own;
CORS is an allow-list without credentials, never `*`). For the cookie-authenticated web server:

1. `SameSite=Lax` — cookies are not sent on cross-site POST/fetch/iframe requests.
2. The proxy rejects (403) every non-GET/HEAD/OPTIONS request to `/admin/*` and `/login` whose
   `Origin` is missing or differs from the configured `PUBLIC_SITE_URL` origin (configured value,
   not request headers).
3. Next.js server actions additionally compare `Origin` with `Host`.
4. The media upload route handler checks `Origin` itself.
5. No state changes on GET.

Consequence: the admin must be served on the `PUBLIC_SITE_URL` origin (redirect other hostnames
such as `www`/apex at the hosting layer).

## 4. Mobile flow (Flutter — implemented in Sprint 7)

See [MOBILE-ARCHITECTURE.md → Authentication](MOBILE-ARCHITECTURE.md#authentication). Same
endpoints and contracts, `clientType: "MOBILE"`, tokens in platform secure storage
(`flutter_secure_storage`: Android Keystore-backed encryption, iOS Keychain `first_unlock_this_device`),
single-flight refresh in a dio interceptor, logout = server revoke (best effort) + local clear. The
app accepts CLIENT accounts only. Native apps send no `Origin`; CORS does not apply to them.

## 5. Permissions

Roles stay `ADMIN`, `COACH`, `CLIENT` (`packages/shared/src/roles.ts`). New permission
`admin.access` (ADMIN, COACH) gates the web panel. The CMS permissions
(`website.content.read/write/publish`, `website.media.read/write/delete`) belong to ADMIN only;
COACH has client-management permissions instead (CLIENT-MANAGEMENT.md §3). The principal is built only by the API from the verified session + users
row; role/user hints in headers, query or body are ignored (tested).

## 6. Bootstrap, operator tasks, cleanup

```bash
# First real ADMIN — one-time; refuses if any ADMIN with a password exists or the e-mail is taken.
pnpm --filter @vitruv/api auth:bootstrap-admin -- --email=owner@example.com [--name="Vor Nachname"]
# Password: hidden prompt (twice). Non-interactive: BOOTSTRAP_ADMIN_PASSWORD (unset afterwards).

# Operator password reset (stand-in for e-mail reset): sets a new password, revokes all sessions.
pnpm --filter @vitruv/api auth:set-password -- --email=user@example.com   # AUTH_NEW_PASSWORD optional

# Remove dead data: sessions past absolute expiry or revoked > 30 days; audit events > 180 days.
pnpm --filter @vitruv/api auth:cleanup      # safe any time; schedule daily via the host's cron
```

The scripts need `DATABASE_URL` and are not reachable over HTTP. Passwords are never accepted as
command-line arguments (shell history) and never printed. The fictional development user
(`dev-admin@vitruv.invalid`) has **no password** and can never log in through `/v1/auth/login`;
bootstrap never upgrades an existing row.

## 6a. Account activation (Sprint 5)

Accounts created by Admin/Coach (clients, coaches) start **without a password**. A one-time
activation link (`/aktivieren#t=<token>`) lets the person choose their own password:
256-bit CSPRNG token, only its SHA-256 stored (`account_activation_tokens`), 72 h expiry, single
use (compare-and-swap consumption), at most one live link per user (new link revokes the old;
disabling revokes all). Failures are one generic `ACTIVATION_INVALID`. The token sits in the URL
fragment, so it never reaches server logs; the page strips it at once. Endpoints:
`POST /v1/auth/activation/check`, `POST /v1/auth/activate` (public, 20 / 15 min per IP).
Activation never changes the role. Details: [CLIENT-MANAGEMENT.md](CLIENT-MANAGEMENT.md) §5.

## 7. Audit trail

`auth_events`: `LOGIN_SUCCEEDED`, `LOGIN_FAILED` (user id only if the account exists), `LOGOUT`,
`LOGOUT_ALL`, `PASSWORD_CHANGED`, `REFRESH_REUSE_DETECTED`, and since Sprint 5 `ACCOUNT_CREATED`,
`ACTIVATION_ISSUED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_DISABLED`, `ACCOUNT_ENABLED`, `ASSIGNMENT_CHANGED`,
and since Sprint 6 `EXERCISE_CREATED/DEACTIVATED/REACTIVATED`, `PROGRAM_CREATED/ACTIVATED/COMPLETED/ARCHIVED`
(with `entity_id` = exercise/program id) —
with user id, actor id (management actions), session id, client type, timestamp. Deliberately **no** IP, user agent, submitted e-mail, password or token. Retention 180
days (cleanup).

## 8. Development auth adapter (`DEV_AUTH`)

Remains **only in the API** (`createDevPrincipalResolver`) for local scripted API tooling (E2E
fixtures that call `/v1/admin/*` directly). It is chained **after** the session resolver and:

- env validation refuses `DEV_AUTH=enabled` with `NODE_ENV=production`;
- `createAuthResolver` (`src/auth/resolver.ts`) independently never wires it in production (tested);
- it yields no session, so session-bound actions (password change) are refused for it.

The web Admin no longer uses it (`API_DEV_AUTH_TOKEN` removed from the web app).

## 9. Data model (migration `0003_auth_sessions.sql`, additive)

- `users` + `password_hash`, `password_changed_at`, `last_login_at`; checks
  `users_email_normalized` (`email = lower(btrim(email))`) and `users_password_hash_format`.
  Uniqueness: existing `users_email_lower_unique` on `lower(email)`.
- `auth_sessions` (FK user ON DELETE CASCADE; unique token hashes; SHA-256 hex format checks;
  revocation consistency check; indexes on user, expires_at).
- `auth_events` (FK user ON DELETE SET NULL; indexes on created_at, user).
- Enums `auth_client_type`, `session_revoke_reason`, `auth_event_type`.

E-mail normalisation policy (`normalizeEmail`): trim + lowercase the whole address; no
provider-specific alias rules.

## 10. Deferred / launch blockers

- **E-mail delivery of activation links / password reset** — deferred: no mail provider. The
  activation token system (§6a) is ready to be sent by e-mail. Until then: links are handed over
  personally; password reset via the operator CLI. A future
  reset must store only token hashes, expire within ~30 min, be single-use and revoke all sessions.
- Shared rate-limit store (Redis) for more than one API instance.
- `TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_IPS` must be set for the real hosting topology.
- Optional later: list/revoke individual sessions in the UI, MFA for ADMIN, user management UI.
