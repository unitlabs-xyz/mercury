DROP INDEX "funding_intent_deposit_address_idx";--> statement-breakpoint
DROP INDEX "funding_intent_address_in_tx_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "funding_intent_request_idx" ON "funding_intent" USING btree ("relay_request_id");--> statement-breakpoint
ALTER TABLE "funding_intent" DROP COLUMN "deposit_address";