CREATE TABLE "welcome_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welcome_categories_name_length" CHECK (char_length("welcome_categories"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "welcome_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welcome_videos_title_length" CHECK (char_length("welcome_videos"."title") between 1 and 120),
	CONSTRAINT "welcome_videos_description_length" CHECK ("welcome_videos"."description" is null or char_length("welcome_videos"."description") <= 500)
);
--> statement-breakpoint
ALTER TABLE "welcome_videos" ADD CONSTRAINT "welcome_videos_category_id_welcome_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."welcome_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_videos" ADD CONSTRAINT "welcome_videos_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "welcome_categories_name_lower_unique" ON "welcome_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "welcome_videos_category_idx" ON "welcome_videos" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "welcome_videos_media_idx" ON "welcome_videos" USING btree ("media_asset_id");