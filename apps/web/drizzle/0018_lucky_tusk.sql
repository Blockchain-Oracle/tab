ALTER TABLE "notifications" DROP CONSTRAINT "notifications_resource_host_check";--> statement-breakpoint
DROP INDEX "notifications_unusual_domain_unique";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resource_key" text;--> statement-breakpoint
UPDATE "notifications" AS "notification"
SET "resource_key" = encode(
  sha256(
    convert_to(
      CASE
        WHEN "receipt"."resource_url" LIKE 'mcp://%'
          THEN 'mcp-resource:' || "receipt"."resource_url"
        ELSE 'http-host:' || "notification"."resource_host"
      END,
      'UTF8'
    )
  ),
  'hex'
)
FROM "receipts" AS "receipt"
WHERE "notification"."type" = 'unusual_domain'
  AND "notification"."receipt_id" = "receipt"."id";--> statement-breakpoint
UPDATE "notifications"
SET "resource_key" = encode(
  sha256(convert_to('http-host:' || "resource_host", 'UTF8')),
  'hex'
)
WHERE "type" = 'unusual_domain' AND "resource_key" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unusual_resource_unique" ON "notifications" USING btree ("agent_id","resource_key") WHERE "notifications"."type" = 'unusual_domain';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resource_identity_check" CHECK (("notifications"."type" = 'unusual_domain' and "notifications"."resource_host" is not null
          and char_length("notifications"."resource_host") between 1 and 253
          and "notifications"."resource_host" = lower("notifications"."resource_host")
          and "notifications"."resource_host" = btrim("notifications"."resource_host")
          and "notifications"."resource_host" !~ '[/?#@[:space:]]'
          and "notifications"."resource_key" is not null
          and "notifications"."resource_key" ~ '^[0-9a-f]{64}$')
        or ("notifications"."type" <> 'unusual_domain'
          and "notifications"."resource_host" is null and "notifications"."resource_key" is null));
