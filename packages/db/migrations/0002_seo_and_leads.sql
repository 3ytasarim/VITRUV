CREATE TYPE "public"."website_lead_status" AS ENUM('NEW', 'HANDLED');--> statement-breakpoint
ALTER TYPE "public"."website_section_type" ADD VALUE 'seo';--> statement-breakpoint
CREATE TABLE "website_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" "website_lead_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_leads_name_length" CHECK (char_length("website_leads"."name") between 1 and 120),
	CONSTRAINT "website_leads_email_length" CHECK (char_length("website_leads"."email") between 3 and 254),
	CONSTRAINT "website_leads_phone_length" CHECK ("website_leads"."phone" is null or char_length("website_leads"."phone") <= 40),
	CONSTRAINT "website_leads_message_length" CHECK (char_length("website_leads"."message") between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX "website_leads_created_idx" ON "website_leads" USING btree ("created_at");