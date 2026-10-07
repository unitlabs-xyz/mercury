-- One basket baseline for fresh databases. The conditional additions also bring
-- databases that already ran the former 0012-0015 migrations to this baseline.
CREATE TABLE IF NOT EXISTS "basket_action" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "owner_account_id" text NOT NULL,
  "strategy_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "portfolio_id" text,
  "operation_id" text,
  "nonce" text,
  "submitted_at" timestamp with time zone,
  "reconciliation_state" text,
  "reconcile_after" timestamp with time zone,
  "reconcile_attempts" integer DEFAULT 0 NOT NULL,
  "resolved_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "operation_id" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "nonce" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "reconciliation_state" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "reconcile_after" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "reconcile_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "basket_action" ALTER COLUMN "expires_at" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "basket_action_user_created_idx" ON "basket_action" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "basket_action_user_operation_idx" ON "basket_action" ("user_id", "operation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "basket_action_nonce_idx" ON "basket_action" ("nonce");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "basket_action_reconcile_idx" ON "basket_action" ("reconciliation_state", "reconcile_after");
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "basket_slug" text;
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "basket_portfolio_id" text;
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "token_quantity" numeric(38, 18);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_basket_portfolio_idx" ON "activity" ("user_id", "basket_portfolio_id", "occurred_at");
