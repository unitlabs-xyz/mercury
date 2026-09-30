CREATE TABLE "loan_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"usd_amount" numeric(38, 18),
	"ticker" text,
	"tokens_raw" text,
	"borrow_apy" numeric(38, 18),
	"debt_after_usd" numeric(38, 18) NOT NULL,
	"collateral_after_usd" numeric(38, 18) NOT NULL,
	"tx_signature" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_event" ADD CONSTRAINT "loan_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_event_user_occurred_idx" ON "loan_event" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_event_signature_kind_idx" ON "loan_event" USING btree ("user_id","tx_signature","kind");