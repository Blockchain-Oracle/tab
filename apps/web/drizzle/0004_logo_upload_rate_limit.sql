ALTER TABLE "merchants" ADD COLUMN "logo_upload_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "logo_upload_window_started_at" timestamp with time zone;
