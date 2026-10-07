ALTER TABLE "basket_action" ADD COLUMN "nonce" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN "reconciliation_state" text;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN "reconcile_after" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN "reconcile_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "basket_action" ADD COLUMN "resolved_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "basket_action_nonce_idx" ON "basket_action" ("nonce");
--> statement-breakpoint
CREATE INDEX "basket_action_reconcile_idx" ON "basket_action" ("reconciliation_state", "reconcile_after");
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "token_quantity" numeric(38, 18);
