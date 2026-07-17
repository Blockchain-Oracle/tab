DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "receipts"
    GROUP BY "agent_id", lower("authorization_nonce")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot canonicalize receipts.authorization_nonce: case-insensitive authorization nonce collisions exist.',
      DETAIL = 'No receipt nonce evidence was changed.',
      HINT = 'Resolve the colliding receipt records explicitly, then rerun this migration.';
  END IF;
END
$migration$;--> statement-breakpoint
UPDATE "receipts"
SET "authorization_nonce" = lower("authorization_nonce")
WHERE "authorization_nonce" <> lower("authorization_nonce");--> statement-breakpoint
UPDATE "receipts"
SET "reason" = 'LEGACY_REASON_MISSING'
WHERE "status" IN ('failed', 'blocked')
  AND "reason" IS NULL;--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_authorization_check";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_state_check";--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_authorization_check" CHECK ("receipts"."authorization_nonce" ~ '^0x[0-9a-f]{64}$'
        and "receipts"."request_fingerprint" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_state_check" CHECK (("receipts"."status" = 'pending' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is null
          and "receipts"."settlement_response" is null and "receipts"."settled_at" is null)
        or ("receipts"."status" = 'settled' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is not null
          and "receipts"."settlement_response" is not null and "receipts"."settled_at" is not null)
        or ("receipts"."status" = 'failed' and "receipts"."reason" is not null
          and "receipts"."reason" ~ '[^[:space:]]' and "receipts"."intended_network" is null
          and "receipts"."tx_hash" is null and "receipts"."settlement_response" is null
          and "receipts"."settled_at" is null)
        or ("receipts"."status" = 'blocked' and "receipts"."reason" is not null
          and "receipts"."reason" ~ '[^[:space:]]' and "receipts"."intended_network" is not null
          and "receipts"."tx_hash" is null and "receipts"."settlement_response" is null
          and "receipts"."settled_at" is null));
