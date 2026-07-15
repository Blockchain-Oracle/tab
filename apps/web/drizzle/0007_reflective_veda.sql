ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_prefix_check" CHECK (("api_keys"."type" = 'publishable' and (
          ("api_keys"."env" = 'test' and "api_keys"."prefix" = 'pk_test_')
          or ("api_keys"."env" = 'live' and "api_keys"."prefix" = 'pk_live_')
        )) or ("api_keys"."type" = 'secret' and (
          ("api_keys"."env" = 'test' and "api_keys"."prefix" = 'sk_test_')
          or ("api_keys"."env" = 'live' and "api_keys"."prefix" = 'sk_live_')
        )));