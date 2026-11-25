DROP INDEX "earn_event_signature_idx";--> statement-breakpoint
ALTER TABLE "earn_event" ADD COLUMN "estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "earn_event_wallet_signature_idx" ON "earn_event" USING btree ("wallet_id","tx_signature");