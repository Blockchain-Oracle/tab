ALTER TABLE "merchants" DROP CONSTRAINT "merchants_receiving_address_check";--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_receiving_address_check" CHECK ("merchants"."receiving_address" ~ '^0x[0-9a-fA-F]{40}$'
        and lower("merchants"."receiving_address") <> '0x0000000000000000000000000000000000000000');
