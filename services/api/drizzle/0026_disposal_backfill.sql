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
