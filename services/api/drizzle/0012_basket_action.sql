CREATE TABLE "basket_action" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "owner_account_id" text NOT NULL,
  "strategy_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "portfolio_id" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "basket_action_user_created_idx" ON "basket_action" USING btree ("user_id", "created_at");
