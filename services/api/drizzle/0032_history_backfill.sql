-- Queue the history reader for every linked wallet followed before it existed.
-- Linking queues a wallet's read in the same transaction from now on; a wallet
-- linked earlier has no job, and would say "Calculating…" for ever. Its first
-- read starts at once. A wallet that already has a job is left alone.
INSERT INTO "history_job" ("wallet_id", "user_id")
SELECT "id", "user_id" FROM "wallet"
WHERE "kind" = 'external' AND "unlinked_at" IS NULL
ON CONFLICT ("wallet_id") DO NOTHING;
