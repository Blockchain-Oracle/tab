DROP INDEX "receipts_agent_created_idx";--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
CREATE INDEX "receipts_agent_created_idx" ON "receipts" USING btree ("agent_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);