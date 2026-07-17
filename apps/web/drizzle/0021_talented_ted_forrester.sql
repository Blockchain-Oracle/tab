ALTER TABLE "agents" DROP CONSTRAINT "agents_signer_subject_check";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "signer_subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "signer_subject_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "credential_destroyed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "agents"
SET
  "signer_subject" = null,
  "signer_subject_revoked_at" = greatest("created_at", transaction_timestamp()),
  "credential_destroyed_at" = case
    when "status" = 'nuked' then greatest("created_at", transaction_timestamp())
    else null
  end
WHERE "status" in ('cancelled', 'nuked');--> statement-breakpoint
UPDATE "leash_keys" AS "leash_key"
SET "revoked_at" = greatest("leash_key"."created_at", "agent"."signer_subject_revoked_at")
FROM "agents" AS "agent"
WHERE "leash_key"."agent_id" = "agent"."id"
  AND "agent"."status" = 'cancelled'
  AND "leash_key"."revoked_at" IS NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "leash_keys" AS "survivor_key"
    JOIN "leash_keys" AS "destroyed_key"
      ON "destroyed_key"."id" = "survivor_key"."rotated_from_id"
    JOIN "agents" AS "destroyed_agent"
      ON "destroyed_agent"."id" = "destroyed_key"."agent_id"
    JOIN "agents" AS "survivor_agent"
      ON "survivor_agent"."id" = "survivor_key"."agent_id"
    WHERE "destroyed_agent"."status" = 'nuked'
      AND "survivor_agent"."status" <> 'nuked'
  ) THEN
    RAISE EXCEPTION 'cannot destroy legacy nuclear keys referenced by a surviving agent'
      USING ERRCODE = '23503';
  END IF;
END;
$$;--> statement-breakpoint
DELETE FROM "leash_keys" AS "leash_key"
USING "agents" AS "agent"
WHERE "leash_key"."agent_id" = "agent"."id"
  AND "agent"."status" = 'nuked';--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_credential_lifecycle_check" CHECK ((
        ("agents"."status" in ('provisioned', 'paused', 'frozen')
          and "agents"."signer_subject" is not null
          and "agents"."signer_subject_revoked_at" is null
          and "agents"."credential_destroyed_at" is null)
        or ("agents"."status" = 'cancelled'
          and "agents"."signer_subject" is null
          and "agents"."signer_subject_revoked_at" is not null
          and "agents"."credential_destroyed_at" is null)
        or ("agents"."status" = 'nuked'
          and "agents"."signer_subject" is null
          and "agents"."signer_subject_revoked_at" is not null
          and "agents"."credential_destroyed_at" is not null
          and "agents"."credential_destroyed_at" >= "agents"."signer_subject_revoked_at")
      ) and ("agents"."signer_subject_revoked_at" is null
        or "agents"."signer_subject_revoked_at" >= "agents"."created_at"));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_signer_subject_check" CHECK ("agents"."signer_subject" is null or "agents"."signer_subject" ~ '[^[:space:]]');--> statement-breakpoint
CREATE FUNCTION "prevent_nuked_agent_reactivation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'nuked' AND (
    NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."signer_subject" IS DISTINCT FROM OLD."signer_subject"
    OR NEW."signer_subject_revoked_at" IS DISTINCT FROM OLD."signer_subject_revoked_at"
    OR NEW."credential_destroyed_at" IS DISTINCT FROM OLD."credential_destroyed_at"
    OR NEW."agent_address" IS DISTINCT FROM OLD."agent_address"
  ) THEN
    RAISE EXCEPTION 'nuked agent credential tombstone is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agents_nuked_tombstone_guard"
BEFORE UPDATE OF "status", "signer_subject", "signer_subject_revoked_at", "credential_destroyed_at", "agent_address"
ON "agents"
FOR EACH ROW
WHEN (OLD."status" = 'nuked')
EXECUTE FUNCTION "prevent_nuked_agent_reactivation"();
