# iOS Training — Sprint 8B: Account Deletion ("Konto löschen") — Design Proposal

Status 2026-11-23. **Design + contract + migration proposal only. Nothing implemented in the
app or API, no migration in `packages/db/migrations`, nothing applied anywhere.** Reason: the
irreversible part (what is deleted/anonymised, when, by whom) depends on legal decisions that are
open (open-decisions doc D5). A button without that backend would be a dead button.

## 1. Apple 5.1.1(v) — re-assessment

- The guideline requires in-app account deletion for apps that **support account creation**.
  VITRUV accounts are created by the coach/website; the app has login only.
- Sprint 8A treated this as "strictly not applicable". Re-assessed for 8B: **not a safe
  exemption.** Reviewers regularly ask for an in-app deletion path whenever an app has accounts,
  and GDPR Art. 17 applies anyway. Risk if submitted without: rejection under 5.1.1(v) → one
  review round lost.
- **Recommendation:** ship 1.0 with an in-app *deletion request* (below) — it is allowed by
  Apple to process deletion asynchronously, as long as the user can start it in the app and is
  told what happens and how long it takes.

## 2. Flow (app)

Profil → "Konto löschen" →
1. explanation screen: what happens (access blocked immediately, sessions ended, data deleted
   or anonymised within ⟦period⟧, what is kept for legal reasons ⟦list⟧), coach informed;
2. re-enter password (protects against a borrowed unlocked phone);
3. confirm ("Konto endgültig löschen lassen");
4. result screen: request received, reference date; the app signs out locally.
A second request while one is open is idempotent (same result screen).

## 3. API contract (proposal — not in `packages/contracts` yet)

```
POST /v1/client/me/deletion-request          (CLIENT, training.self.read-level auth)
  body:    { password: string (1..1024), reason?: string (≤ 1000) }
  201:     { requestId: uuid, status: "REQUESTED", requestedAt: iso }
  200:     same shape when an open request already exists (idempotent)
  400 VALIDATION_FAILED · 401 UNAUTHENTICATED (wrong password → generic, rate-limited
  like login) · 429 RATE_LIMITED
  effects (one transaction): insert request (requested_via = session clientType), user status →
  DISABLED, revoke all sessions (reason USER_DISABLED), auth_event ACCOUNT_DELETION_REQUESTED.

GET  /v1/admin/deletion-requests?status=     (ADMIN only — never COACH)
POST /v1/admin/deletion-requests/:id/process { action: "complete" | "reject" | "cancel",
                                               note?: string }   (ADMIN only)
  "complete" runs the APPROVED anonymisation policy (to be specified after D5):
  e-mail, username, display name, profile names/phone → anonymised; password hash + sessions
  removed; training history per policy (delete vs. anonymise); private files deleted.
```

Rules that already exist and are reused: users are never hard-deleted (FK RESTRICT), role from
the server, client scope in SQL, generic login failures, rate limiter.

## 4. Migration proposal 0026

`docs/proposals/0026_account_deletion_requests.sql` — additive only (2 enum values, 1 enum,
1 table, 2 indexes). Validated for syntax and behaviour on the isolated cluster after 0000–0025
(one open request per user enforced by a partial unique index; users can not be deleted while
referenced). Deliberately **not** in the migrations folder or journal. When approved: model it in
`packages/db/src/schema`, `pnpm db:generate`, read the SQL, then the normal runbook.

## 5. Until it exists

The privacy policy draft names a contact path for deletion requests (⟦e-mail⟧); the admin can
already disable/archive a client (existing endpoints) — that is the manual fallback, not the
App Store answer.
