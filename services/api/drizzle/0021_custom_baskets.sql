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
CREATE TABLE "custom_basket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"assets" jsonb NOT NULL,
	"glider_strategy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "custom_basket" ADD CONSTRAINT "custom_basket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "basket_asset_ticker_idx" ON "basket_asset" USING btree ("ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_basket_slug_idx" ON "custom_basket" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "custom_basket_user_idx" ON "custom_basket" USING btree ("user_id");