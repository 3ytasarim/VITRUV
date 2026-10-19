ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("users"."username" is null or "users"."username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$');