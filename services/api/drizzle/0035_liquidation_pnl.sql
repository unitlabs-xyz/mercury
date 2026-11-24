-- Shares pledged to Kamino are still held. Where a linked wallet's first read
-- stopped at its cap while some were pledged, how many: the cost pass prices
-- them into the opening balance with the wallet's own.
ALTER TABLE "history_job" ADD COLUMN "opening_pledged" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- A liquidation is a sale: what Kamino sold the shares for, less what they had
-- cost. Null until that cost is known, and on every other kind of row.
ALTER TABLE "loan_event" ADD COLUMN "realised_pnl_usd" numeric(38, 18);
