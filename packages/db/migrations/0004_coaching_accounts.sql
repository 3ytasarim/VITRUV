CREATE TYPE "public"."coaching_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ACCOUNT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ACTIVATION_ISSUED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ACCOUNT_ACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ACCOUNT_DISABLED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ACCOUNT_ENABLED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'ASSIGNMENT_CHANGED';--> statement-breakpoint
CREATE TABLE "account_activation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_activation_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "account_activation_tokens_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_activation_tokens_single_end" CHECK (not ("account_activation_tokens"."consumed_at" is not null and "account_activation_tokens"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"coaching_status" "coaching_status" DEFAULT 'ACTIVE' NOT NULL,
	"internal_notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "client_profiles_first_name_length" CHECK (char_length("client_profiles"."first_name") between 1 and 80),
	CONSTRAINT "client_profiles_last_name_length" CHECK (char_length("client_profiles"."last_name") between 1 and 80),
	CONSTRAINT "client_profiles_phone_length" CHECK ("client_profiles"."phone" is null or char_length("client_profiles"."phone") <= 40),
	CONSTRAINT "client_profiles_internal_notes_length" CHECK ("client_profiles"."internal_notes" is null or char_length("client_profiles"."internal_notes") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "coach_client_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by_user_id" uuid,
	CONSTRAINT "coach_client_assignments_period" CHECK ("coach_client_assignments"."ended_at" is null or "coach_client_assignments"."ended_at" >= "coach_client_assignments"."assigned_at"),
	CONSTRAINT "coach_client_assignments_distinct" CHECK ("coach_client_assignments"."coach_user_id" <> "coach_client_assignments"."client_user_id")
);
--> statement-breakpoint
CREATE TABLE "coach_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "coach_profiles_display_name_length" CHECK (char_length("coach_profiles"."display_name") between 1 and 120),
	CONSTRAINT "coach_profiles_phone_length" CHECK ("coach_profiles"."phone" is null or char_length("coach_profiles"."phone") <= 40)
);
--> statement-breakpoint
ALTER TABLE "auth_events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "account_activation_tokens" ADD CONSTRAINT "account_activation_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activation_tokens" ADD CONSTRAINT "account_activation_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_client_assignments" ADD CONSTRAINT "coach_client_assignments_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_client_assignments" ADD CONSTRAINT "coach_client_assignments_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_client_assignments" ADD CONSTRAINT "coach_client_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_activation_tokens_live_unique" ON "account_activation_tokens" USING btree ("user_id") WHERE "account_activation_tokens"."consumed_at" is null and "account_activation_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "client_profiles_name_idx" ON "client_profiles" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_client_assignments_one_active" ON "coach_client_assignments" USING btree ("client_user_id") WHERE "coach_client_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "coach_client_assignments_coach_active_idx" ON "coach_client_assignments" USING btree ("coach_user_id") WHERE "coach_client_assignments"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;