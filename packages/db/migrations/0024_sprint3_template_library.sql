ALTER TABLE "training_days" ADD COLUMN "assignment_request_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "category" text;--> statement-breakpoint
CREATE UNIQUE INDEX "training_days_assignment_request_unique" ON "training_days" USING btree ("assignment_request_id") WHERE "training_days"."assignment_request_id" is not null;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_category_valid" CHECK ("workout_templates"."category" is null or "workout_templates"."category" in ('UPPER_BODY', 'LOWER_BODY', 'TOTAL_REPS', 'CORE'));