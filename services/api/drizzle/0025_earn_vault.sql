DROP INDEX "earn_event_user_idx";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "earn_vault" text;--> statement-breakpoint
CREATE INDEX "earn_event_user_idx" ON "earn_event" USING btree ("user_id","vault");