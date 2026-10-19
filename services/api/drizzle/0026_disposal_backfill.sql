-- The shares every past sell removed, and when every past lot entered Mercury.
--
-- A position is now a replay of lots and disposals in the order they were
-- recorded. Lots written so far entered when they were acquired, and every
-- filled sell left a disposal it had nowhere to write.
UPDATE "lot" SET "recorded_at" = "acquired_at";
--> statement-breakpoint
-- A sell is an exact-in swap, so the chosen candidate's `filledShares` is the
-- shares that left, at the candidate's multiplier; tokens are those shares over
-- that multiplier. A sell whose decision cannot say is left out, and the first
-- position-sync after deploy records its drop as a transfer out instead.
--
-- "Cannot say" has to mean skipped rather than failed, because this runs when
-- the API boots and one malformed row would keep it from starting. So the
-- candidates are only read as a list when they are one, and the two numbers
-- are only read as numbers when they look like one. CASE is what keeps the
-- check ahead of the cast; the order of ANDs in a WHERE is not promised.
INSERT INTO "disposal" ("user_id", "token_id", "instrument_id", "token_qty", "shares", "kind", "order_id", "occurred_at", "recorded_at")
SELECT
  o."user_id",
  t."id",
  o."instrument_id",
  round((c->>'filledShares')::numeric / (c->>'multiplier')::numeric * power(10::numeric, t."decimals"))::bigint,
  (c->>'filledShares')::numeric,
  'sell',
  o."id",
  o."filled_at",
  o."filled_at"
FROM "order" o
JOIN "token" t ON t."id" = o."chosen_token_id"
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o."decision"->'candidates') = 'array' THEN o."decision"->'candidates' ELSE '[]'::jsonb END
) AS c
WHERE o."side" = 'sell'
  AND o."status" = 'filled'
  AND o."filled_at" IS NOT NULL
  AND c->>'mint' = t."mint"
  AND CASE WHEN c->>'filledShares' ~ '^[0-9]+(\.[0-9]+)?$' THEN true ELSE false END
  AND CASE WHEN c->>'multiplier' ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'multiplier')::numeric > 0 ELSE false END
ON CONFLICT ("order_id") DO NOTHING;
--> statement-breakpoint
-- The old reconcile counted a dividend on every token a user ever bought, the
-- ones they had since sold included, because it had no record of what left. A
-- dividend credited after a sell therefore carries shares for tokens that were
-- already gone. Replayed, the holding has more shares than the chain does, the
-- cap on the shares with a cost scales the cost down with the excess, and the
-- position's cost comes out too low: buy two tokens for $200, sell one, and a
-- rise in the multiplier to 1.5 read as $75 where $100 is right. So each
-- dividend lot with a disposal at or before it is cut back to the tokens that
-- were still held when it was credited: the tokens acquired by then, less
-- those disposed of by then, over those acquired.
--
-- Exact whenever that token's buys were all at one multiplier. Where they were
-- not, the next position-sync's own dividend detection absorbs what is left,
-- or the cap on the shares with a cost does.
--
-- This is not idempotent: run twice, it would scale a dividend twice. It runs
-- once, because drizzle applies a migration once, inside one transaction, and
-- records that it did. A dividend with no acquired tokens to scale by is left
-- as it is rather than failed, for the same reason the sells above are.
WITH "history" AS (
  SELECT
    l."id",
    (SELECT COALESCE(SUM(a."token_qty"), 0) FROM "lot" a
      WHERE a."user_id" = l."user_id" AND a."token_id" = l."token_id" AND a."recorded_at" <= l."recorded_at") AS "acquired",
    (SELECT COALESCE(SUM(d."token_qty"), 0) FROM "disposal" d
      WHERE d."user_id" = l."user_id" AND d."token_id" = l."token_id" AND d."recorded_at" <= l."recorded_at") AS "disposed"
  FROM "lot" l
  WHERE l."source" = 'dividend'
)
UPDATE "lot"
SET "shares" = "lot"."shares" * COALESCE(
  GREATEST(h."acquired" - h."disposed", 0) / NULLIF(h."acquired", 0),
  1
)
FROM "history" h
WHERE "lot"."id" = h."id"
  AND h."disposed" > 0;
