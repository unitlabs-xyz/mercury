CREATE TABLE "funding_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"relay_request_id" text NOT NULL,
	"deposit_address" text NOT NULL,
	"origin_chain_id" integer NOT NULL,
	"origin_currency" text NOT NULL,
	"recipient_address" text NOT NULL,
	"quoted_out_raw" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"in_tx_hash" text,
	"out_tx_hash" text,
	"fail_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funding_intent" ADD CONSTRAINT "funding_intent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funding_intent_user_created_idx" ON "funding_intent" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "funding_intent_deposit_address_idx" ON "funding_intent" USING btree ("deposit_address");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_intent_address_in_tx_idx" ON "funding_intent" USING btree ("deposit_address","in_tx_hash");