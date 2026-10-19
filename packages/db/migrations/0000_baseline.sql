CREATE TYPE "public"."media_kind" AS ENUM('IMAGE', 'VIDEO', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'COACH', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'CLIENT' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"visibility" "media_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"alt_text" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_assets_size_nonnegative" CHECK ("media_assets"."size_bytes" >= 0),
	CONSTRAINT "media_assets_width_positive" CHECK ("media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_positive" CHECK ("media_assets"."height" > 0),
	CONSTRAINT "media_assets_duration_nonnegative" CHECK ("media_assets"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "media_assets_kind_idx" ON "media_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_by_idx" ON "media_assets" USING btree ("uploaded_by_user_id");