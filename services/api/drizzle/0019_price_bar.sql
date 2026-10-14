CREATE TABLE "price_bar" (
	"token_id" uuid NOT NULL,
	"width" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"market_open" numeric(38, 18) NOT NULL,
	"market_high" numeric(38, 18) NOT NULL,
	"market_low" numeric(38, 18) NOT NULL,
	"market_close" numeric(38, 18) NOT NULL,
	"reference_open" numeric(38, 18),
	"reference_high" numeric(38, 18),
	"reference_low" numeric(38, 18),
	"reference_close" numeric(38, 18),
	"multiplier" numeric(38, 18) NOT NULL,
	"liquidity_usd" numeric(38, 18) NOT NULL,
	"samples" integer NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_bar_token_id_width_bucket_start_pk" PRIMARY KEY("token_id","width","bucket_start")
);
--> statement-breakpoint
ALTER TABLE "price_bar" ADD CONSTRAINT "price_bar_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_bar_width_bucket_idx" ON "price_bar" USING btree ("width","bucket_start");