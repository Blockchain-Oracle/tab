CREATE TYPE "public"."agent_event_surface" AS ENUM('agent', 'web', 'pwa', 'push_action', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_event_type" AS ENUM('connect', 'sign', 'block', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('provisioned', 'paused', 'frozen', 'cancelled', 'nuked');--> statement-breakpoint
CREATE TYPE "public"."cap_frequency" AS ENUM('daily', 'weekly', 'monthly', 'never');--> statement-breakpoint
CREATE TYPE "public"."cap_reset_reason" AS ENUM('schedule', 'manual', 'frequency_change');--> statement-breakpoint
CREATE TYPE "public"."leash_asset" AS ENUM('USDC');--> statement-breakpoint
CREATE TYPE "public"."leash_network" AS ENUM('eip155:8453', 'eip155:42161');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('pending', 'settled', 'failed', 'blocked');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" "agent_event_type" NOT NULL,
	"actor_surface" "agent_event_surface" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_events_metadata_check" CHECK (jsonb_typeof("agent_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "agent_status" DEFAULT 'provisioned' NOT NULL,
	"signer_subject" text NOT NULL,
	"agent_address" varchar(42),
	"client_name" text,
	"client_version" text,
	"transport" text,
	"connection_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_name_check" CHECK ("agents"."name" ~ '[^[:space:]]'),
	CONSTRAINT "agents_signer_subject_check" CHECK ("agents"."signer_subject" ~ '[^[:space:]]'),
	CONSTRAINT "agents_address_check" CHECK ("agents"."agent_address" is null or ("agents"."agent_address" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("agents"."agent_address") <> '0x0000000000000000000000000000000000000000')),
	CONSTRAINT "agents_connection_count_check" CHECK ("agents"."connection_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cap_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reset_reason" "cap_reset_reason",
	CONSTRAINT "cap_cycles_id_agent_unique" UNIQUE("id","agent_id"),
	CONSTRAINT "cap_cycles_end_check" CHECK (("cap_cycles"."ended_at" is null and "cap_cycles"."reset_reason" is null)
        or ("cap_cycles"."ended_at" > "cap_cycles"."started_at" and "cap_cycles"."reset_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "caps" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"amount_usd_cents" numeric(20, 0),
	"frequency" "cap_frequency" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caps_amount_check" CHECK ("caps"."amount_usd_cents" is null or "caps"."amount_usd_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "floats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"network" "leash_network" NOT NULL,
	"asset" "leash_asset" NOT NULL,
	"token_address" varchar(42) NOT NULL,
	"balance_atomic" numeric NOT NULL,
	"balance_usd" numeric(38, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floats_balance_atomic_check" CHECK ("floats"."balance_atomic" >= 0 and "floats"."balance_atomic" = trunc("floats"."balance_atomic")),
	CONSTRAINT "floats_balance_usd_check" CHECK ("floats"."balance_usd" >= 0),
	CONSTRAINT "floats_native_usdc_check" CHECK (("floats"."network" = 'eip155:8453'
          and lower("floats"."token_address") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or ("floats"."network" = 'eip155:42161'
          and lower("floats"."token_address") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'))
);
--> statement-breakpoint
CREATE TABLE "leash_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"hashed_key" varchar(64) NOT NULL,
	"prefix" text NOT NULL,
	"last4" varchar(4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_auth_failure_at" timestamp with time zone,
	"last_auth_failure_code" text,
	"rotated_from_id" uuid,
	CONSTRAINT "leash_keys_hash_check" CHECK ("leash_keys"."hashed_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "leash_keys_prefix_check" CHECK ("leash_keys"."prefix" = 'leash_sk_'),
	CONSTRAINT "leash_keys_last4_check" CHECK ("leash_keys"."last4" ~ '^[A-Za-z0-9_-]{4}$')
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"parent_id" uuid,
	"status" "receipt_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"amount_atomic" numeric NOT NULL,
	"amount_usd" numeric(38, 6) NOT NULL,
	"asset" varchar(42) NOT NULL,
	"network" "leash_network" NOT NULL,
	"intended_network" "leash_network",
	"pay_to" varchar(42) NOT NULL,
	"authorization_nonce" varchar(66) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"authorization_valid_before" timestamp with time zone NOT NULL,
	"origin" jsonb,
	"settlement_response" jsonb,
	"tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "receipts_amount_atomic_check" CHECK ("receipts"."amount_atomic" > 0 and "receipts"."amount_atomic" = trunc("receipts"."amount_atomic")),
	CONSTRAINT "receipts_amount_usd_check" CHECK ("receipts"."amount_usd" > 0),
	CONSTRAINT "receipts_pay_to_check" CHECK ("receipts"."pay_to" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("receipts"."pay_to") <> '0x0000000000000000000000000000000000000000'),
	CONSTRAINT "receipts_native_usdc_check" CHECK (("receipts"."network" = 'eip155:8453'
          and lower("receipts"."asset") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or ("receipts"."network" = 'eip155:42161'
          and lower("receipts"."asset") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')),
	CONSTRAINT "receipts_authorization_check" CHECK ("receipts"."authorization_nonce" ~ '^0x[0-9a-fA-F]{64}$'
        and "receipts"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "receipts_origin_check" CHECK ("receipts"."origin" is null or (jsonb_typeof("receipts"."origin") = 'object'
        and "receipts"."origin" ? 'transport'
        and "receipts"."origin"->>'transport' in ('mcp', 'http'))),
	CONSTRAINT "receipts_tx_hash_check" CHECK ("receipts"."tx_hash" is null or "receipts"."tx_hash" ~ '^0x[0-9a-fA-F]{64}$'),
	CONSTRAINT "receipts_state_check" CHECK (("receipts"."status" = 'pending' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is null
          and "receipts"."settlement_response" is null and "receipts"."settled_at" is null)
        or ("receipts"."status" = 'settled' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is not null
          and "receipts"."settlement_response" is not null and "receipts"."settled_at" is not null)
        or ("receipts"."status" = 'failed' and "receipts"."reason" ~ '[^[:space:]]'
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is null
          and "receipts"."settlement_response" is null and "receipts"."settled_at" is null)
        or ("receipts"."status" = 'blocked' and "receipts"."reason" ~ '[^[:space:]]'
          and "receipts"."intended_network" is not null and "receipts"."tx_hash" is null
          and "receipts"."settlement_response" is null and "receipts"."settled_at" is null))
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_cycles" ADD CONSTRAINT "cap_cycles_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floats" ADD CONSTRAINT "floats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash_keys" ADD CONSTRAINT "leash_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash_keys" ADD CONSTRAINT "leash_keys_rotated_from_id_leash_keys_id_fk" FOREIGN KEY ("rotated_from_id") REFERENCES "public"."leash_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_parent_id_receipts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cycle_agent_fk" FOREIGN KEY ("cycle_id","agent_id") REFERENCES "public"."cap_cycles"("id","agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_agent_created_idx" ON "agent_events" USING btree ("agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agents_owner_id_idx" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_signer_subject_unique" ON "agents" USING btree ("signer_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_agent_address_unique" ON "agents" USING btree ("agent_address") WHERE "agents"."agent_address" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cap_cycles_one_active_per_agent" ON "cap_cycles" USING btree ("agent_id") WHERE "cap_cycles"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "cap_cycles_agent_started_idx" ON "cap_cycles" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "floats_agent_network_unique" ON "floats" USING btree ("agent_id","network");--> statement-breakpoint
CREATE UNIQUE INDEX "leash_keys_hashed_key_unique" ON "leash_keys" USING btree ("hashed_key");--> statement-breakpoint
CREATE UNIQUE INDEX "leash_keys_one_active_per_agent" ON "leash_keys" USING btree ("agent_id") WHERE "leash_keys"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_agent_nonce_unique" ON "receipts" USING btree ("agent_id","authorization_nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_agent_fingerprint_unique" ON "receipts" USING btree ("agent_id","request_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_network_tx_hash_unique" ON "receipts" USING btree ("network","tx_hash") WHERE "receipts"."tx_hash" is not null;--> statement-breakpoint
CREATE INDEX "receipts_cap_gate_idx" ON "receipts" USING btree ("agent_id","cycle_id","status");--> statement-breakpoint
CREATE INDEX "receipts_agent_created_idx" ON "receipts" USING btree ("agent_id","created_at" DESC NULLS LAST);