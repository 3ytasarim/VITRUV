ALTER TABLE "workout_session_exercises" ADD COLUMN "client_note" text;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD COLUMN "client_note_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "client_note" text;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "client_note_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_client_note_length" CHECK ("workout_session_exercises"."client_note" is null or char_length("workout_session_exercises"."client_note") between 1 and 2000);--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_note_length" CHECK ("workout_sessions"."client_note" is null or char_length("workout_sessions"."client_note") between 1 and 2000);