ALTER TABLE "media_assets" ADD COLUMN "focal_x" real;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "focal_y" real;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_focal_point" CHECK (("media_assets"."focal_x" IS NULL AND "media_assets"."focal_y" IS NULL) OR ("media_assets"."focal_x" BETWEEN 0 AND 1 AND "media_assets"."focal_y" BETWEEN 0 AND 1));