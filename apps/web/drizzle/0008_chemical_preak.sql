ALTER TABLE "payments" RENAME COLUMN "amount" TO "amount_usd";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "chain_id" TO "token_chain_id";--> statement-breakpoint
ALTER TABLE "settlements" RENAME COLUMN "transaction_id" TO "particle_transaction_id";--> statement-breakpoint
ALTER TABLE "settlements" RENAME COLUMN "token_changes" TO "token_changes_json";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_positive_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_ref_code_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_chain_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_report_check";--> statement-breakpoint
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_amount_atomic_positive_check";--> statement-breakpoint
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_token_changes_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_merchant_id_merchants_id_fk";
--> statement-breakpoint
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_payment_id_payments_id_fk";
--> statement-breakpoint
DROP INDEX "payments_reported_transaction_id_unique";--> statement-breakpoint
DROP INDEX "settlements_transaction_id_unique";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_usd" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "amount_atomic" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_settlement_evidence_unique" ON "payments" USING btree ("id","reported_transaction_id","livemode");--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payment_evidence_fk" FOREIGN KEY ("payment_id","particle_transaction_id","livemode") REFERENCES "public"."payments"("id","reported_transaction_id","livemode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_reported_transaction_id_idx" ON "payments" USING btree ("reported_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_particle_transaction_id_unique" ON "settlements" USING btree ("particle_transaction_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_usd" > 0 and "payments"."amount_usd" < 100000000000000
        and scale("payments"."amount_usd") <= 6);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ref_code_check" CHECK ("payments"."ref_code" ~ '^TAB-[A-Z0-9]+$');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_chain_check" CHECK ("payments"."token_chain_id" = 42161);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_report_check" CHECK (("payments"."reported_transaction_id" is null and "payments"."reported_token_changes" is null and "payments"."reported_at" is null)
        or ("payments"."reported_transaction_id" is not null and btrim("payments"."reported_transaction_id") <> ''
          and "payments"."reported_token_changes" is not null
          and jsonb_typeof("payments"."reported_token_changes") = 'array' and "payments"."reported_at" is not null));--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_atomic_check" CHECK ("settlements"."amount_atomic" > 0 and "settlements"."amount_atomic" = trunc("settlements"."amount_atomic")
        and "settlements"."amount_atomic" < 1000000000000000000000000000000000000000000000000000000000000000000000000000000);--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_token_changes_check" CHECK (jsonb_typeof("settlements"."token_changes_json") = 'array');
