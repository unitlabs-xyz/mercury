-- For a transfer out of a linked wallet, who received it: a send by hand to the
-- person's Mercury wallet is a move, and carries its cost there. Null on rows
-- read before this, and on arrivals.
ALTER TABLE "history_event" ADD COLUMN "destination_owner" text;
