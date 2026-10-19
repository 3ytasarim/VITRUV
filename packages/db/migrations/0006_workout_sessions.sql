CREATE TYPE "public"."workout_execution_mode" AS ENUM('SETS_REPS', 'TOTAL_REPS', 'DURATION', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."workout_exercise_status" AS ENUM('PENDING', 'COMPLETED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."workout_session_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "workout_exercise_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" smallint NOT NULL,
	"target_reps" smallint,
	"target_duration_seconds" integer,
	"target_weight" numeric(6, 2),
	"actual_reps" integer,
	"actual_weight" numeric(6, 2),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_exercise_sets_number_unique" UNIQUE("session_exercise_id","set_number"),
	CONSTRAINT "workout_exercise_sets_number_positive" CHECK ("workout_exercise_sets"."set_number" >= 1),
	CONSTRAINT "workout_exercise_sets_actuals_nonnegative" CHECK (("workout_exercise_sets"."actual_reps" is null or "workout_exercise_sets"."actual_reps" >= 0)
        and ("workout_exercise_sets"."actual_weight" is null or "workout_exercise_sets"."actual_weight" >= 0))
);
--> statement-breakpoint
CREATE TABLE "workout_session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"training_exercise_assignment_id" uuid,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"section_type" "training_section_type" NOT NULL,
	"section_title_snapshot" text,
	"section_order" integer NOT NULL,
	"exercise_name_snapshot" text NOT NULL,
	"instructions_snapshot" text,
	"sets" smallint,
	"reps" smallint,
	"total_reps" integer,
	"duration_seconds" integer,
	"rest_seconds" integer,
	"target_weight" numeric(6, 2),
	"weight_unit" "weight_unit",
	"prescription_text" text,
	"execution_mode" "workout_execution_mode" NOT NULL,
	"status" "workout_exercise_status" DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"actual_reps" integer,
	"actual_duration_seconds" integer,
	"actual_weight" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_session_exercises_order_unique" UNIQUE("session_id","sort_order"),
	CONSTRAINT "workout_session_exercises_order_nonnegative" CHECK ("workout_session_exercises"."sort_order" >= 0 and "workout_session_exercises"."section_order" >= 0),
	CONSTRAINT "workout_session_exercises_completed_at" CHECK (("workout_session_exercises"."status" = 'COMPLETED') = ("workout_session_exercises"."completed_at" is not null)),
	CONSTRAINT "workout_session_exercises_actuals_nonnegative" CHECK (("workout_session_exercises"."actual_reps" is null or "workout_session_exercises"."actual_reps" >= 0)
        and ("workout_session_exercises"."actual_duration_seconds" is null or "workout_session_exercises"."actual_duration_seconds" >= 0)
        and ("workout_session_exercises"."actual_weight" is null or "workout_session_exercises"."actual_weight" >= 0)),
	CONSTRAINT "workout_session_exercises_weight_unit" CHECK (("workout_session_exercises"."target_weight" is null) = ("workout_session_exercises"."weight_unit" is null)),
	CONSTRAINT "workout_session_exercises_name_length" CHECK (char_length("workout_session_exercises"."exercise_name_snapshot") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"training_program_id" uuid NOT NULL,
	"training_day_id" uuid,
	"program_title_snapshot" text NOT NULL,
	"day_title_snapshot" text NOT NULL,
	"week_order_snapshot" integer NOT NULL,
	"day_order_snapshot" integer NOT NULL,
	"status" "workout_session_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sessions_status_timestamps" CHECK (("workout_sessions"."status" = 'IN_PROGRESS' and "workout_sessions"."completed_at" is null and "workout_sessions"."abandoned_at" is null)
        or ("workout_sessions"."status" = 'COMPLETED' and "workout_sessions"."completed_at" is not null and "workout_sessions"."abandoned_at" is null)
        or ("workout_sessions"."status" = 'ABANDONED' and "workout_sessions"."abandoned_at" is not null and "workout_sessions"."completed_at" is null)),
	CONSTRAINT "workout_sessions_end_after_start" CHECK (coalesce("workout_sessions"."completed_at", "workout_sessions"."abandoned_at", "workout_sessions"."started_at") >= "workout_sessions"."started_at"),
	CONSTRAINT "workout_sessions_orders_nonnegative" CHECK ("workout_sessions"."week_order_snapshot" >= 0 and "workout_sessions"."day_order_snapshot" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workout_exercise_sets" ADD CONSTRAINT "workout_exercise_sets_session_exercise_id_workout_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."workout_session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_training_exercise_assignment_id_training_exercise_assignments_id_fk" FOREIGN KEY ("training_exercise_assignment_id") REFERENCES "public"."training_exercise_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_training_program_id_training_programs_id_fk" FOREIGN KEY ("training_program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_training_day_id_training_days_id_fk" FOREIGN KEY ("training_day_id") REFERENCES "public"."training_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_session_exercises_assignment_idx" ON "workout_session_exercises" USING btree ("training_exercise_assignment_id");--> statement-breakpoint
CREATE INDEX "workout_session_exercises_exercise_idx" ON "workout_session_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_in_progress" ON "workout_sessions" USING btree ("client_user_id") WHERE "workout_sessions"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "workout_sessions_client_started_idx" ON "workout_sessions" USING btree ("client_user_id","started_at");--> statement-breakpoint
CREATE INDEX "workout_sessions_program_idx" ON "workout_sessions" USING btree ("training_program_id");