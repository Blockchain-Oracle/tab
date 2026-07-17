CREATE TYPE "public"."notification_tier" AS ENUM('2', '3');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('cap_75', 'cap_blocked', 'unusual_domain', 'cap_lowered_halt', 'float_low', 'float_empty');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"receipt_id" uuid,
	"tier" "notification_tier" NOT NULL,
	"type" "notification_type" NOT NULL,
	"event_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resource_host" text,
	"sticky" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_tier_type_check" CHECK (("notifications"."tier" = '2'
          and "notifications"."type" in ('cap_75', 'unusual_domain', 'float_low', 'float_empty'))
        or ("notifications"."tier" = '3'
          and "notifications"."type" in ('cap_blocked', 'cap_lowered_halt'))),
	CONSTRAINT "notifications_sticky_check" CHECK (("notifications"."tier" = '2' and not "notifications"."sticky" and "notifications"."resolved_at" is null)
        or ("notifications"."tier" = '3' and "notifications"."sticky")),
	CONSTRAINT "notifications_resource_host_check" CHECK (("notifications"."type" = 'unusual_domain' and "notifications"."resource_host" is not null
          and char_length("notifications"."resource_host") between 1 and 253
          and "notifications"."resource_host" = lower("notifications"."resource_host")
          and "notifications"."resource_host" = btrim("notifications"."resource_host")
          and "notifications"."resource_host" !~ '[/?#@[:space:]]')
        or ("notifications"."type" <> 'unusual_domain' and "notifications"."resource_host" is null)),
	CONSTRAINT "notifications_event_key_check" CHECK (char_length(btrim("notifications"."event_key")) between 1 and 300),
	CONSTRAINT "notifications_metadata_check" CHECK (jsonb_typeof("notifications"."metadata") = 'object'),
	CONSTRAINT "notifications_timestamps_check" CHECK (("notifications"."read_at" is null or "notifications"."read_at" >= "notifications"."created_at")
        and ("notifications"."resolved_at" is null or "notifications"."resolved_at" >= "notifications"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_check" CHECK (char_length("push_subscriptions"."endpoint") between 1 and 2048
        and "push_subscriptions"."endpoint" ~ '^https://[^[:space:]]+$'),
	CONSTRAINT "push_subscriptions_keys_check" CHECK (char_length(btrim("push_subscriptions"."p256dh")) between 1 and 512
        and char_length(btrim("push_subscriptions"."auth")) between 1 and 512),
	CONSTRAINT "push_subscriptions_revoked_at_check" CHECK ("push_subscriptions"."revoked_at" is null or "push_subscriptions"."revoked_at" >= "push_subscriptions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "resource_url" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "resource_host" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_id_cycle_agent_unique" UNIQUE("id","cycle_id","agent_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cycle_agent_fk" FOREIGN KEY ("cycle_id","agent_id") REFERENCES "public"."cap_cycles"("id","agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receipt_cycle_agent_fk" FOREIGN KEY ("receipt_id","cycle_id","agent_id") REFERENCES "public"."receipts"("id","cycle_id","agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_agent_event_key_unique" ON "notifications" USING btree ("agent_id","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_cap_75_cycle_unique" ON "notifications" USING btree ("agent_id","cycle_id") WHERE "notifications"."type" = 'cap_75';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unusual_domain_unique" ON "notifications" USING btree ("agent_id","resource_host") WHERE "notifications"."type" = 'unusual_domain';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_one_active_cap_halt" ON "notifications" USING btree ("agent_id") WHERE "notifications"."resolved_at" is null
          and "notifications"."type" in ('cap_blocked', 'cap_lowered_halt');--> statement-breakpoint
CREATE INDEX "notifications_agent_created_idx" ON "notifications" USING btree ("agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_agent_unread_idx" ON "notifications" USING btree ("agent_id","created_at" DESC NULLS LAST) WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_receipt_idx" ON "notifications" USING btree ("receipt_id") WHERE "notifications"."receipt_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner_active_idx" ON "push_subscriptions" USING btree ("owner_id","created_at" DESC NULLS LAST) WHERE "push_subscriptions"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_resource_check" CHECK (("receipts"."resource_url" is null and "receipts"."resource_host" is null)
        or ("receipts"."resource_url" is not null and "receipts"."resource_host" is not null
          and char_length("receipts"."resource_url") between 1 and 2048
          and "receipts"."resource_url" ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
          and char_length("receipts"."resource_host") between 1 and 253
          and "receipts"."resource_host" = lower("receipts"."resource_host")
          and "receipts"."resource_host" = btrim("receipts"."resource_host")
          and "receipts"."resource_host" !~ '[/?#@[:space:]]'));
