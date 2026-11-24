-- A sale made outside Mercury, found in a linked wallet's past: the dollars it
-- was swapped for, less the shares' average cost then. Null on a send.
-- (`disposal.kind` gains "chain"; it is plain text, so that needs no change here.)
ALTER TABLE "disposal" ADD COLUMN "realised_pnl_usd" numeric(38, 18);
