CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"amount_usd" numeric(38, 18),
	"ref_table" text,
	"ref_id" uuid,
	"tx_signature" text
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"description" text,
	"logo_url" text,
	"is_tradable" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"token_qty" bigint NOT NULL,
	"shares" numeric(38, 18) NOT NULL,
	"unit_cost_usd" numeric(38, 18) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"order_id" uuid
);
--> statement-breakpoint
CREATE TABLE "multiplier_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"old_multiplier" numeric(38, 18) NOT NULL,
	"new_multiplier" numeric(38, 18) NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"side" text NOT NULL,
	"usd_amount" numeric(38, 18) NOT NULL,
	"decision" jsonb NOT NULL,
	"chosen_token_id" uuid,
	"reference_price" numeric(38, 18),
	"premium_pct" numeric(38, 18),
	"status" text NOT NULL,
	"tx_signature" text,
	"trigger_order_account" text,
	"filled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position" (
	"user_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"shares" numeric(38, 18) NOT NULL,
	"cost_basis_usd" numeric(38, 18) NOT NULL,
	"avg_unit_cost_usd" numeric(38, 18) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_user_id_instrument_id_pk" PRIMARY KEY("user_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"mint" text NOT NULL,
	"issuer" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"multiplier" numeric(38, 18) DEFAULT '1' NOT NULL,
	"multiplier_updated_at" timestamp with time zone,
	"is_routable" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplier_event" ADD CONSTRAINT "multiplier_event_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_chosen_token_id_token_id_fk" FOREIGN KEY ("chosen_token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_occurred_idx" ON "activity" USING btree ("user_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_ticker_idx" ON "instrument" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "lot_user_token_idx" ON "lot" USING btree ("user_id","token_id");--> statement-breakpoint
CREATE INDEX "multiplier_event_token_idx" ON "multiplier_event" USING btree ("token_id","observed_at");--> statement-breakpoint
CREATE INDEX "order_user_created_idx" ON "order" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_tx_signature_idx" ON "order" USING btree ("tx_signature");--> statement-breakpoint
CREATE UNIQUE INDEX "token_mint_idx" ON "token" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "token_instrument_idx" ON "token" USING btree ("instrument_id");