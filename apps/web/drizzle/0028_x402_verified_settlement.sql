CREATE TABLE "x402_resource_settlement_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"facilitator_url" text NOT NULL,
	"facilitator_response" jsonb NOT NULL,
	"network" "leash_network" NOT NULL,
	"asset" varchar(42) NOT NULL,
	"amount_atomic" numeric NOT NULL,
	"payer" varchar(42) NOT NULL,
	"payee" varchar(42) NOT NULL,
	"nonce" varchar(66) NOT NULL,
	"authorization_valid_after" timestamp (3) with time zone NOT NULL,
	"authorization_valid_before" timestamp (3) with time zone NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"payment_fingerprint" varchar(64) NOT NULL,
	"verification_attempts" integer NOT NULL,
	"last_error_code" varchar(64) NOT NULL,
	"last_checked_at" timestamp (3) with time zone NOT NULL,
	"observed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x402_resource_settlement_observations_profile_check" CHECK ("x402_resource_settlement_observations"."network" = 'eip155:84532'
        and lower("x402_resource_settlement_observations"."asset") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'),
	CONSTRAINT "x402_resource_settlement_observations_amount_check" CHECK ("x402_resource_settlement_observations"."amount_atomic" = 1000),
	CONSTRAINT "x402_resource_settlement_observations_address_check" CHECK ("x402_resource_settlement_observations"."payer" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlement_observations"."payer") <> '0x0000000000000000000000000000000000000000'
        and "x402_resource_settlement_observations"."payee" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlement_observations"."payee") <> '0x0000000000000000000000000000000000000000'),
	CONSTRAINT "x402_resource_settlement_observations_authorization_check" CHECK ("x402_resource_settlement_observations"."nonce" ~ '^0x[0-9a-f]{64}$'
        and "x402_resource_settlement_observations"."authorization_valid_after" < "x402_resource_settlement_observations"."authorization_valid_before"),
	CONSTRAINT "x402_resource_settlement_observations_target_check" CHECK ("x402_resource_settlement_observations"."endpoint" ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and "x402_resource_settlement_observations"."facilitator_url" = 'https://x402.org/facilitator'),
	CONSTRAINT "x402_resource_settlement_observations_response_check" CHECK ((jsonb_typeof("x402_resource_settlement_observations"."facilitator_response") = 'object'
        and octet_length("x402_resource_settlement_observations"."facilitator_response"::text) <= 32768
        and "x402_resource_settlement_observations"."facilitator_response" @> '{"success":true}'::jsonb
        and lower("x402_resource_settlement_observations"."facilitator_response"->>'transaction') = "x402_resource_settlement_observations"."tx_hash"
        and "x402_resource_settlement_observations"."facilitator_response"->>'network' = "x402_resource_settlement_observations"."network"::text
        and lower("x402_resource_settlement_observations"."facilitator_response"->>'payer') = lower("x402_resource_settlement_observations"."payer")) is true),
	CONSTRAINT "x402_resource_settlement_observations_transaction_check" CHECK ("x402_resource_settlement_observations"."tx_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "x402_resource_settlement_observations_retry_check" CHECK ("x402_resource_settlement_observations"."verification_attempts" > 0
        and "x402_resource_settlement_observations"."payment_fingerprint" ~ '^[0-9a-f]{64}$'
        and "x402_resource_settlement_observations"."last_error_code" in ('receipt_not_propagated', 'rpc_unavailable')
        and "x402_resource_settlement_observations"."updated_at" >= "x402_resource_settlement_observations"."observed_at"
        and "x402_resource_settlement_observations"."last_checked_at" between "x402_resource_settlement_observations"."observed_at" and "x402_resource_settlement_observations"."updated_at")
);
--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" DROP CONSTRAINT "x402_resource_settlements_amount_check";--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" DROP CONSTRAINT "x402_resource_settlements_response_check";--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD COLUMN "receipt_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "x402_observations_network_tx_unique" ON "x402_resource_settlement_observations" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_observations_network_payer_nonce_unique" ON "x402_resource_settlement_observations" USING btree ("network",lower("payer"),"nonce");--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD CONSTRAINT "x402_resource_settlements_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "x402_resource_settlements_network_payer_nonce_unique" ON "x402_resource_settlements" USING btree ("network",lower("payer"),"nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_resource_settlements_receipt_unique" ON "x402_resource_settlements" USING btree ("receipt_id") WHERE "x402_resource_settlements"."receipt_id" is not null;--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD CONSTRAINT "x402_resource_settlements_amount_check" CHECK ("x402_resource_settlements"."amount_atomic" = 1000);--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD CONSTRAINT "x402_resource_settlements_response_check" CHECK ((jsonb_typeof("x402_resource_settlements"."facilitator_response") = 'object'
        and octet_length("x402_resource_settlements"."facilitator_response"::text) <= 32768
        and "x402_resource_settlements"."facilitator_response" @> '{"success":true}'::jsonb
        and lower("x402_resource_settlements"."facilitator_response"->>'transaction') = "x402_resource_settlements"."tx_hash"
        and "x402_resource_settlements"."facilitator_response"->>'network' = "x402_resource_settlements"."network"::text
        and lower("x402_resource_settlements"."facilitator_response"->>'payer') = lower("x402_resource_settlements"."payer")) is true);