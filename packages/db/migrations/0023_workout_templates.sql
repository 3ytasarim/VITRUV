-- 0023_workout_templates (Sprint 2 foundation) — ADDITIVE ONLY: three NEW empty tables.
-- Existing tables are only referenced (FK to users / exercises, RESTRICT). NOT applied yet.
-- docs/ios-training-sprint2-migration-plan.md
CREATE TABLE "workout_template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"execution_type" "training_execution_type" NOT NULL,
	"sets" smallint,
	"reps" smallint,
	"reps_max" boolean DEFAULT false NOT NULL,
	"total_reps" integer,
	"duration_seconds" integer,
	"rest_seconds" integer,
	"target_weight" numeric(6, 2),
	"weight_unit" "weight_unit",
	"prescription_text" text,
	"instructions_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_template_exercises_order_unique" UNIQUE("section_id","sort_order"),
	CONSTRAINT "workout_template_exercises_order_nonnegative" CHECK ("workout_template_exercises"."sort_order" >= 0),
	CONSTRAINT "workout_template_exercises_positive" CHECK (("workout_template_exercises"."sets" is null or "workout_template_exercises"."sets" > 0)
        and ("workout_template_exercises"."reps" is null or "workout_template_exercises"."reps" > 0)
        and ("workout_template_exercises"."total_reps" is null or "workout_template_exercises"."total_reps" > 0)
        and ("workout_template_exercises"."duration_seconds" is null or "workout_template_exercises"."duration_seconds" > 0)
        and ("workout_template_exercises"."rest_seconds" is null or "workout_template_exercises"."rest_seconds" >= 0)
        and ("workout_template_exercises"."target_weight" is null or "workout_template_exercises"."target_weight" >= 0)),
	CONSTRAINT "workout_template_exercises_weight_unit" CHECK (("workout_template_exercises"."target_weight" is null) = ("workout_template_exercises"."weight_unit" is null)),
	CONSTRAINT "workout_template_exercises_reps_max_without_reps" CHECK (not "workout_template_exercises"."reps_max" or "workout_template_exercises"."reps" is null),
	CONSTRAINT "workout_template_exercises_type_fields" CHECK (("workout_template_exercises"."execution_type" = 'STRENGTH' and "workout_template_exercises"."sets" is not null and ("workout_template_exercises"."reps" is not null or "workout_template_exercises"."reps_max"))
        or ("workout_template_exercises"."execution_type" = 'TOTAL_REPS' and "workout_template_exercises"."total_reps" is not null)
        or ("workout_template_exercises"."execution_type" = 'INTERVAL')
        or ("workout_template_exercises"."execution_type" = 'CHECKLIST' and "workout_template_exercises"."sets" is null and "workout_template_exercises"."reps" is null
            and "workout_template_exercises"."total_reps" is null and "workout_template_exercises"."duration_seconds" is null and "workout_template_exercises"."rest_seconds" is null)),
	CONSTRAINT "workout_template_exercises_prescription_length" CHECK ("workout_template_exercises"."prescription_text" is null or char_length("workout_template_exercises"."prescription_text") between 1 and 200),
	CONSTRAINT "workout_template_exercises_instructions_length" CHECK ("workout_template_exercises"."instructions_override" is null or char_length("workout_template_exercises"."instructions_override") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "workout_template_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"type" "training_section_type" NOT NULL,
	"title" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_template_sections_order_unique" UNIQUE("template_id","sort_order"),
	CONSTRAINT "workout_template_sections_order_nonnegative" CHECK ("workout_template_sections"."sort_order" >= 0),
	CONSTRAINT "workout_template_sections_title_length" CHECK ("workout_template_sections"."title" is null or char_length("workout_template_sections"."title") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_templates_title_length" CHECK (char_length("workout_templates"."title") between 1 and 120),
	CONSTRAINT "workout_templates_description_length" CHECK ("workout_templates"."description" is null or char_length("workout_templates"."description") <= 2000),
	CONSTRAINT "workout_templates_version_positive" CHECK ("workout_templates"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_section_id_workout_template_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."workout_template_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_sections" ADD CONSTRAINT "workout_template_sections_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_template_exercises_exercise_idx" ON "workout_template_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_templates_owner_idx" ON "workout_templates" USING btree ("owner_user_id");