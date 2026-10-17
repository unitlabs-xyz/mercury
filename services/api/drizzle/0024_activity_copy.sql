-- The feed's old wording, rewritten in the rows already written.
--
-- Titles and subtitles are stored when a row is written, so the new wording in
-- the writers reaches new rows only. Every statement matches the old wording
-- exactly and nothing else, which is what makes running this twice harmless.
--
-- Trades: the line is the trade. The fee and the gain are on the order, and the receipt shows each.
UPDATE "activity" SET "subtitle" = regexp_replace("subtitle", ' · .*$', '')
WHERE "kind" IN ('buy', 'sell') AND "subtitle" ~ '^[0-9.]+ shares? at \$[0-9,.]+ · ';
--> statement-breakpoint
-- Loans: a verb and what it acted on, never the amount, never "your".
UPDATE "activity" SET "title" = 'Added collateral', "subtitle" = regexp_replace("title", '^Pledged ', '')
WHERE "kind" = 'pledge' AND "title" ~ '^Pledged ';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Borrowed USDC', "subtitle" = 'Against ' || regexp_replace("title", '^Borrowed \$[0-9,.]+ against ', '')
WHERE "kind" = 'borrow' AND "title" ~ '^Borrowed \$[0-9,.]+ against ';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Borrowed USDC', "subtitle" = 'Against collateral'
WHERE "kind" = 'borrow' AND "title" ~ '^Borrowed \$[0-9,.]+$';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Repaid loan', "subtitle" = 'Paid in full'
WHERE "kind" = 'repay' AND "title" = 'Repaid your loan in full';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Repaid loan', "subtitle" = 'Partial repayment'
WHERE "kind" = 'repay' AND "title" ~ '^Repaid \$[0-9,.]+$';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Withdrew collateral', "subtitle" = 'All ' || regexp_replace("title", '^Withdrew all your ', '')
WHERE "kind" = 'unpledge' AND "title" ~ '^Withdrew all your ';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Withdrew collateral', "subtitle" = regexp_replace("title", '^Withdrew ', '')
WHERE "kind" = 'unpledge' AND "title" ~ '^Withdrew [0-9]';
--> statement-breakpoint
-- Cash.
UPDATE "activity" SET "subtitle" = regexp_replace("subtitle", '^(.+) from (.+)$', 'From \2 · \1')
WHERE "kind" = 'transfer_in' AND "ref_table" = 'funding_intent' AND "subtitle" ~ ' from ' AND "subtitle" !~ '^From ';
--> statement-breakpoint
UPDATE "activity" SET "subtitle" = regexp_replace("subtitle", '^Plus (\$[0-9,.]+) to open their USDC account$', 'Plus \1 recipient account setup')
WHERE "kind" = 'transfer_out' AND "subtitle" ~ '^Plus \$[0-9,.]+ to open their USDC account$';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Moved to basket' WHERE "title" = 'Cash to a basket';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Moved from basket' WHERE "title" = 'Cash from a basket';
--> statement-breakpoint
-- Dividends, labelled like every row and said as what they were paid in.
UPDATE "activity" SET
  "title" = regexp_replace("title", ' paid a dividend$', ' dividend'),
  "subtitle" = regexp_replace("subtitle", '^(.+) added, at no cost$', 'Paid as \1')
WHERE "kind" = 'dividend' AND "title" ~ ' paid a dividend$';
--> statement-breakpoint
-- Loan warnings: the title is a label. The body is written to somebody and keeps its "your".
UPDATE "activity" SET "title" = 'Liquidation in progress' WHERE "kind" = 'loan_alert' AND "title" = 'Kamino is selling your collateral';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Liquidation risk' WHERE "kind" = 'loan_alert' AND "title" = 'Your loan needs attention today';
--> statement-breakpoint
UPDATE "activity" SET "title" = 'Loan over limit' WHERE "kind" = 'loan_alert' AND "title" = 'Your loan is past its limit';
--> statement-breakpoint
-- Baskets.
UPDATE "activity" SET "title" = regexp_replace("title", '^Funded ', 'Invested in ')
WHERE "kind" = 'basket_funding' AND "title" ~ '^Funded ';
--> statement-breakpoint
UPDATE "activity" SET "subtitle" = 'To basket account'
WHERE "kind" = 'basket_funding' AND "subtitle" = 'Transfer to your Glider smart account';
--> statement-breakpoint
UPDATE "activity" SET "title" = regexp_replace("title", '^Exited (.+) to USDC$', 'Sold \1 to cash')
WHERE "kind" = 'liquidate_to_usdc' AND "title" ~ '^Exited .+ to USDC$';
