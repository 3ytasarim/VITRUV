ALTER TYPE "public"."auth_event_type" ADD VALUE 'PASSWORD_SET_BY_STAFF';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_identifier" CHECK ("users"."email" is not null or "users"."username" is not null);