ALTER TABLE "faucet_grants" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faucet_grants" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "faucet_grants" ADD CONSTRAINT "faucet_grants_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faucet_grants_merchant_created_idx" ON "faucet_grants" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "faucet_grants" ADD CONSTRAINT "faucet_grants_attribution_check" CHECK (("faucet_grants"."owner_id" is null) <> ("faucet_grants"."merchant_id" is null));