CREATE TABLE "client_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"scheduled_on" date NOT NULL,
	"note" text,
	"sort_order" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_plan_items_note_length" CHECK ("client_plan_items"."note" is null or char_length("client_plan_items"."note") <= 1000),
	CONSTRAINT "client_plan_items_sort_nonnegative" CHECK ("client_plan_items"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "client_plan_items" ADD CONSTRAINT "client_plan_items_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_plan_items" ADD CONSTRAINT "client_plan_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_plan_items" ADD CONSTRAINT "client_plan_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_plan_items_client_date_idx" ON "client_plan_items" USING btree ("client_user_id","scheduled_on","sort_order");--> statement-breakpoint
CREATE INDEX "client_plan_items_exercise_idx" ON "client_plan_items" USING btree ("exercise_id");