-- Brand rename: leash_sk_ -> agent_sk_. Existing issued keys embed the old
-- prefix in their hashed material, so they cannot authenticate under the new
-- scheme; remove them outright (pre-launch data, owners re-issue in the UI).
DELETE FROM "leash_keys";--> statement-breakpoint
ALTER TABLE "leash_keys" DROP CONSTRAINT "leash_keys_prefix_check";--> statement-breakpoint
ALTER TABLE "leash_keys" ADD CONSTRAINT "leash_keys_prefix_check" CHECK ("leash_keys"."prefix" = 'agent_sk_');
