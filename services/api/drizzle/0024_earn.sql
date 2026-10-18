CREATE TABLE "earn_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"usdc_amount" numeric(38, 18) NOT NULL,
	"vault" text NOT NULL,
	"tx_signature" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "earn_on" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "earn_event" ADD CONSTRAINT "earn_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earn_event_user_idx" ON "earn_event" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "earn_event_signature_idx" ON "earn_event" USING btree ("tx_signature");