CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_result" AS ENUM('pending', 'delivered', 'retrying', 'failed', 'timeout', 'gave_up');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_trigger" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_type" AS ENUM('payment', 'test');--> statement-breakpoint
CREATE TYPE "public"."webhook_failure_kind" AS ENUM('http', 'network', 'timeout', 'configuration');--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"env" "environment" NOT NULL,
	"payment_id" uuid,
	"settlement_id" uuid,
	"event_id" text NOT NULL,
	"retry_chain_id" uuid NOT NULL,
	"request_body" text NOT NULL,
	"request_body_hash" varchar(64) GENERATED ALWAYS AS (encode(digest("webhook_deliveries"."request_body", 'sha256'), 'hex')) STORED NOT NULL,
	"type" "webhook_delivery_type" NOT NULL,
	"trigger" "webhook_delivery_trigger" NOT NULL,
	"attempt" integer NOT NULL,
	"result" "webhook_delivery_result" DEFAULT 'pending' NOT NULL,
	"failure_kind" "webhook_failure_kind",
	"signature_header" text,
	"status_code" integer,
	"response_body_snippet" varchar(500),
	"response_time_ms" integer,
	"next_retry_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"parent_delivery_id" uuid,
	"parent_attempt" integer,
	"superseded_by_id" uuid,
	"superseded_by_attempt" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_id_chain_scope_unique" UNIQUE("id","endpoint_id","merchant_id","env","event_id","request_body_hash","type","trigger"),
	CONSTRAINT "webhook_deliveries_id_tenant_unique" UNIQUE("id","merchant_id","env"),
	CONSTRAINT "webhook_deliveries_id_event_scope_unique" UNIQUE("id","endpoint_id","merchant_id","env","event_id","request_body_hash","type"),
	CONSTRAINT "webhook_deliveries_id_evidence_unique" UNIQUE("id","payment_id","settlement_id"),
	CONSTRAINT "webhook_deliveries_id_retry_attempt_unique" UNIQUE("id","retry_chain_id","attempt"),
	CONSTRAINT "webhook_deliveries_id_parent_chain_attempt_unique" UNIQUE("id","parent_delivery_id","retry_chain_id","attempt"),
	CONSTRAINT "webhook_deliveries_event_id_check" CHECK ("webhook_deliveries"."event_id" ~ '^evt_[A-Za-z0-9_-]+$'),
	CONSTRAINT "webhook_deliveries_body_hash_check" CHECK ("webhook_deliveries"."request_body_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "webhook_deliveries_chain_root_check" CHECK ((("webhook_deliveries"."attempt" = 1 and "webhook_deliveries"."retry_chain_id" = "webhook_deliveries"."id"
          and "webhook_deliveries"."parent_attempt" is null)
        or ("webhook_deliveries"."attempt" > 1 and "webhook_deliveries"."retry_chain_id" <> "webhook_deliveries"."id"
          and "webhook_deliveries"."parent_delivery_id" is not null
          and "webhook_deliveries"."parent_attempt" = "webhook_deliveries"."attempt" - 1))
        and ("webhook_deliveries"."parent_delivery_id" is null or "webhook_deliveries"."parent_delivery_id" <> "webhook_deliveries"."id")),
	CONSTRAINT "webhook_deliveries_attempt_check" CHECK ("webhook_deliveries"."attempt" between 1 and 3),
	CONSTRAINT "webhook_deliveries_type_check" CHECK (("webhook_deliveries"."type" = 'payment' and "webhook_deliveries"."payment_id" is not null
          and "webhook_deliveries"."settlement_id" is not null)
        or ("webhook_deliveries"."type" = 'test' and "webhook_deliveries"."payment_id" is null
          and "webhook_deliveries"."settlement_id" is null)),
	CONSTRAINT "webhook_deliveries_status_code_check" CHECK ("webhook_deliveries"."status_code" is null or "webhook_deliveries"."status_code" between 100 and 599),
	CONSTRAINT "webhook_deliveries_response_time_check" CHECK ("webhook_deliveries"."response_time_ms" is null or "webhook_deliveries"."response_time_ms" >= 0),
	CONSTRAINT "webhook_deliveries_signature_check" CHECK ("webhook_deliveries"."signature_header" is null
        or "webhook_deliveries"."signature_header" ~ '^t=[0-9]+,v1=[0-9a-f]{64}$'),
	CONSTRAINT "webhook_deliveries_lease_check" CHECK (("webhook_deliveries"."lease_token" is null and "webhook_deliveries"."lease_expires_at" is null)
        or ("webhook_deliveries"."lease_token" is not null and "webhook_deliveries"."lease_expires_at" is not null)),
	CONSTRAINT "webhook_deliveries_successor_check" CHECK (("webhook_deliveries"."superseded_by_id" is null and "webhook_deliveries"."superseded_by_attempt" is null)
        or ("webhook_deliveries"."superseded_by_id" is not null
          and "webhook_deliveries"."superseded_by_id" <> "webhook_deliveries"."id"
          and "webhook_deliveries"."superseded_by_attempt" = "webhook_deliveries"."attempt" + 1
          and "webhook_deliveries"."superseded_by_attempt" between 2 and 3)),
	CONSTRAINT "webhook_deliveries_result_check" CHECK (coalesce((("webhook_deliveries"."result" = 'pending' and "webhook_deliveries"."completed_at" is null
          and "webhook_deliveries"."failure_kind" is null and "webhook_deliveries"."next_retry_at" is null
          and "webhook_deliveries"."status_code" is null and "webhook_deliveries"."response_time_ms" is null
          and "webhook_deliveries"."response_body_snippet" is null and "webhook_deliveries"."superseded_by_id" is null)
        or ("webhook_deliveries"."result" = 'delivered' and "webhook_deliveries"."completed_at" is not null
          and "webhook_deliveries"."failure_kind" is null and "webhook_deliveries"."next_retry_at" is null
          and "webhook_deliveries"."status_code" between 200 and 299
          and "webhook_deliveries"."signature_header" is not null and "webhook_deliveries"."started_at" is not null
          and "webhook_deliveries"."response_time_ms" is not null and "webhook_deliveries"."lease_token" is null
          and "webhook_deliveries"."lease_expires_at" is null and "webhook_deliveries"."superseded_by_id" is null)
        or ("webhook_deliveries"."result" = 'retrying' and "webhook_deliveries"."completed_at" is not null
          and "webhook_deliveries"."failure_kind" in ('http', 'network', 'timeout')
          and "webhook_deliveries"."next_retry_at" is not null and "webhook_deliveries"."attempt" < 3
          and "webhook_deliveries"."signature_header" is not null and "webhook_deliveries"."started_at" is not null
          and "webhook_deliveries"."response_time_ms" is not null and "webhook_deliveries"."lease_token" is null
          and "webhook_deliveries"."lease_expires_at" is null and "webhook_deliveries"."superseded_by_id" is null
          and (("webhook_deliveries"."failure_kind" = 'http' and ("webhook_deliveries"."status_code" < 200
              or "webhook_deliveries"."status_code" > 299))
            or ("webhook_deliveries"."failure_kind" in ('network', 'timeout') and "webhook_deliveries"."status_code" is null)))
        or ("webhook_deliveries"."result" in ('failed', 'timeout') and "webhook_deliveries"."attempt" < 3
          and "webhook_deliveries"."completed_at" is not null and "webhook_deliveries"."next_retry_at" is null
          and "webhook_deliveries"."signature_header" is not null and "webhook_deliveries"."started_at" is not null
          and "webhook_deliveries"."response_time_ms" is not null and "webhook_deliveries"."lease_token" is null
          and "webhook_deliveries"."lease_expires_at" is null and "webhook_deliveries"."superseded_by_id" is not null
          and (("webhook_deliveries"."result" = 'failed' and "webhook_deliveries"."failure_kind" in ('http', 'network'))
            or ("webhook_deliveries"."result" = 'timeout' and "webhook_deliveries"."failure_kind" = 'timeout'))
          and (("webhook_deliveries"."failure_kind" = 'http' and ("webhook_deliveries"."status_code" < 200
              or "webhook_deliveries"."status_code" > 299))
            or ("webhook_deliveries"."failure_kind" in ('network', 'timeout') and "webhook_deliveries"."status_code" is null)))
        or ("webhook_deliveries"."result" = 'failed' and "webhook_deliveries"."failure_kind" = 'configuration'
          and "webhook_deliveries"."completed_at" is not null and "webhook_deliveries"."next_retry_at" is null
          and "webhook_deliveries"."signature_header" is null and "webhook_deliveries"."status_code" is null
          and "webhook_deliveries"."response_time_ms" is null and "webhook_deliveries"."lease_token" is null
          and "webhook_deliveries"."lease_expires_at" is null and "webhook_deliveries"."superseded_by_id" is null)
        or ("webhook_deliveries"."result" = 'gave_up' and "webhook_deliveries"."attempt" = 3
          and "webhook_deliveries"."completed_at" is not null
          and "webhook_deliveries"."failure_kind" in ('http', 'network', 'timeout')
          and "webhook_deliveries"."next_retry_at" is null and "webhook_deliveries"."signature_header" is not null
          and "webhook_deliveries"."started_at" is not null and "webhook_deliveries"."response_time_ms" is not null
          and "webhook_deliveries"."lease_token" is null and "webhook_deliveries"."lease_expires_at" is null
          and "webhook_deliveries"."superseded_by_id" is null
          and (("webhook_deliveries"."failure_kind" = 'http' and ("webhook_deliveries"."status_code" < 200
              or "webhook_deliveries"."status_code" > 299))
            or ("webhook_deliveries"."failure_kind" in ('network', 'timeout') and "webhook_deliveries"."status_code" is null)))), false))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"env" "environment" NOT NULL,
	"url" text NOT NULL,
	"secret_ciphertext" text,
	"secret_nonce" varchar(16),
	"secret_auth_tag" varchar(22),
	"secret_key_version" integer,
	"secret_last4" varchar(4) NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "webhook_endpoints_id_scope_unique" UNIQUE("id","merchant_id","env"),
	CONSTRAINT "webhook_endpoints_url_check" CHECK (char_length(btrim("webhook_endpoints"."url")) between 1 and 2048
        and ("webhook_endpoints"."url" ~ '^https://[^/?#[:space:]@]+([:/?#]|$)'
          or ("webhook_endpoints"."env" = 'test'
            and "webhook_endpoints"."url" ~ '^http://(127\.0\.0\.1|\[::1\]|localhost)(:[0-9]+)?/'))
        and "webhook_endpoints"."url" !~* '^https://(localhost\.?|127(\.[0-9]{1,3}){3}|10(\.[0-9]{1,3}){3}|192\.168(\.[0-9]{1,3}){2}|169\.254(\.[0-9]{1,3}){2}|172\.(1[6-9]|2[0-9]|3[01])(\.[0-9]{1,3}){2}|\[(::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)\])([:/?#]|$)'),
	CONSTRAINT "webhook_endpoints_last4_check" CHECK (char_length("webhook_endpoints"."secret_last4") = 4),
	CONSTRAINT "webhook_endpoints_secret_envelope_check" CHECK (coalesce((("webhook_endpoints"."deleted_at" is null
          and "webhook_endpoints"."secret_ciphertext" is not null
          and char_length("webhook_endpoints"."secret_ciphertext") > 0
          and "webhook_endpoints"."secret_nonce" is not null
          and "webhook_endpoints"."secret_nonce" ~ '^[A-Za-z0-9_-]{16}$'
          and "webhook_endpoints"."secret_auth_tag" is not null
          and "webhook_endpoints"."secret_auth_tag" ~ '^[A-Za-z0-9_-]{22}$'
          and "webhook_endpoints"."secret_key_version" is not null
          and "webhook_endpoints"."secret_key_version" > 0)
        or ("webhook_endpoints"."deleted_at" is not null
          and "webhook_endpoints"."secret_ciphertext" is null and "webhook_endpoints"."secret_nonce" is null
          and "webhook_endpoints"."secret_auth_tag" is null and "webhook_endpoints"."secret_key_version" is null)), false))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_id_merchant_env_unique" UNIQUE("id","merchant_id","env");--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_id_payment_unique" UNIQUE("id","payment_id");--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_scope_fk" FOREIGN KEY ("endpoint_id","merchant_id","env") REFERENCES "public"."webhook_endpoints"("id","merchant_id","env") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_payment_scope_fk" FOREIGN KEY ("payment_id","merchant_id","env") REFERENCES "public"."payments"("id","merchant_id","env") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_settlement_payment_fk" FOREIGN KEY ("settlement_id","payment_id") REFERENCES "public"."settlements"("id","payment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_chain_scope_fk" FOREIGN KEY ("retry_chain_id","endpoint_id","merchant_id","env","event_id","request_body_hash","type","trigger") REFERENCES "public"."webhook_deliveries"("id","endpoint_id","merchant_id","env","event_id","request_body_hash","type","trigger") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_chain_evidence_fk" FOREIGN KEY ("retry_chain_id","payment_id","settlement_id") REFERENCES "public"."webhook_deliveries"("id","payment_id","settlement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_parent_scope_fk" FOREIGN KEY ("parent_delivery_id","endpoint_id","merchant_id","env","event_id","request_body_hash","type") REFERENCES "public"."webhook_deliveries"("id","endpoint_id","merchant_id","env","event_id","request_body_hash","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_parent_evidence_fk" FOREIGN KEY ("parent_delivery_id","payment_id","settlement_id") REFERENCES "public"."webhook_deliveries"("id","payment_id","settlement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_parent_sequence_fk" FOREIGN KEY ("parent_delivery_id","retry_chain_id","parent_attempt") REFERENCES "public"."webhook_deliveries"("id","retry_chain_id","attempt") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_successor_scope_fk" FOREIGN KEY ("superseded_by_id","id","retry_chain_id","superseded_by_attempt") REFERENCES "public"."webhook_deliveries"("id","parent_delivery_id","retry_chain_id","attempt") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_chain_attempt_unique" ON "webhook_deliveries" USING btree ("retry_chain_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_automatic_settlement_root_unique" ON "webhook_deliveries" USING btree ("endpoint_id","settlement_id") WHERE "webhook_deliveries"."trigger" = 'auto' and "webhook_deliveries"."type" = 'payment' and "webhook_deliveries"."attempt" = 1;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("result","next_retry_at","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_idx" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_one_active_per_env" ON "webhook_endpoints" USING btree ("merchant_id","env") WHERE "webhook_endpoints"."deleted_at" is null;
