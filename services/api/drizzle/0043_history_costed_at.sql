ALTER TABLE "history_job" ADD COLUMN "costed_at" timestamp with time zone;--> statement-breakpoint
-- Every wallet already costed once: done, or with a movement or a lot the cost pass wrote. A wallet
-- linked again since is queued or read, and must still take its next costing as a later one.
UPDATE "history_job" SET "costed_at" = coalesce("finished_at", now())
WHERE "status" = 'done'
   OR EXISTS (SELECT 1 FROM "history_event" e WHERE e."wallet_id" = "history_job"."wallet_id" AND e."costed_at" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "lot" l WHERE l."wallet_id" = "history_job"."wallet_id" AND l."source" = 'chain');
