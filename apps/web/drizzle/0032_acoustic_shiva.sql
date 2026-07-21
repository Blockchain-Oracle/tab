CREATE TABLE "onboarding_progress" (
	"owner_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	"source" "quickstart_source" NOT NULL,
	CONSTRAINT "onboarding_progress_owner_id_step_key_pk" PRIMARY KEY("owner_id","step_key")
);
--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;