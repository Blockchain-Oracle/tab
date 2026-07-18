ALTER TABLE "receipts" DROP CONSTRAINT "receipts_signing_claim_check";--> statement-breakpoint
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
        or ("receipts"."status" in ('pending', 'settled', 'failed')
          and "receipts"."signing_claim_token" is null
          and "receipts"."signing_claimed_at" is null
          and "receipts"."signing_lease_expires_at" is null
          and "receipts"."signing_digest" ~ '^0x[0-9a-f]{64}$'
          and "receipts"."signing_signature" ~ '^0x[0-9a-fA-F]{130}$'
          and "receipts"."signed_at" is not null)
      ));