CREATE TYPE "public"."nutrition_document_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'NUTRITION_DOCUMENT_UPLOADED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'NUTRITION_DOCUMENT_ACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'NUTRITION_DOCUMENT_ARCHIVED';--> statement-breakpoint
CREATE TABLE "nutrition_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" text,
	"status" "nutrition_document_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" date,
	"assigned_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_documents_version_unique" UNIQUE("client_user_id","version_number"),
	CONSTRAINT "nutrition_documents_media_unique" UNIQUE("media_asset_id"),
	CONSTRAINT "nutrition_documents_title_length" CHECK (char_length("nutrition_documents"."title") between 1 and 160),
	CONSTRAINT "nutrition_documents_version_label_length" CHECK ("nutrition_documents"."version_label" is null or char_length("nutrition_documents"."version_label") between 1 and 60),
	CONSTRAINT "nutrition_documents_version_positive" CHECK ("nutrition_documents"."version_number" >= 1),
	CONSTRAINT "nutrition_documents_status_timestamps" CHECK (("nutrition_documents"."status" = 'DRAFT' and "nutrition_documents"."activated_at" is null and "nutrition_documents"."archived_at" is null)
        or ("nutrition_documents"."status" = 'ACTIVE' and "nutrition_documents"."activated_at" is not null and "nutrition_documents"."archived_at" is null)
        or ("nutrition_documents"."status" = 'ARCHIVED' and "nutrition_documents"."archived_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "nutrition_documents" ADD CONSTRAINT "nutrition_documents_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_documents" ADD CONSTRAINT "nutrition_documents_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_documents" ADD CONSTRAINT "nutrition_documents_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_documents_one_active" ON "nutrition_documents" USING btree ("client_user_id") WHERE "nutrition_documents"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "nutrition_documents_client_created_idx" ON "nutrition_documents" USING btree ("client_user_id","created_at");