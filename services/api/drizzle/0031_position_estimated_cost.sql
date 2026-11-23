-- Of a position's cost, how much was estimated. Zero until position-sync next
-- rewrites the row, which it does on every pass: within the hour for everyone.
ALTER TABLE "position" ADD COLUMN "estimated_cost_usd" numeric(38, 18) DEFAULT '0' NOT NULL;
