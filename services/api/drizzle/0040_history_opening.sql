ALTER TABLE "history_job" ADD COLUMN "opening" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- A first read not yet costed was read under the old rule, which priced any balance before the
-- oldest event as held from before, Mercury's own buys included. Read again from the start: every
-- transaction it fetched is kept in history_tx, so only the signature lists are asked for again,
-- and events already written are not written twice (history_event_identity_idx).
UPDATE "history_job" SET "status" = 'queued', "cursors" = '{}'::jsonb, "attempts" = 0, "run_after" = now()
WHERE "status" IN ('queued', 'running', 'read', 'failed');
