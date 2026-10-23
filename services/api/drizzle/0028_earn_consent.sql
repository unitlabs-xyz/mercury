ALTER TABLE "portfolio_snapshot" ADD COLUMN "earn_usd" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "earn_risk_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "earn_risk_version" text;