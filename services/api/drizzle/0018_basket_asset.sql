CREATE TABLE "basket_asset" (
	"mint" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"logo_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "basket_asset_ticker_idx" ON "basket_asset" USING btree ("ticker");