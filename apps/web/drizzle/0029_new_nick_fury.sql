CREATE TABLE "x402_resource_settlement_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"facilitator_url" text NOT NULL,
	"facilitator_response" jsonb,
	"network" "leash_network" NOT NULL,
	"asset" varchar(42) NOT NULL,
	"amount_atomic" numeric NOT NULL,
	"payer" varchar(42) NOT NULL,
	"payee" varchar(42) NOT NULL,
	"nonce" varchar(66) NOT NULL,
	"authorization_valid_after" timestamp (3) with time zone NOT NULL,
	"authorization_valid_before" timestamp (3) with time zone NOT NULL,
	"start_block" numeric NOT NULL,
	"tx_hash" varchar(66),
	"payment_fingerprint" varchar(64) NOT NULL,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" varchar(64),
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x402_resource_settlement_attempts_profile_check" CHECK ("x402_resource_settlement_attempts"."network" = 'eip155:84532'
        and lower("x402_resource_settlement_attempts"."asset") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
        and "x402_resource_settlement_attempts"."amount_atomic" = 1000),
	CONSTRAINT "x402_resource_settlement_attempts_identity_check" CHECK ("x402_resource_settlement_attempts"."payer" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlement_attempts"."payer") <> '0x0000000000000000000000000000000000000000'
        and "x402_resource_settlement_attempts"."payee" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlement_attempts"."payee") <> '0x0000000000000000000000000000000000000000'
        and "x402_resource_settlement_attempts"."nonce" ~ '^0x[0-9a-f]{64}$'
        and "x402_resource_settlement_attempts"."payment_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "x402_resource_settlement_attempts_authorization_check" CHECK ("x402_resource_settlement_attempts"."authorization_valid_after" < "x402_resource_settlement_attempts"."authorization_valid_before"
        and "x402_resource_settlement_attempts"."start_block" >= 0 and "x402_resource_settlement_attempts"."start_block" = trunc("x402_resource_settlement_attempts"."start_block")),
	CONSTRAINT "x402_resource_settlement_attempts_target_check" CHECK ("x402_resource_settlement_attempts"."endpoint" ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and "x402_resource_settlement_attempts"."facilitator_url" = 'https://x402.org/facilitator'),
	CONSTRAINT "x402_resource_settlement_attempts_result_check" CHECK ((("x402_resource_settlement_attempts"."tx_hash" is null and "x402_resource_settlement_attempts"."facilitator_response" is null)
	        or ("x402_resource_settlement_attempts"."facilitator_response" is not null
	          and "x402_resource_settlement_attempts"."tx_hash" ~ '^0x[0-9a-f]{64}$'
          and jsonb_typeof("x402_resource_settlement_attempts"."facilitator_response") = 'object'
          and octet_length("x402_resource_settlement_attempts"."facilitator_response"::text) <= 32768
          and "x402_resource_settlement_attempts"."facilitator_response" @> '{"success":true}'::jsonb
          and lower("x402_resource_settlement_attempts"."facilitator_response"->>'transaction') = "x402_resource_settlement_attempts"."tx_hash"
          and "x402_resource_settlement_attempts"."facilitator_response"->>'network' = "x402_resource_settlement_attempts"."network"::text
          and lower("x402_resource_settlement_attempts"."facilitator_response"->>'payer') = lower("x402_resource_settlement_attempts"."payer"))) is true),
	CONSTRAINT "x402_resource_settlement_attempts_retry_check" CHECK ("x402_resource_settlement_attempts"."verification_attempts" >= 0
        and ("x402_resource_settlement_attempts"."last_error_code" is null
          or "x402_resource_settlement_attempts"."last_error_code" in ('receipt_not_propagated', 'rpc_unavailable'))
        and "x402_resource_settlement_attempts"."updated_at" >= "x402_resource_settlement_attempts"."started_at")
);
--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD COLUMN "payment_fingerprint" varchar(64) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "x402_attempts_network_payer_nonce_unique" ON "x402_resource_settlement_attempts" USING btree ("network",lower("payer"),"nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_attempts_network_tx_unique" ON "x402_resource_settlement_attempts" USING btree ("network","tx_hash") WHERE "x402_resource_settlement_attempts"."tx_hash" is not null;--> statement-breakpoint
ALTER TABLE "x402_resource_settlements" ADD CONSTRAINT "x402_resource_settlements_fingerprint_check" CHECK ("x402_resource_settlements"."payment_fingerprint" ~ '^[0-9a-f]{64}$');
