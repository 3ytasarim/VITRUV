# VITRUV — Coach & Client Management

Status: Sprint 5 (2026-10-16). The first coaching business layer: coach and client accounts,
coach ↔ client assignment, client profile and lifecycle, account provisioning via one-time
activation links. Code: `apps/api/src/modules/management`, contracts
`packages/contracts/src/management.ts`, admin UI `apps/web/src/app/admin/(shell)/{kunden,coaches}`,
activation page `apps/web/src/app/aktivieren`.

Scope is deliberately simple: several coaches are supported cleanly, but there is no team
collaboration, marketplace or multi-tenant model. One client has at most one active (primary) coach.

## 1. Data model (migration `0004_coaching_accounts.sql`, additive)

| Object                      | Purpose                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `client_profiles`           | 1:1 with `users` (unique `user_id`): first/last name, phone, `coaching_status`, `internal_notes`, `created_by_user_id`   |
| `coach_profiles`            | 1:1 with `users`: `display_name`, phone (internal — the public About text stays in the CMS)                              |
| `coach_client_assignments`  | coach ↔ client with history: `assigned_at`, `ended_at` (NULL = active), `assigned_by_user_id`                            |
| `account_activation_tokens` | one-time activation links: SHA-256 `token_hash`, `expires_at`, `consumed_at`, `revoked_at`, `created_by_user_id`         |
| enum `coaching_status`      | `ACTIVE`, `PAUSED`, `COMPLETED`                                                                                          |
| `auth_event_type` + 6       | `ACCOUNT_CREATED`, `ACTIVATION_ISSUED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_DISABLED`, `ACCOUNT_ENABLED`, `ASSIGNMENT_CHANGED` |
| `auth_events.actor_user_id` | who performed a management action                                                                                        |

Constraints: partial unique index `coach_client_assignments_one_active (client_user_id) WHERE ended_at
IS NULL` (one active coach per client), `account_activation_tokens_live_unique (user_id) WHERE
consumed_at IS NULL AND revoked_at IS NULL` (one live link per user), SHA-256 hex format check,
length checks on names/phone/notes, `ended_at >= assigned_at`, coach ≠ client. Profiles and
assignments reference `users` with **ON DELETE RESTRICT** — users are never hard-deleted.

**No medical fields.** There are no diagnosis, condition, medication or health-history columns;
forms ask people not to enter health data. VITRUV is a coaching product, not a medical record.
`date_of_birth` was deliberately not added (not needed yet).

## 2. Three independent states

| State                | Where                        | Values                            | Meaning                                |
| -------------------- | ---------------------------- | --------------------------------- | -------------------------------------- |
| Account status       | `users.status`               | `ACTIVE`, `DISABLED`              | may the person sign in at all (auth)   |
| Activation (derived) | `password_hash` + live token | `ACTIVATED`, `PENDING`, `EXPIRED` | has the person set their own password  |
| Coaching status      | `client_profiles`            | `ACTIVE`, `PAUSED`, `COMPLETED`   | where the coaching relationship stands |

They never overload each other: pausing coaching does not touch sign-in; disabling an account does
not change the coaching status. "Invited" is not a coaching state — it is `activation = PENDING`.

## 3. Permissions (`packages/shared/src/roles.ts`)

| Permission                                      | ADMIN | COACH                       | CLIENT |
| ----------------------------------------------- | ----- | --------------------------- | ------ |
| `clients.read`                                  | ✓ all | ✓ **own assigned only**     | –      |
| `clients.create`                                | ✓     | ✓ (always assigned to self) | –      |
| `clients.update`                                | ✓     | ✓ own                       | –      |
| `clients.assign`                                | ✓     | –                           | –      |
| `clients.account.manage`                        | ✓     | ✓ own                       | –      |
| `coaches.read/create/update/account.manage`     | ✓     | –                           | –      |
| `self:read` (`/v1/client/me`)                   | ✓     | ✓                           | ✓      |
| `training.exercises.read/write`                 | ✓     | ✓ (shared library)          | –      |
| `training.media.delete`                         | ✓     | –                           | –      |
| `training.programs.read/create/update/activate` | ✓ all | ✓ **own assigned only**     | –      |
| `training.self.read` (`/v1/client/training`)    | –     | –                           | ✓      |
| `training.sessions.read` (workout summaries)    | ✓ all | ✓ **own assigned only**     | –      |
| `training.self.workout` (`/v1/client/workouts`) | –     | –                           | ✓      |

(The Sprint 0 placeholders `users:manage` / `clients:manage` were replaced.) COACH has **no**
`website.*` permission (Sprint 5 follow-up): the Website CMS is ADMIN-only. The COACH role is about
their assigned clients (training since Sprint 6; later nutrition, check-ins, feedback, messages) and
their own account. **Permanent rule:** Website CMS permissions are never given back to COACH.

## 4. Object-level authorization (mandatory)

A permission alone never grants access to a client. Every client operation goes through
`loadScopedClient` / `clientScope` in `management.service.ts`:

- ADMIN: `users.role = 'CLIENT'`
- everyone else: `users.role = 'CLIENT' AND active_assignment.coach_user_id = <actor>`

The scope is part of the SQL `WHERE` of list, detail, update, account status and activation
regeneration. A client outside the scope answers **404** — identical to a non-existent id, so ids
can not be probed. The coach list filter can not widen a coach's scope. A COACH creating a client
is always assigned (server-side; a `coachId` in the body is ignored). Reassigning takes effect
immediately (the previous coach gets 404 on the next request). Tested in
`apps/api/test/management.int.test.ts` (direct id guessing on GET/PATCH/account/activation) and
in the Chrome E2E.

Roles are never taken from requests: create endpoints set `CLIENT`/`COACH` server-side (a `role`
field is stripped by the contract), update bodies are `strict` (unknown keys → 400), activation
never touches the role. Nobody can change their own account status.

## 5. Provisioning & activation

```
Admin/Coach creates account (no password)        POST /v1/admin/clients | /v1/admin/coaches
  → server issues a 256-bit token, stores SHA-256 only, expiry 72 h
  → raw link returned ONCE: https://<site>/aktivieren#t=<token>
Admin/Coach copies the link and sends it personally (no e-mail provider yet)
Person opens the link → page reads the fragment, removes it from the address bar
  → POST /v1/auth/activation/check  (valid? — reveals only the expiry)
  → chooses password (shared policy: 12–256 chars) → POST /v1/auth/activate
  → password_hash set, token consumed (compare-and-swap), event ACCOUNT_ACTIVATED
  → Coach → /login ; Client → "sign in in the VITRUV app"
```

- **Token in the URL fragment** (`#t=`): fragments are never sent to servers, proxies or access
  logs. The page strips it immediately (`history.replaceState`) and keeps it only in memory.
- **One-time display:** the admin UI shows the link in a panel (copy button with announced status)
  right after creation/regeneration; it is never stored in browser storage, URLs, analytics or
  logs, and no later API response contains it. Leaving the page discards it.
- **Generic failures:** unknown, expired, used, revoked, disabled or already activated → the same
  `ACTIVATION_INVALID` (API) / "link invalid or expired" (UI). Rate-limited per IP (20 / 15 min).
- **Regeneration** (`POST …/:id/activation`, `clients.account.manage` / `coaches.account.manage`,
  object-scoped): revokes every unused link of that user, issues a new one. Refused (409) for
  activated or disabled accounts.
- **E-mail later:** a future mail provider calls the same `issueActivation` and sends the link
  instead of displaying it — no new token system needed. The app can later deep-link
  `https://<site>/aktivieren#t=…` (App Links / Universal Links) and post to the same endpoints.

## 6. Disable / re-enable / delete policy

- Disable (`PUT …/:id/account {status:"DISABLED"}`, confirmed in the UI): `users.status = DISABLED`,
  **all sessions revoked immediately** (`USER_DISABLED`), all unused activation links revoked. The
  existing session resolver rejects disabled users on every request and refresh.
- Re-enable: status `ACTIVE` only — revoked sessions stay revoked; the person signs in again (or
  gets a new activation link if never activated).
- **No hard delete** in Sprint 5. Use disable + coaching `PAUSED`/`COMPLETED`. GDPR erasure /
  anonymisation will be a separate, deliberate workflow (history must be preserved or anonymised
  consistently).

## 7. API (`/v1`)

| Route                                                                | Permission                 | Notes                                                           |
| -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `GET /admin/clients?q&coachingStatus&activation&coach&page&pageSize` | `clients.read`             | scoped; offset pagination, pageSize ≤ 50, total                 |
| `POST /admin/clients`                                                | `clients.create`           | → `{ client, activation }` (link once)                          |
| `GET /admin/clients/:id`                                             | `clients.read`             | detail incl. internal notes + coach history                     |
| `PATCH /admin/clients/:id`                                           | `clients.update`           | names, phone, coaching status, internal notes                   |
| `PUT /admin/clients/:id/assignment`                                  | `clients.assign`           | `{ coachId                                                      | null }`, ends + starts assignment |
| `PUT /admin/clients/:id/account`                                     | `clients.account.manage`   | `{ status }`                                                    |
| `POST /admin/clients/:id/activation`                                 | `clients.account.manage`   | new link (old ones revoked)                                     |
| `GET /admin/clients/coach-options`                                   | `clients.assign`           | coach select options                                            |
| `GET                                                                 | POST /admin/coaches`, `GET | PATCH /admin/coaches/:id`, `PUT …/account`, `POST …/activation` | `coaches.*`                       | ADMIN only |
| `POST /auth/activation/check`, `POST /auth/activate`                 | public                     | rate-limited, generic failures                                  |
| `GET /client/me`                                                     | `self:read` + CLIENT row   | the client's own safe profile (Flutter)                         |

Pagination: **offset** (`page`, `pageSize` ≤ 50, `total`) — simple and adequate at current scale;
switch to keyset/cursor if lists grow into the tens of thousands. Search: `ILIKE` on first name,
last name, full name and e-mail with escaped wildcards. All responses `no-store`.

**DTOs** are audience-specific: list items (no notes), admin detail (with notes + history), coach DTO,
and `ClientSelfProfile` (id, names, e-mail, coaching status, coach display name — no notes, phone,
account or assignment internals). None contains hashes or tokens.

**Internal notes:** plain text (control characters rejected, line breaks allowed), ≤ 4000 chars,
Coach/Admin only, never in list items or client-facing DTOs, never logged.

**Audit:** `ACCOUNT_CREATED`, `ACTIVATION_ISSUED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_DISABLED`,
`ACCOUNT_ENABLED`, `ASSIGNMENT_CHANGED` with `user_id` + `actor_user_id` only — no tokens, notes or
field values.

## 8. Admin UI

- Navigation adapts to permissions (no links that would 404/403): ADMIN → Website, Kund:innen,
  Coaches, System, Konto; COACH → Kund:innen, System, Konto (no Website). Page guards
  (`requirePagePermission`) answer 404 for areas the user may not use.
- **Kund:innen** list: search + coaching/activation filters (+ coach filter for ADMIN) as a GET
  search form, responsive cards (wrap instead of fixed columns), status always spelled out,
  explicit empty states (no clients / no assigned clients / no matches), pagination.
- **Kund:in anlegen**: names, e-mail, optional phone, coaching status, coach (ADMIN only) → one-time
  activation link panel.
- **Workspace** `/admin/kunden/[id]`: tabs Übersicht · Profil · Konto · Training (Sprint 6, with
  `training.programs.read`), plus disabled Ernährung · Check-ins · Feedback · Nachrichten (announced
  as "folgt später"). Overview shows
  identity, coach, states, dates and coach history — no invented progress metrics.
- **Profil**: edit names, phone, coaching status, internal notes (no confirmation for text edits);
  ADMIN: coach assignment with confirmation dialog.
- **Konto**: activation state, new link (one-time panel), disable/re-enable with confirmation.
- **Coaches**: list (account state, active client count), create, detail (profile, account, link
  to their clients; warning when a disabled coach still has clients).
- Confirmation dialogs: native modal `<dialog>`, labelled, focus starts on "Abbrechen", Escape
  cancels.

## 9. Attachment points

**Training (Sprint 6, built):** programs reference the client by `users.id` and every program,
week, day, section and assignment id is scoped through `clientAccessible()` (same SQL rule as
`loadScopedClient`); see [TRAINING-ARCHITECTURE.md](TRAINING-ARCHITECTURE.md). Reassigning a
client to another coach moves access to their plans with the assignment — nothing is copied.

**Workouts (Sprint 7, built):** sessions belong to the client (`client_user_id`); clients reach
only their own (self context), coaches read summaries only through `clientAccessible()`
([WORKOUT-ARCHITECTURE.md](WORKOUT-ARCHITECTURE.md)).

Later sprints: nutrition documents, check-ins, feedback and coach messages will
reference the client by `users.id` (the same id used here) and reuse `loadScopedClient`-style
scoping: a coach reaches a client's data only through an active assignment. The workspace tabs
already reserve their places. Flutter reads `/v1/client/me` and later client-scoped endpoints
under `/v1/client/*`.
