ALTER TABLE "receipts" ADD COLUMN "cap_atomic_at_attempt" numeric;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "committed_atomic_before" numeric;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cap_context_check" CHECK (("receipts"."cap_atomic_at_attempt" is null and "receipts"."committed_atomic_before" is null)
        or ("receipts"."cap_atomic_at_attempt" is not null and "receipts"."committed_atomic_before" is not null
          and "receipts"."cap_atomic_at_attempt" > 0
          and "receipts"."cap_atomic_at_attempt" = trunc("receipts"."cap_atomic_at_attempt")
          and "receipts"."committed_atomic_before" >= 0
          and "receipts"."committed_atomic_before" = trunc("receipts"."committed_atomic_before")));
