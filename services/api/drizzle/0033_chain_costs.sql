-- Which of a linked wallet's past movements the cost pass has taken into its lots,
-- and where each estimated lot's cost came from. Both null until written.
ALTER TABLE "history_event" ADD COLUMN "costed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lot" ADD COLUMN "estimate_source" text;