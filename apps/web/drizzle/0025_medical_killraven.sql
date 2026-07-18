CREATE TABLE "x402_resource_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_identifier" varchar(256),
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
	"explorer_url" text NOT NULL,
	"test_funds" boolean DEFAULT true NOT NULL,
	"settled_at" timestamp (3) with time zone NOT NULL,
	"recorded_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x402_resource_settlements_profile_check" CHECK ("x402_resource_settlements"."network" = 'eip155:84532'
        and lower("x402_resource_settlements"."asset") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
        and "x402_resource_settlements"."test_funds" is true),
	CONSTRAINT "x402_resource_settlements_amount_check" CHECK ("x402_resource_settlements"."amount_atomic" > 0 and "x402_resource_settlements"."amount_atomic" = trunc("x402_resource_settlements"."amount_atomic")),
	CONSTRAINT "x402_resource_settlements_address_check" CHECK ("x402_resource_settlements"."payer" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlements"."payer") <> '0x0000000000000000000000000000000000000000'
        and "x402_resource_settlements"."payee" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("x402_resource_settlements"."payee") <> '0x0000000000000000000000000000000000000000'),
	CONSTRAINT "x402_resource_settlements_authorization_check" CHECK ("x402_resource_settlements"."nonce" ~ '^0x[0-9a-f]{64}$'
        and "x402_resource_settlements"."authorization_valid_after" < "x402_resource_settlements"."authorization_valid_before"),
	CONSTRAINT "x402_resource_settlements_target_check" CHECK ("x402_resource_settlements"."endpoint" ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and "x402_resource_settlements"."facilitator_url" = 'https://x402.org/facilitator'),
	CONSTRAINT "x402_resource_settlements_response_check" CHECK (jsonb_typeof("x402_resource_settlements"."facilitator_response") = 'object'
        and "x402_resource_settlements"."facilitator_response" @> '{"success":true}'::jsonb
        and lower("x402_resource_settlements"."facilitator_response"->>'transaction') = "x402_resource_settlements"."tx_hash"
        and "x402_resource_settlements"."facilitator_response"->>'network' = "x402_resource_settlements"."network"::text
        and lower("x402_resource_settlements"."facilitator_response"->>'payer') = lower("x402_resource_settlements"."payer")),
	CONSTRAINT "x402_resource_settlements_transaction_check" CHECK ("x402_resource_settlements"."tx_hash" ~ '^0x[0-9a-f]{64}$'
        and "x402_resource_settlements"."explorer_url" = 'https://sepolia.basescan.org/tx/' || "x402_resource_settlements"."tx_hash"),
	CONSTRAINT "x402_resource_settlements_payment_identifier_check" CHECK ("x402_resource_settlements"."payment_identifier" is null
        or (char_length("x402_resource_settlements"."payment_identifier") between 1 and 256
          and "x402_resource_settlements"."payment_identifier" = btrim("x402_resource_settlements"."payment_identifier")
          and "x402_resource_settlements"."payment_identifier" ~ '[^[:space:]]'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "x402_resource_settlements_network_tx_unique" ON "x402_resource_settlements" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_resource_settlements_payment_unique" ON "x402_resource_settlements" USING btree ("network","payment_identifier") WHERE "x402_resource_settlements"."payment_identifier" is not null;
