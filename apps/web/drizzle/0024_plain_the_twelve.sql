CREATE TYPE "public"."agent_payment_profile" AS ENUM('mainnet', 'base_sepolia_integration');--> statement-breakpoint
ALTER TABLE "floats" DROP CONSTRAINT "floats_native_usdc_check";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_native_usdc_check";--> statement-breakpoint
ALTER TYPE "public"."leash_network" RENAME TO "leash_network_old";--> statement-breakpoint
CREATE TYPE "public"."leash_network" AS ENUM('eip155:8453', 'eip155:42161', 'eip155:84532');--> statement-breakpoint
ALTER TABLE "floats" ALTER COLUMN "network" TYPE "public"."leash_network"
  USING "network"::text::"public"."leash_network";--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "network" TYPE "public"."leash_network"
  USING "network"::text::"public"."leash_network";--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "intended_network" TYPE "public"."leash_network"
  USING "intended_network"::text::"public"."leash_network";--> statement-breakpoint
DROP TYPE "public"."leash_network_old";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "payment_profile" "agent_payment_profile" DEFAULT 'mainnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_claim_token" varchar(64);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_digest" varchar(66);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_signature" varchar(132);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signing_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "floats" ADD CONSTRAINT "floats_native_usdc_check" CHECK (("floats"."network" = 'eip155:8453'
          and lower("floats"."token_address") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or ("floats"."network" = 'eip155:42161'
          and lower("floats"."token_address") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')
        or ("floats"."network" = 'eip155:84532'
          and lower("floats"."token_address") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_signing_claim_check" CHECK ("receipts"."signing_attempts" >= 0 and (
        ("receipts"."signing_claim_token" is null and "receipts"."signing_claimed_at" is null
          and "receipts"."signing_lease_expires_at" is null)
        or ("receipts"."status" = 'pending'
          and "receipts"."signing_claim_token" ~ '^[0-9a-f]{64}$'
          and "receipts"."signing_claimed_at" is not null
          and "receipts"."signing_lease_expires_at" > "receipts"."signing_claimed_at"
          and "receipts"."signing_digest" ~ '^0x[0-9a-f]{64}$')
      ) and (
        ("receipts"."signing_signature" is null and "receipts"."signed_at" is null)
        or ("receipts"."status" = 'pending'
          and "receipts"."signing_claim_token" is null
          and "receipts"."signing_claimed_at" is null
          and "receipts"."signing_lease_expires_at" is null
          and "receipts"."signing_digest" ~ '^0x[0-9a-f]{64}$'
          and "receipts"."signing_signature" ~ '^0x[0-9a-fA-F]{130}$'
          and "receipts"."signed_at" is not null)
      ));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_native_usdc_check" CHECK (("receipts"."network" = 'eip155:8453'
          and lower("receipts"."asset") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or ("receipts"."network" = 'eip155:42161'
          and lower("receipts"."asset") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')
        or ("receipts"."network" = 'eip155:84532'
          and lower("receipts"."asset") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'));
