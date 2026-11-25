-- Linked wallets, step 1: the data. Nothing behaves differently yet.
--
-- Every per-wallet table gains `wallet_id`, filled from the person's Mercury
-- (primary) wallet, because until now a person had one wallet and the tables
-- were keyed by person. `user_id` stays on every one of them.
--
-- Written by hand rather than as drizzle-kit generated it: a NOT NULL column
-- cannot be added to a table that has rows until it has been filled, and a key
-- on a column cannot be made before the column exists. So each table is: add
-- the column nullable, fill it, then make it NOT NULL and key on it.
--
-- Every person has exactly one Mercury wallet (one email is one Privy user, and
-- Privy makes one embedded wallet per user), and every one of these rows was
-- written for a person who had it. So the fill below finds a wallet for every
-- row, and the index below finds no second primary. If either were ever false
-- this would fail at boot, loudly, rather than guess.

ALTER TABLE "wallet" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "unlinked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "last_viewed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_one_primary_idx" ON "wallet" USING btree ("user_id") WHERE "wallet"."is_primary";--> statement-breakpoint

-- The message a wallet signs to be linked.
CREATE TABLE "wallet_link_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_link_challenge" ADD CONSTRAINT "wallet_link_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_link_challenge_created_idx" ON "wallet_link_challenge" USING btree ("created_at");--> statement-breakpoint

-- The history reader's queue, what it read, and what it found.
CREATE TABLE "history_job" (
	"wallet_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cursors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_tx" (
	"signature" text PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"account" text NOT NULL,
	"signature" text NOT NULL,
	"block_time" timestamp with time zone,
	"kind" text NOT NULL,
	"mint" text,
	"amount_raw" bigint,
	"counter_mint" text,
	"counter_amount_raw" bigint,
	"source_owner" text
);
--> statement-breakpoint
ALTER TABLE "history_job" ADD CONSTRAINT "history_job_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_job" ADD CONSTRAINT "history_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_event" ADD CONSTRAINT "history_event_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_event" ADD CONSTRAINT "history_event_signature_history_tx_signature_fk" FOREIGN KEY ("signature") REFERENCES "public"."history_tx"("signature") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_job_status_run_after_idx" ON "history_job" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "history_event_wallet_account_time_idx" ON "history_event" USING btree ("wallet_id","account","block_time");--> statement-breakpoint
CREATE UNIQUE INDEX "history_event_identity_idx" ON "history_event" USING btree ("wallet_id","account","signature","kind");--> statement-breakpoint

-- `wallet_id` on every per-wallet table: added nullable, filled, then required.
ALTER TABLE "position" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "lot" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "disposal" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "loan_event" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "loan_alert" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "earn_event" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
UPDATE "position" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "lot" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "disposal" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "order" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "activity" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "portfolio_snapshot" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "loan_event" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "loan_alert" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint
UPDATE "earn_event" t SET "wallet_id" = w."id" FROM "wallet" w WHERE w."user_id" = t."user_id" AND w."is_primary";--> statement-breakpoint

-- `order` stays nullable: the fee it records outlives its wallet.
ALTER TABLE "position" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lot" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disposal" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_event" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_alert" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "earn_event" ALTER COLUMN "wallet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal" ADD CONSTRAINT "disposal_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_event" ADD CONSTRAINT "loan_event_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_alert" ADD CONSTRAINT "loan_alert_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earn_event" ADD CONSTRAINT "earn_event_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Keys and unique indexes move from the person to the wallet. Each old one was
-- unique per person, and every row's wallet is that person's one primary, so
-- none of the new ones can find a duplicate here.
ALTER TABLE "position" DROP CONSTRAINT "position_user_id_instrument_id_pk";--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_wallet_id_instrument_id_pk" PRIMARY KEY("wallet_id","instrument_id");--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" DROP CONSTRAINT "portfolio_snapshot_user_id_captured_at_pk";--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_wallet_id_captured_at_pk" PRIMARY KEY("wallet_id","captured_at");--> statement-breakpoint
-- loan_alert's key was declared on its column, so Postgres named it.
ALTER TABLE "loan_alert" DROP CONSTRAINT "loan_alert_pkey";--> statement-breakpoint
ALTER TABLE "loan_alert" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_alert" ADD CONSTRAINT "loan_alert_pkey" PRIMARY KEY("wallet_id");--> statement-breakpoint
DROP INDEX "activity_signature_mint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "activity_signature_mint_idx" ON "activity" USING btree ("wallet_id","tx_signature","mint");--> statement-breakpoint
DROP INDEX "loan_event_signature_kind_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "loan_event_signature_kind_idx" ON "loan_event" USING btree ("wallet_id","tx_signature","kind");--> statement-breakpoint

-- Reads by wallet, and reads across a person's wallets now that their keys no
-- longer lead with user_id.
CREATE INDEX "lot_wallet_token_idx" ON "lot" USING btree ("wallet_id","token_id");--> statement-breakpoint
CREATE INDEX "disposal_wallet_token_idx" ON "disposal" USING btree ("wallet_id","token_id");--> statement-breakpoint
CREATE INDEX "position_user_idx" ON "position" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portfolio_snapshot_user_captured_idx" ON "portfolio_snapshot" USING btree ("user_id","captured_at");--> statement-breakpoint

-- Who wrote a ledger row, and the collateral's price at a loan event.
ALTER TABLE "loan_event" ADD COLUMN "price_usd" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "loan_event" ADD COLUMN "origin_source" text DEFAULT 'mercury' NOT NULL;--> statement-breakpoint
ALTER TABLE "earn_event" ADD COLUMN "origin_source" text DEFAULT 'mercury' NOT NULL;
