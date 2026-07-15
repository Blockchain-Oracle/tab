ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_public_key_prefix_check" CHECK ("api_keys"."type" = 'secret' or (
        left("api_keys"."public_key", length("api_keys"."prefix")) = "api_keys"."prefix"
        and "api_keys"."public_key" ~ '^pk_(test|live)_[A-Za-z0-9_-]+$'
      ));
