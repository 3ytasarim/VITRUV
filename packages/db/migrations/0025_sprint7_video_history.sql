ALTER TABLE "training_exercise_assignments" ADD COLUMN "media_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD COLUMN "media_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD COLUMN "media_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD CONSTRAINT "training_exercise_assignments_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_sessions_client_completed_idx" ON "workout_sessions" USING btree ("client_user_id","completed_at");--> statement-breakpoint
-- Sprint 7: sessions started before this migration showed the library video live; snapshot it
-- once so their history keeps exactly what they showed (only rows without a snapshot).
UPDATE "workout_session_exercises" AS we SET "media_asset_id" = e."media_asset_id" FROM "exercises" AS e WHERE e."id" = we."exercise_id" AND we."media_asset_id" IS NULL AND e."media_asset_id" IS NOT NULL;
