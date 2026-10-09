ALTER TABLE "lot" ADD COLUMN "fee_usd" numeric(38, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "lot" ADD COLUMN "reference_price_usd" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fee_usd" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "realised_pnl_usd" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "position" ADD COLUMN "reference_basis_usd" numeric(38, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "position" ADD COLUMN "fee_usd" numeric(38, 18) DEFAULT '0' NOT NULL;