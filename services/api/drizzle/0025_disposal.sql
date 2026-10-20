CREATE TABLE "disposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"token_qty" bigint NOT NULL,
	"shares" numeric(38, 18) NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lot" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "disposal" ADD CONSTRAINT "disposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal" ADD CONSTRAINT "disposal_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal" ADD CONSTRAINT "disposal_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposal_user_token_idx" ON "disposal" USING btree ("user_id","token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disposal_order_idx" ON "disposal" USING btree ("order_id");