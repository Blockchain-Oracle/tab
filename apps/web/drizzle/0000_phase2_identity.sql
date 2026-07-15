CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE TYPE "public"."api_key_permissions" AS ENUM('full', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."api_key_type" AS ENUM('secret', 'publishable');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TYPE "public"."quickstart_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."receiving_address_source" AS ENUM('magic_default', 'custom');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "api_key_type" NOT NULL,
	"permissions" "api_key_permissions",
	"env" "environment" NOT NULL,
	"prefix" text NOT NULL,
	"last4" varchar(4) NOT NULL,
	"public_key" text,
	"secret_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" uuid,
	CONSTRAINT "api_keys_material_check" CHECK (("api_keys"."type" = 'publishable' and "api_keys"."public_key" is not null and "api_keys"."secret_hash" is null)
        or ("api_keys"."type" = 'secret' and "api_keys"."public_key" is null and "api_keys"."secret_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" text,
	"logo_url" text,
	"receiving_address" varchar(42) NOT NULL,
	"receiving_address_source" "receiving_address_source" DEFAULT 'magic_default' NOT NULL,
	"live_activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_receiving_address_check" CHECK ("merchants"."receiving_address" ~ '^0x[0-9a-fA-F]{40}$')
);
--> statement-breakpoint
CREATE TABLE "quickstart_progress" (
	"merchant_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	"source" "quickstart_source" NOT NULL,
	CONSTRAINT "quickstart_progress_merchant_id_step_key_pk" PRIMARY KEY("merchant_id","step_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"magic_issuer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_rotated_from_id_api_keys_id_fk" FOREIGN KEY ("rotated_from_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickstart_progress" ADD CONSTRAINT "quickstart_progress_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_public_key_unique" ON "api_keys" USING btree ("public_key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_secret_hash_unique" ON "api_keys" USING btree ("secret_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_one_active_publishable_per_env" ON "api_keys" USING btree ("merchant_id","type","env") WHERE "api_keys"."revoked_at" is null and "api_keys"."type" = 'publishable';--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_user_id_unique" ON "merchants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_magic_issuer_unique" ON "users" USING btree ("magic_issuer");
