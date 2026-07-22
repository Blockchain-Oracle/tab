ALTER TABLE "payments" DROP CONSTRAINT "payments_token_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_chain_check";--> statement-breakpoint
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_simulation_check";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_chain_check" CHECK (("payments"."token_chain_id" = 42161 and lower("payments"."token_address") = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')
        or ("payments"."token_chain_id" = 84532 and lower("payments"."token_address") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'));--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_simulation_check" CHECK (("settlements"."verification_method" = 'simulated_test' and not "settlements"."livemode")
        or "settlements"."verification_method" = 'rpc'
        or ("settlements"."verification_method" <> 'simulated_test' and "settlements"."livemode"));