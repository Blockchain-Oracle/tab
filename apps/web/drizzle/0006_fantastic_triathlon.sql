CREATE TYPE "public"."payer_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."settlement_verification_method" AS ENUM('rpc', 'particle', 'x402_receipt', 'simulated_test');--> statement-breakpoint
CREATE TYPE "public"."settlement_verification_trigger" AS ENUM('inline', 'cron_sweep');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"ref_code" text NOT NULL,
	"env" "environment" NOT NULL,
	"livemode" boolean NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"receiver" varchar(42) NOT NULL,
	"token_address" varchar(42) NOT NULL,
	"chain_id" integer NOT NULL,
	"intent_url" text NOT NULL,
	"payer_type" "payer_type" DEFAULT 'human' NOT NULL,
	"payer_email" "citext",
	"payer_address" varchar(42),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"reported_transaction_id" text,
	"reported_token_changes" jsonb,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payments_ref_code_check" CHECK ("payments"."ref_code" ~ '^[A-Z][A-Z0-9]*-[A-Z0-9]+$'),
	CONSTRAINT "payments_amount_positive_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" = 'USD'),
	CONSTRAINT "payments_chain_check" CHECK ("payments"."chain_id" = 42161),
	CONSTRAINT "payments_token_check" CHECK (lower("payments"."token_address") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'),
	CONSTRAINT "payments_receiver_check" CHECK ("payments"."receiver" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("payments"."receiver") <> '0x0000000000000000000000000000000000000000'),
	CONSTRAINT "payments_payer_address_check" CHECK ("payments"."payer_address" is null or ("payments"."payer_address" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("payments"."payer_address") <> '0x0000000000000000000000000000000000000000')),
	CONSTRAINT "payments_livemode_check" CHECK (("payments"."env" = 'live' and "payments"."livemode")
        or ("payments"."env" = 'test' and not "payments"."livemode")),
	CONSTRAINT "payments_report_check" CHECK (("payments"."reported_transaction_id" is null and "payments"."reported_token_changes" is null and "payments"."reported_at" is null)
        or ("payments"."reported_transaction_id" is not null and jsonb_typeof("payments"."reported_token_changes") = 'array'
          and "payments"."reported_at" is not null)),
	CONSTRAINT "payments_settled_at_check" CHECK (("payments"."status" = 'settled' and "payments"."settled_at" is not null)
        or ("payments"."status" <> 'settled' and "payments"."settled_at" is null)),
	CONSTRAINT "payments_failure_reason_check" CHECK (("payments"."status" = 'failed' and "payments"."failure_reason" is not null)
        or ("payments"."status" <> 'failed' and "payments"."failure_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"transaction_id" text NOT NULL,
	"tx_hash" varchar(66),
	"token_changes" jsonb NOT NULL,
	"amount_atomic" numeric(78, 0) NOT NULL,
	"verification_method" "settlement_verification_method" NOT NULL,
	"verification_trigger" "settlement_verification_trigger" NOT NULL,
	"livemode" boolean NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_amount_atomic_positive_check" CHECK ("settlements"."amount_atomic" > 0),
	CONSTRAINT "settlements_token_changes_check" CHECK (jsonb_typeof("settlements"."token_changes") = 'array'),
	CONSTRAINT "settlements_tx_hash_check" CHECK ("settlements"."tx_hash" is null or "settlements"."tx_hash" ~ '^0x[0-9a-fA-F]{64}$'),
	CONSTRAINT "settlements_simulation_check" CHECK (("settlements"."verification_method" = 'simulated_test' and not "settlements"."livemode")
        or ("settlements"."verification_method" <> 'simulated_test' and "settlements"."livemode"))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_ref_code_unique" ON "payments" USING btree ("ref_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reported_transaction_id_unique" ON "payments" USING btree ("reported_transaction_id") WHERE "payments"."reported_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_merchant_env_created_idx" ON "payments" USING btree ("merchant_id","env","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_pending_sweep_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_payment_id_unique" ON "settlements" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_transaction_id_unique" ON "settlements" USING btree ("transaction_id");