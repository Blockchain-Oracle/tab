ALTER TABLE "payments" ADD COLUMN "verification_next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verification_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verification_lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "payments_verification_sweep_idx" ON "payments" USING btree ("env","status","reported_at","verification_next_attempt_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verification_lease_check" CHECK (("payments"."verification_lease_token" is null and "payments"."verification_lease_expires_at" is null)
        or ("payments"."verification_lease_token" is not null
          and "payments"."verification_lease_expires_at" is not null and "payments"."env" = 'live'
          and "payments"."status" = 'pending' and "payments"."reported_at" is not null
          and "payments"."reported_transaction_id" is not null and "payments"."payer_address" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verification_schedule_check" CHECK ("payments"."verification_next_attempt_at" is null
        or ("payments"."env" = 'live' and "payments"."reported_at" is not null));