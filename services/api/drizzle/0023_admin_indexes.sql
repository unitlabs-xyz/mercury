CREATE INDEX "activity_occurred_kind_idx" ON "activity" USING btree ("occurred_at","kind");--> statement-breakpoint
CREATE INDEX "funding_intent_created_chain_idx" ON "funding_intent" USING btree ("created_at","origin_chain_name","status");--> statement-breakpoint
CREATE INDEX "order_created_status_idx" ON "order" USING btree ("created_at","status");--> statement-breakpoint
CREATE INDEX "portfolio_snapshot_captured_idx" ON "portfolio_snapshot" USING btree ("captured_at");