CREATE TABLE "agent_signers" (
	"subject" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_nonce" text NOT NULL,
	"key_auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_signers_address_check" CHECK ("agent_signers"."address" ~ '^0x[0-9a-fA-F]{40}$'),
	CONSTRAINT "agent_signers_subject_check" CHECK ("agent_signers"."subject" ~ '^agent_[A-Za-z0-9_-]{20,}$')
);
