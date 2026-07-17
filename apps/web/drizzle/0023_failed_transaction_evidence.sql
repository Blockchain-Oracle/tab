ALTER TABLE "receipts" DROP CONSTRAINT "receipts_state_check";--> statement-breakpoint
UPDATE "receipts"
SET "settlement_response" =
  (CASE WHEN jsonb_typeof("settlement_response") = 'object'
    THEN "settlement_response" ELSE '{}'::jsonb END)
  || jsonb_build_object('success', true, 'transaction', "tx_hash")
WHERE "status" = 'settled'
  AND NOT (("settlement_response" @> '{"success":true}'::jsonb
    AND "settlement_response"->>'transaction' = "tx_hash") IS TRUE);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_state_check" CHECK (("receipts"."status" = 'pending' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is null
          and "receipts"."settlement_response" is null and "receipts"."settled_at" is null)
        or ("receipts"."status" = 'settled' and "receipts"."reason" is null
          and "receipts"."intended_network" is null and "receipts"."tx_hash" is not null
          and "receipts"."settlement_response" is not null and "receipts"."settled_at" is not null
          and ("receipts"."settlement_response" @> '{"success":true}'::jsonb
            and "receipts"."settlement_response"->>'transaction' = "receipts"."tx_hash") is true)
        or ("receipts"."status" = 'failed' and "receipts"."reason" is not null
          and "receipts"."reason" ~ '[^[:space:]]' and "receipts"."intended_network" is null
          and "receipts"."settled_at" is null
          and (("receipts"."tx_hash" is null and "receipts"."settlement_response" is null)
            or ("receipts"."tx_hash" is not null and "receipts"."settlement_response" is not null
              and "receipts"."settlement_response" @> '{"success":false}'::jsonb
              and "receipts"."settlement_response"->>'transaction' = "receipts"."tx_hash") is true))
        or ("receipts"."status" = 'blocked' and "receipts"."reason" is not null
          and "receipts"."reason" ~ '[^[:space:]]' and "receipts"."intended_network" is not null
          and "receipts"."tx_hash" is null and "receipts"."settlement_response" is null
          and "receipts"."settled_at" is null));
