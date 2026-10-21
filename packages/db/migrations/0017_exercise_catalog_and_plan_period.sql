CREATE TABLE "client_plans" (
	"client_user_id" uuid PRIMARY KEY NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_plans_period" CHECK ("client_plans"."starts_on" is null or "client_plans"."ends_on" is null or "client_plans"."ends_on" >= "client_plans"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "exercise_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_categories_name_length" CHECK (char_length("exercise_categories"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "client_plan_items" ALTER COLUMN "scheduled_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "capture_type" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "standard" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "usage" text;--> statement-breakpoint
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_categories_name_lower_unique" ON "exercise_categories" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_category_id_exercise_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."exercise_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_code_unique" ON "exercises" USING btree ("code");--> statement-breakpoint
CREATE INDEX "exercises_category_idx" ON "exercises" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_code_format" CHECK ("exercises"."code" is null or "exercises"."code" ~ '^[A-Z0-9][A-Z0-9-]{0,15}$');--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_detail_lengths" CHECK (("exercises"."capture_type" is null or char_length("exercises"."capture_type") <= 60) and ("exercises"."standard" is null or char_length("exercises"."standard") <= 160) and ("exercises"."usage" is null or char_length("exercises"."usage") <= 160));