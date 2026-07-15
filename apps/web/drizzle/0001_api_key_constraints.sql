ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_material_check";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_permissions_check" CHECK (("api_keys"."type" = 'publishable' and "api_keys"."permissions" is null)
        or ("api_keys"."type" = 'secret' and "api_keys"."permissions" is not null));--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_material_check" CHECK (("api_keys"."type" = 'publishable' and "api_keys"."public_key" is not null and "api_keys"."secret_hash" is null)
        or ("api_keys"."type" = 'secret' and "api_keys"."public_key" is null and "api_keys"."secret_hash" ~ '^[0-9a-f]{64}$'));