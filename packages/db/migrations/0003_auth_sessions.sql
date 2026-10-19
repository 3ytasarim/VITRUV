CREATE TYPE "public"."auth_client_type" AS ENUM('WEB', 'MOBILE');--> statement-breakpoint
CREATE TYPE "public"."auth_event_type" AS ENUM('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'REFRESH_REUSE_DETECTED');--> statement-breakpoint
CREATE TYPE "public"."session_revoke_reason" AS ENUM('LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'REFRESH_REUSE', 'USER_DISABLED');--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "auth_event_type" NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"client_type" "auth_client_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_type" "auth_client_type" NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_refresh_token_hash" text,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "session_revoke_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "auth_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash"),
	CONSTRAINT "auth_sessions_previous_refresh_token_hash_unique" UNIQUE("previous_refresh_token_hash"),
	CONSTRAINT "auth_sessions_access_hash_format" CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_sessions_refresh_hash_format" CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_sessions_revocation_consistent" CHECK (("auth_sessions"."revoked_at" is null) = ("auth_sessions"."revoked_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_created_idx" ON "auth_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_events_user_idx" ON "auth_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email")));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_format" CHECK ("users"."password_hash" is null or "users"."password_hash" like '$argon2id$%');