ALTER TABLE "payments" ADD CONSTRAINT "payments_ref_merchant_env_unique" UNIQUE("ref_code","merchant_id","env");--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"env" "environment" NOT NULL,
	"order_number" text NOT NULL,
	"payment_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_check" CHECK ("orders"."order_number" ~ '[^[:space:]]'),
	CONSTRAINT "orders_payment_ref_check" CHECK ("orders"."payment_ref" ~ '^TAB-[A-Z0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_merchant_env_fk" FOREIGN KEY ("payment_ref","merchant_id","env") REFERENCES "public"."payments"("ref_code","merchant_id","env") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_ref_unique" ON "orders" USING btree ("payment_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_merchant_env_number_unique" ON "orders" USING btree ("merchant_id","env","order_number");
