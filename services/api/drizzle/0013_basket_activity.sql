ALTER TABLE "basket_action" ADD COLUMN "operation_id" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ALTER COLUMN "expires_at" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "basket_action_user_operation_idx" ON "basket_action" ("user_id", "operation_id");
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "basket_slug" text;
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "basket_portfolio_id" text;
--> statement-breakpoint
CREATE INDEX "activity_basket_portfolio_idx" ON "activity" ("user_id", "basket_portfolio_id", "occurred_at");
