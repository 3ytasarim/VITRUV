-- PROPOSAL ONLY (Sprint 8B) — NOT a migration.
-- Deliberately outside packages/db/migrations and not in the Drizzle journal: no migrator picks
-- it up. It becomes 0026 only after the owner/legal decisions in
-- docs/ios-training-sprint8b-open-decisions.md (retention, anonymisation, who processes) and is
-- then regenerated via the normal workflow (schema → pnpm db:generate → read SQL).
-- Validated for syntax on the ISOLATED cluster only (after 0000–0025), never on Neon.
--
-- Purely additive: one enum value, one enum, one table, two indexes. Nothing is deleted or
-- anonymised by this migration; the request is a record that an admin processes.

ALTER TYPE "public"."auth_event_type" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION_REQUESTED';
--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION_CANCELLED';
--> statement-breakpoint
CREATE TYPE "public"."account_deletion_status" AS ENUM (
  'REQUESTED',   -- created by the user (app or web), session(s) revoked, account DISABLED
  'IN_REVIEW',   -- an admin is processing it (retention check)
  'COMPLETED',   -- personal data deleted/anonymised according to the approved policy
  'CANCELLED',   -- withdrawn by the user before processing (only via support/admin)
  'REJECTED'     -- not executable (e.g. legal hold) — the user is informed
);
--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- RESTRICT: users are never hard-deleted (project rule); anonymisation keeps the row
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" "account_deletion_status" DEFAULT 'REQUESTED' NOT NULL,
  "requested_via" "auth_client_type",
  -- optional free text from the user, bounded; never shown to coaches
  "reason" text CHECK ("reason" IS NULL OR char_length("reason") <= 1000),
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "handled_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "handled_at" timestamp with time zone,
  -- what was done (e.g. "anonymised per policy v1"), no personal data
  "resolution_note" text CHECK ("resolution_note" IS NULL OR char_length("resolution_note") <= 1000),
  CONSTRAINT "account_deletion_handled_consistency" CHECK (
    ("status" IN ('REQUESTED') AND "handled_at" IS NULL)
    OR ("status" <> 'REQUESTED')
  )
);
--> statement-breakpoint
-- at most one open request per user (idempotent "Konto löschen")
CREATE UNIQUE INDEX "account_deletion_one_open_per_user"
  ON "account_deletion_requests" ("user_id")
  WHERE "status" IN ('REQUESTED', 'IN_REVIEW');
--> statement-breakpoint
CREATE INDEX "account_deletion_status_requested_idx"
  ON "account_deletion_requests" ("status", "requested_at");
