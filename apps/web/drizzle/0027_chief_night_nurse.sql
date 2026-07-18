CREATE TABLE "agent_provision_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_provision_attempts" ADD CONSTRAINT "agent_provision_attempts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_provision_attempts_owner_created_idx" ON "agent_provision_attempts" USING btree ("owner_id","created_at" DESC NULLS LAST);