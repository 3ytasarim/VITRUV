CREATE TYPE "public"."training_program_status" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."training_section_type" AS ENUM('WARMUP', 'MAIN', 'FINISHER');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('KG');--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'EXERCISE_CREATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'EXERCISE_DEACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'EXERCISE_REACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'PROGRAM_CREATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'PROGRAM_ACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'PROGRAM_COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."auth_event_type" ADD VALUE 'PROGRAM_ARCHIVED';--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"media_asset_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_name_length" CHECK (char_length("exercises"."name") between 1 and 120),
	CONSTRAINT "exercises_description_length" CHECK ("exercises"."description" is null or char_length("exercises"."description") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "training_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"scheduled_weekday" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_days_order_unique" UNIQUE("week_id","sort_order"),
	CONSTRAINT "training_days_order_nonnegative" CHECK ("training_days"."sort_order" >= 0),
	CONSTRAINT "training_days_title_length" CHECK (char_length("training_days"."title") between 1 and 120),
	CONSTRAINT "training_days_notes_length" CHECK ("training_days"."notes" is null or char_length("training_days"."notes") <= 2000),
	CONSTRAINT "training_days_weekday_range" CHECK ("training_days"."scheduled_weekday" is null or "training_days"."scheduled_weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "training_exercise_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"sets" smallint,
	"reps" smallint,
	"total_reps" integer,
	"duration_seconds" integer,
	"rest_seconds" integer,
	"target_weight" numeric(6, 2),
	"weight_unit" "weight_unit",
	"prescription_text" text,
	"instructions_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_assignments_order_unique" UNIQUE("section_id","sort_order"),
	CONSTRAINT "training_assignments_order_nonnegative" CHECK ("training_exercise_assignments"."sort_order" >= 0),
	CONSTRAINT "training_assignments_sets_positive" CHECK ("training_exercise_assignments"."sets" is null or "training_exercise_assignments"."sets" > 0),
	CONSTRAINT "training_assignments_reps_positive" CHECK ("training_exercise_assignments"."reps" is null or "training_exercise_assignments"."reps" > 0),
	CONSTRAINT "training_assignments_total_reps_positive" CHECK ("training_exercise_assignments"."total_reps" is null or "training_exercise_assignments"."total_reps" > 0),
	CONSTRAINT "training_assignments_duration_positive" CHECK ("training_exercise_assignments"."duration_seconds" is null or "training_exercise_assignments"."duration_seconds" > 0),
	CONSTRAINT "training_assignments_rest_nonnegative" CHECK ("training_exercise_assignments"."rest_seconds" is null or "training_exercise_assignments"."rest_seconds" >= 0),
	CONSTRAINT "training_assignments_weight_nonnegative" CHECK ("training_exercise_assignments"."target_weight" is null or "training_exercise_assignments"."target_weight" >= 0),
	CONSTRAINT "training_assignments_weight_unit" CHECK (("training_exercise_assignments"."target_weight" is null) = ("training_exercise_assignments"."weight_unit" is null)),
	CONSTRAINT "training_assignments_prescription_length" CHECK ("training_exercise_assignments"."prescription_text" is null or char_length("training_exercise_assignments"."prescription_text") between 1 and 200),
	CONSTRAINT "training_assignments_instructions_length" CHECK ("training_exercise_assignments"."instructions_override" is null or char_length("training_exercise_assignments"."instructions_override") <= 2000),
	CONSTRAINT "training_assignments_meaningful" CHECK ("training_exercise_assignments"."sets" is not null or "training_exercise_assignments"."reps" is not null or "training_exercise_assignments"."total_reps" is not null or "training_exercise_assignments"."duration_seconds" is not null or "training_exercise_assignments"."prescription_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "training_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "training_program_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_programs_title_length" CHECK (char_length("training_programs"."title") between 1 and 160),
	CONSTRAINT "training_programs_description_length" CHECK ("training_programs"."description" is null or char_length("training_programs"."description") <= 4000),
	CONSTRAINT "training_programs_period" CHECK ("training_programs"."ends_on" is null or "training_programs"."starts_on" is null or "training_programs"."ends_on" >= "training_programs"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "training_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"type" "training_section_type" NOT NULL,
	"title" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sections_order_unique" UNIQUE("day_id","sort_order"),
	CONSTRAINT "training_sections_order_nonnegative" CHECK ("training_sections"."sort_order" >= 0),
	CONSTRAINT "training_sections_title_length" CHECK ("training_sections"."title" is null or char_length("training_sections"."title") <= 120)
);
--> statement-breakpoint
CREATE TABLE "training_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_weeks_order_unique" UNIQUE("program_id","sort_order"),
	CONSTRAINT "training_weeks_order_nonnegative" CHECK ("training_weeks"."sort_order" >= 0),
	CONSTRAINT "training_weeks_title_length" CHECK ("training_weeks"."title" is null or char_length("training_weeks"."title") <= 120),
	CONSTRAINT "training_weeks_notes_length" CHECK ("training_weeks"."notes" is null or char_length("training_weeks"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "auth_events" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_days" ADD CONSTRAINT "training_days_week_id_training_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."training_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD CONSTRAINT "training_exercise_assignments_section_id_training_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."training_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_exercise_assignments" ADD CONSTRAINT "training_exercise_assignments_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sections" ADD CONSTRAINT "training_sections_day_id_training_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."training_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_weeks" ADD CONSTRAINT "training_weeks_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_lower_unique" ON "exercises" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "exercises_media_idx" ON "exercises" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "training_assignments_exercise_idx" ON "training_exercise_assignments" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_programs_one_active" ON "training_programs" USING btree ("client_user_id") WHERE "training_programs"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "training_programs_client_idx" ON "training_programs" USING btree ("client_user_id","created_at");