-- 0022_training_v2 (Sprint 2, iOS training v2) — ADDITIVE ONLY. NOT applied to production yet.
-- New enum + appended enum values, nullable/defaulted columns, one partial unique index, two
-- CHECKs that every existing row satisfies (reps_max defaults to false; new columns are NULL).
-- No data is rewritten, no existing constraint is changed. Plan + rollback:
-- docs/ios-training-sprint2-migration-plan.md
CREATE TYPE "public"."training_execution_type" AS ENUM('STRENGTH', 'TOTAL_REPS', 'INTERVAL', 'CHECKLIST');--> statement-breakpoint
ALTER TYPE "public"."workout_execution_mode" ADD VALUE 'INTERVAL';--> statement-breakpoint
ALTER TYPE "public"."workout_execution_mode" ADD VALUE 'CHECKLIST';--> statement-breakpoint
ALTER TABLE "training_days" ADD COLUMN "source_template_id" uuid;--> statement-breakpoint
ALTER TABLE "training_days" ADD COLUMN "source_template_version" integer;--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD COLUMN "execution_type" "training_execution_type";--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD COLUMN "reps_max" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_exercise_sets" ADD COLUMN "client_set_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_exercise_sets" ADD COLUMN "actual_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_exercise_sets" ADD COLUMN "client_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD COLUMN "reps_max" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "source_template_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "source_template_version" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_exercise_sets_client_set_unique" ON "workout_exercise_sets" USING btree ("session_exercise_id","client_set_id") WHERE "workout_exercise_sets"."client_set_id" is not null;--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD CONSTRAINT "training_assignments_reps_max_without_reps" CHECK (not "training_exercise_assignments"."reps_max" or "training_exercise_assignments"."reps" is null);--> statement-breakpoint
ALTER TABLE "workout_exercise_sets" ADD CONSTRAINT "workout_exercise_sets_actual_duration_nonnegative" CHECK ("workout_exercise_sets"."actual_duration_seconds" is null or "workout_exercise_sets"."actual_duration_seconds" >= 0);