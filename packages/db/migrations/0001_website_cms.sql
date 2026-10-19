CREATE TYPE "public"."media_purpose" AS ENUM('WEBSITE', 'TRAINING_VIDEO', 'NUTRITION', 'CLIENT_UPLOAD', 'FEEDBACK_VIDEO');--> statement-breakpoint
CREATE TYPE "public"."website_section_type" AS ENUM('hero', 'results', 'journey', 'coaching', 'packages', 'about', 'faq', 'cta', 'footer');--> statement-breakpoint
CREATE TYPE "public"."website_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "website_media_slots" (
	"version_id" uuid NOT NULL,
	"role" text NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "website_media_slots_version_id_role_pk" PRIMARY KEY("version_id","role")
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content_revision" integer DEFAULT 0 NOT NULL,
	"last_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "website_pages_slug_format" CHECK ("website_pages"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "website_pages_revision_nonnegative" CHECK ("website_pages"."content_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "website_section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"status" "website_version_status" NOT NULL,
	"content" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_section_versions_publish_fields" CHECK (("website_section_versions"."status" = 'DRAFT') = ("website_section_versions"."published_at" is null)),
	CONSTRAINT "website_section_versions_archive_fields" CHECK (("website_section_versions"."status" = 'ARCHIVED') = ("website_section_versions"."archived_at" is not null)),
	CONSTRAINT "website_section_versions_content_object" CHECK (jsonb_typeof("website_section_versions"."content") = 'object')
);
--> statement-breakpoint
CREATE TABLE "website_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" "website_section_type" NOT NULL,
	"sort_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_sections_key_format" CHECK ("website_sections"."key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "purpose" "media_purpose" NOT NULL;--> statement-breakpoint
ALTER TABLE "website_media_slots" ADD CONSTRAINT "website_media_slots_version_id_website_section_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."website_section_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_media_slots" ADD CONSTRAINT "website_media_slots_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_section_versions" ADD CONSTRAINT "website_section_versions_section_id_website_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."website_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_section_versions" ADD CONSTRAINT "website_section_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_section_versions" ADD CONSTRAINT "website_section_versions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_section_versions" ADD CONSTRAINT "website_section_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "website_media_slots_asset_idx" ON "website_media_slots" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "website_section_versions_one_draft" ON "website_section_versions" USING btree ("section_id") WHERE "website_section_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "website_section_versions_one_published" ON "website_section_versions" USING btree ("section_id") WHERE "website_section_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "website_section_versions_section_created_idx" ON "website_section_versions" USING btree ("section_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "website_sections_page_key_unique" ON "website_sections" USING btree ("page_id","key");--> statement-breakpoint
CREATE INDEX "website_sections_page_order_idx" ON "website_sections" USING btree ("page_id","sort_order");--> statement-breakpoint
CREATE INDEX "media_assets_purpose_created_idx" ON "media_assets" USING btree ("purpose","created_at");