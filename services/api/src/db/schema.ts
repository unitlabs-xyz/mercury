import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * The read model, per docs/05. Two rules hold throughout and have no exceptions:
 *
 *  1. Never a float. On-chain amounts are `bigint` in the token's smallest unit.
 *     Prices and USD values are numeric(38,18) here and Decimal in TypeScript.
 *  2. Store both sides of a quantity. A holding has a token count and a share
 *     count; they differ by the multiplier, and the multiplier moves. Deriving
 *     one from the other at read time would rewrite history.
 *
 * We store the email Privy already hands us on every authenticated request,
 * so that a margin call can reach somebody who is not looking at the page. The
 * original rule was to copy nothing; see the amendment in docs/05.
 */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Privy's DID for this user, e.g. "did:privy:clxxxx". Our join key to them. */
    privyUserId: text("privy_user_id").notNull(),
    /**
     * Where to reach this person, copied from Privy's identity token.
     *
     * Nullable, and it stays nullable. A session can be valid before the
     * identity token reaches us, and a user could in principle link something
     * other than an email; a column that insisted otherwise would reject a
     * login over a contact detail. Anything sending mail has to handle null.
     */
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    displayCurrency: text("display_currency").notNull().default("USD"),
    /**
     * The Earn vault new cash goes to by default: the last one this person moved
     * money into. Null is the app's default. Nothing moves on its own; this only
     * preselects a vault.
     */
    earnVault: text("earn_vault"),
    /**
     * When this person accepted Earn's risks, and which wording they saw.
     * Deposits need the current wording accepted; a new wording asks again.
     */
    earnRiskAcceptedAt: timestamp("earn_risk_accepted_at", { withTimezone: true }),
    earnRiskVersion: text("earn_risk_version"),
  },
  (t) => [uniqueIndex("user_privy_user_id_idx").on(t.privyUserId)],
);

export const wallets = pgTable(
  "wallet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    kind: text("kind", { enum: ["privy_embedded", "external"] }).notNull(),
    /**
     * The Mercury wallet: the one Privy created at sign-in, listed first, and
     * the only one iOS acts for. Exactly one per user (`wallet_one_primary_idx`).
     *
     * The default is `true` because every wallet written before linked wallets
     * was a Privy one. Anything inserting a linked wallet sets it to `false`
     * itself rather than trusting the default.
     */
    isPrimary: boolean("is_primary").notNull().default(true),
    /** A name the person gave a linked wallet, such as "Phantom main". Null shows a short address. */
    label: text("label"),
    /** When a linked wallet was last linked. Null for the Mercury wallet, which is never linked. */
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    /**
     * When a linked wallet was unlinked. Non-null means nothing tracks it, acts
     * for it or shows it, though its rows are kept until the person deletes
     * them. Linking it again clears this rather than inserting a second row.
     */
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    /**
     * The last time web or iOS showed this wallet's positions. Sets how often a
     * linked wallet is read when the jobs fall back to polling. Written at most
     * once an hour, because presence is reported every few seconds.
     */
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wallet_address_idx").on(t.address),
    /* One Mercury wallet per person. Partial, so linked wallets are not counted. */
    uniqueIndex("wallet_one_primary_idx")
      .on(t.userId)
      .where(sql`${t.isPrimary}`),
  ],
);

/**
 * A message a wallet is asked to sign to prove the person controls it.
 *
 * The message is stored, never taken back from the client: the signature is
 * checked against exactly what the server issued. Marked used in the same
 * transaction that saves the wallet, so one signature can link once.
 */
export const walletLinkChallenges = pgTable(
  "wallet_link_challenge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_link_challenge_created_idx").on(t.createdAt)],
);
export type WalletLinkChallenge = typeof walletLinkChallenges.$inferSelect;

/** Enrollment authorizations and accepted manual rebalances. Provider balances stay at Glider. */
export const basketActions = pgTable(
  "basket_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    kind: text("kind").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    strategyId: text("strategy_id").notNull(),
    payload: jsonb("payload").notNull(),
    portfolioId: text("portfolio_id"),
    operationId: text("operation_id"),
    nonce: text("nonce"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reconciliationState: text("reconciliation_state"),
    reconcileAfter: timestamp("reconcile_after", { withTimezone: true }),
    reconcileAttempts: integer("reconcile_attempts").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("basket_action_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("basket_action_user_operation_idx").on(t.userId, t.operationId),
    uniqueIndex("basket_action_nonce_idx").on(t.nonce),
    index("basket_action_reconcile_idx").on(t.reconciliationState, t.reconcileAfter),
  ],
);

/**
 * The Glider smart accounts a user's money goes to and comes back from.
 *
 * Remembered because the wallet-events job cannot otherwise tell basket
 * funding from somebody sending their money away: both are USDC leaving the
 * wallet with nothing else moving in it. Read as a withdrawal, funding a
 * basket printed a gain on the performance chart equal to the amount funded,
 * because net worth did not drop — the money reappeared as basket value.
 *
 * Written whenever we resolve one from Glider, which is before any money can
 * move to it. Rows older than that are still corrected after the fact, by the
 * funding and exit reconcilers.
 */
export const basketAccounts = pgTable(
  "basket_account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The smart account's Solana address, bare — not a CAIP account id. */
    address: text("address").notNull(),
    portfolioId: text("portfolio_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.address] })],
);

/**
 * One signature stream we follow for a wallet.
 *
 * A row rather than a column per stream: a wallet follows its own address for
 * native SOL and its USDC token account for cash today, and following a stock
 * account later is an insert rather than a migration.
 *
 * The RPC indexes a transaction under its account keys, and an SPL transfer's
 * accounts do not include the recipient's wallet — so the wallet address alone
 * would find a first deposit and miss every one after it.
 */
export const walletStreams = pgTable(
  "wallet_stream",
  {
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    /** The address whose signatures this row follows. */
    address: text("address").notNull(),
    /** Newest signature processed. Null until the first pass records where we are. */
    cursor: text("cursor"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.walletId, t.address] })],
);

/** A money column. Wide enough for a share count and a price alike. */
const usd = (name: string) => numeric(name, { precision: 38, scale: 18 });

/**
 * The wallet a row belongs to.
 *
 * Every per-wallet table had only `user_id`, because a person had one wallet.
 * With linked wallets one person has several, and two of them can see the same
 * signature and the same mint. `user_id` stays beside it on every table, so a
 * read across all of a person's wallets is still one filter.
 *
 * Cascades: deleting a wallet (unlink and delete history) takes its rows with it.
 */
const walletId = () =>
  uuid("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" });

/** Who wrote a ledger row: Mercury at confirm time, or the history reader afterwards. */
const originSource = () =>
  text("origin_source", { enum: ["mercury", "chain"] })
    .notNull()
    .default("mercury");

/** The real company or fund. One row per ticker. */
export const instruments = pgTable(
  "instrument",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    sector: text("sector"),
    description: text("description"),
    logoUrl: text("logo_url"),
    /** False when no wrapper can be filled at a normal size. The shelf hides it. */
    isTradable: boolean("is_tradable").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instrument_ticker_idx").on(t.ticker)],
);

/** A wrapper. Several per instrument, one per issuer. */
export const tokens = pgTable(
  "token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    mint: text("mint").notNull(),
    issuer: text("issuer", { enum: ["backed", "ondo"] }).notNull(),
    symbol: text("symbol").notNull(),
    decimals: integer("decimals").notNull(),
    /** Cached from the mint. Every change is also written to multiplier_event. */
    multiplier: usd("multiplier").notNull().default("1"),
    multiplierUpdatedAt: timestamp("multiplier_updated_at", { withTimezone: true }),
    isRoutable: boolean("is_routable").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("token_mint_idx").on(t.mint), index("token_instrument_idx").on(t.instrumentId)],
);

/** A multiplier change is a dividend, and the user should see it. */
export const multiplierEvents = pgTable(
  "multiplier_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    oldMultiplier: usd("old_multiplier").notNull(),
    newMultiplier: usd("new_multiplier").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind", { enum: ["dividend", "split", "unknown"] }).notNull(),
  },
  (t) => [index("multiplier_event_token_idx").on(t.tokenId, t.observedAt)],
);

/**
 * What a token traded at across one bucket of time. See ADR 0016.
 *
 * The only record of a price in the system: the board forgets in a minute, and
 * every other table holds quantities. Written by the `prices` job from the same
 * answer that warms the board, at three widths at once, so each one is always
 * current and none is a rollup that can fall behind.
 *
 * Two prices, both per share. `market_*` is what a share of this wrapper fetches
 * in the pool, which is what a holding is valued at. `reference_*` is the
 * issuer's quote for the underlying, which is what "did the stock move" is
 * measured against, and is null across a bar that never had one.
 *
 * `first_at` and `last_at` are the instants of the first and last samples, so
 * a sample that arrives late can widen a bar without taking its close.
 */
export const priceBars = pgTable(
  "price_bar",
  {
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    width: text("width", { enum: ["1m", "1h", "1d"] }).notNull(),
    /** The start of the bucket, UTC. A day is a UTC day. */
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    marketOpen: usd("market_open").notNull(),
    marketHigh: usd("market_high").notNull(),
    marketLow: usd("market_low").notNull(),
    marketClose: usd("market_close").notNull(),
    referenceOpen: usd("reference_open"),
    referenceHigh: usd("reference_high"),
    referenceLow: usd("reference_low"),
    referenceClose: usd("reference_close"),
    /** In force at the last sample. Tokens to shares, and a step in it is a dividend. */
    multiplier: usd("multiplier").notNull(),
    liquidityUsd: usd("liquidity_usd").notNull(),
    samples: integer("samples").notNull(),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tokenId, t.width, t.bucketStart] }),
    // What pruning asks: every minute bar older than a date, whatever its token.
    index("price_bar_width_bucket_idx").on(t.width, t.bucketStart),
  ],
);

/**
 * The unit of cost basis. One row per acquisition, and `shares` is frozen at
 * acquisition: if the multiplier later rises, a *new* lot is written with
 * source 'dividend' and a unit cost of zero.
 */
export const lots = pgTable(
  "lot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    /** Smallest unit, as acquired. A dividend lot has none: it is shares only. */
    tokenQty: bigint("token_qty", { mode: "bigint" }).notNull(),
    /** token_qty x multiplier AT ACQUISITION. Never recomputed. */
    shares: usd("shares").notNull(),
    /**
     * Cost per share, not per token, and not including `feeUsd`.
     *
     * What the swap itself charged for one share. The sponsorship fee used to
     * be in here, because the lot was written from the wallet's whole USDC
     * delta — which opened every position at a loss of exactly the fee.
     */
    unitCostUsd: usd("unit_cost_usd").notNull(),
    /**
     * The charge on the trade that wrote this lot: the network cost and
     * Mercury's fee, carried in one transfer to the relayer.
     *
     * A cost of trading, kept apart from the price so that the two can be
     * reported as the separate things they are. Zero on an unsponsored trade
     * and on a dividend lot, which nobody was charged for.
     */
    feeUsd: usd("fee_usd").notNull().default("0"),
    /**
     * What one real share was quoted at when this lot was acquired.
     *
     * The underlying equity's price, which is the same scale the portfolio is
     * marked in — so `shares x (mark - reference)` is what the stock did, and
     * everything else between that and the dollars paid is a cost of trading.
     * Null on a lot written before this was recorded, where the execution
     * price stands in for it and the premium reads as zero.
     */
    referencePriceUsd: usd("reference_price_usd"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When the lot entered Mercury, which a position is replayed in order of.
     *
     * The same moment as `acquiredAt` for everything written so far. An imported
     * lot is the first that differs: bought in March, recorded today. Replaying
     * it by when it was bought would apply last month's sell to shares that were
     * not here yet.
     */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * How the shares were acquired, or for a linked wallet where the cost came from.
     *
     * - `link`: written on a linked wallet's first pass at that day's price, so
     *   the share counts are right from the start. A placeholder, never shown as
     *   P&L, and replaced by `chain` lots once the history reader has read the
     *   wallet. No `link` lot survives a finished read.
     * - `chain`: priced from the wallet's own history by the history reader.
     * - `declared`: a cost the person entered. Always wins.
     * - `basket_exit`: shares that came out of a basket in kind.
     *
     * Plain text with no database check, so a new value needs no migration.
     */
    source: text("source", {
      enum: ["buy", "transfer_in", "dividend", "basket", "link", "chain", "declared", "basket_exit"],
    }).notNull(),
    /** True when we inferred the cost. The UI has to say so. */
    isEstimated: boolean("is_estimated").notNull().default(false),
    orderId: uuid("order_id"),
  },
  (t) => [
    // Across all of a person's wallets, which is what "All wallets" reads.
    index("lot_user_token_idx").on(t.userId, t.tokenId),
    index("lot_wallet_token_idx").on(t.walletId, t.tokenId),
  ],
);

/**
 * Shares that left: a sell, or a transfer out position-sync noticed. The other
 * half of `lot`. A position is a replay of the two in the order they were
 * recorded, at average cost (`replayPosition` in @mercury/core), so the cost of
 * shares that left goes with them rather than staying to be mixed into the next
 * purchase.
 */
export const disposals = pgTable(
  "disposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    /** Smallest unit, as it left. */
    tokenQty: bigint("token_qty", { mode: "bigint" }).notNull(),
    /** token_qty x the multiplier in force when it left. For reading; the replay counts tokens. */
    shares: usd("shares").notNull(),
    kind: text("kind", { enum: ["sell", "transfer_out"] }).notNull(),
    /** The sell that wrote it. Unique, so a sell settled twice removes its shares once. */
    orderId: uuid("order_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("disposal_user_token_idx").on(t.userId, t.tokenId),
    index("disposal_wallet_token_idx").on(t.walletId, t.tokenId),
    uniqueIndex("disposal_order_idx").on(t.orderId),
  ],
);

/** A derived rollup, per wallet per instrument. Rebuildable from lots and disposals at any time. */
export const positions = pgTable(
  "position",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    /** What the chain says is held. Never inferred. */
    shares: usd("shares").notNull(),
    /**
     * How many of those shares we hold a lot for. Shares that arrived from
     * somewhere we did not witness have no lot and no cost, and are counted in
     * `shares` but not here — so profit is measured against what we can prove
     * was paid rather than against a price we guessed.
     */
    sharesWithBasis: usd("shares_with_basis").notNull().default("0"),
    costBasisUsd: usd("cost_basis_usd").notNull(),
    /**
     * What those same shares were quoted at when they were acquired, summed.
     *
     * The other half of a stacked return: measured against the mark it gives
     * what the stock did, and its distance from `costBasisUsd` is the premium
     * and spread that were paid to get in.
     */
    referenceBasisUsd: usd("reference_basis_usd").notNull().default("0"),
    /** Trading charges paid to acquire the shares still held: network cost and Mercury's fee. */
    feeUsd: usd("fee_usd").notNull().default("0"),
    avgUnitCostUsd: usd("avg_unit_cost_usd").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.walletId, t.instrumentId] }),
    // The key used to lead with user_id, and every read of a person's holdings used it.
    index("position_user_idx").on(t.userId),
  ],
);

export const orders = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The wallet the order was for. Nullable, and set to null rather than
     * deleted with its wallet: the row records the Mercury fee charged, which
     * the books need after the wallet is gone.
     */
    walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    usdAmount: usd("usd_amount").notNull(),
    /*
     * Sell the whole position, in tokens rather than dollars. Stored because
     * `/execute` re-prices from this row, and a dollar figure re-quoted at a
     * moved price leaves dust that is then too small to ever sweep.
     */
    max: boolean("max").notNull().default(false),
    /**
     * The full Decision from @mercury/core, kept verbatim. When a user asks why
     * they were sold one wrapper and not the other, the answer is a row.
     */
    decision: jsonb("decision").notNull(),
    chosenTokenId: uuid("chosen_token_id").references(() => tokens.id),
    referencePrice: usd("reference_price"),
    premiumPct: usd("premium_pct"),
    /*
     * `partially_filled` and `expired` were listed here and no code path could
     * write either: a swap is one atomic transaction, and expiry belonged to
     * trigger orders, which are not built. The column is plain text with no
     * database constraint, so narrowing the list needs no migration — it only
     * stops the type from advertising states the system cannot reach.
     */
    status: text("status", {
      enum: ["pending", "executing", "filled", "queued", "cancelled", "refused"],
    }).notNull(),
    txSignature: text("tx_signature"),
    /**
     * What the relayer took in this order's transaction, read off the chain:
     * the network cost and Mercury's fee together, since one transfer carries
     * both. `mercuryFeeUsd` is the part of it that was revenue.
     */
    feeUsd: usd("fee_usd"),
    /**
     * Mercury's own fee, as the transaction was built with it.
     *
     * Both halves of the charge land in the relayer's one USDC account, so the
     * chain cannot tell revenue from repaid gas; the build can, and this is
     * where it says so. Written with the decision it belongs to, every time the
     * order is re-priced, so it is null on a row whose last pass built nothing.
     */
    mercuryFeeUsd: usd("mercury_fee_usd"),
    /**
     * What a sell made against the basis it removed, before its own fee.
     *
     * Recorded because it is otherwise unrecoverable: it was computed at
     * settlement, printed into a feed subtitle and thrown away, so selling a
     * position erased its whole profit from every figure on the page. Null on
     * a buy, and on a sell of shares we hold no basis for.
     */
    realisedPnlUsd: usd("realised_pnl_usd"),
    triggerOrderAccount: text("trigger_order_account"),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_user_created_idx").on(t.userId, t.createdAt),
    /* Time-first, so a range query that does not name a user can use an index.
       Every other index on this table leads with user_id, and a leading
       user_id cannot serve a query that does not filter on it — "every order
       last Tuesday, by status" would be a sequential scan over a table live
       traffic is writing to.

       Added for the admin dashboard, which has since been removed. Kept
       deliberately: it is applied in every environment already, it is what
       any future reporting over a date range needs, and dropping it would be
       a DDL change against a live table for no gain. */
    index("order_created_status_idx").on(t.createdAt, t.status),
    // One signature, one order. This is what makes confirm idempotent in
    // subsystem 3, where a double submit would otherwise write a second lot.
    uniqueIndex("order_tx_signature_idx").on(t.txSignature),
  ],
);

/** Durable feed. A verified basket funding confirmation may enrich one generic transfer row. */
export const activities = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    amountUsd: usd("amount_usd"),
    /** Settled asset quantity; unlike amountUsd this is never a price estimate. */
    tokenQuantity: usd("token_quantity"),
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    txSignature: text("tx_signature"),
    basketSlug: text("basket_slug"),
    basketPortfolioId: text("basket_portfolio_id"),
    /** Which asset moved. Null on a row with no single asset, such as a dividend. */
    mint: text("mint"),
  },
  (t) => [
    index("activity_user_occurred_idx").on(t.userId, t.occurredAt, t.id),
    /* Activity by kind over a range. The two indexes around it both lead with
       user_id, which cannot serve a query that does not filter on one. Added
       for the removed admin dashboard and kept — see order_created_status_idx. */
    index("activity_occurred_kind_idx").on(t.occurredAt, t.kind),
    index("activity_basket_portfolio_idx").on(t.userId, t.basketPortfolioId, t.occurredAt),
    /**
     * The idempotency guarantee. A movement seen twice — a crash between
     * writing and advancing a cursor, a transaction that appears in both of a
     * wallet's streams, or two API instances running the job — is written once.
     *
     * Rows where `mint` is null are not constrained, which is what lets the
     * dividend rows `position-sync` writes carry no mint and no signature.
     *
     * Per wallet, not per user: a move from a linked wallet to the Mercury
     * wallet is one signature and one mint seen by two wallets of the same
     * person, and per user the second would be dropped as a duplicate.
     */
    uniqueIndex("activity_signature_mint_idx").on(t.walletId, t.txSignature, t.mint),
  ],
);
export type User = typeof users.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Instrument = typeof instruments.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type MultiplierEvent = typeof multiplierEvents.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type WalletStream = typeof walletStreams.$inferSelect;

/**
 * People who asked to be told when Mercury opens. Not users: nobody here has
 * signed in, and it is never joined to anything.
 *
 * Nothing reads or writes it any more. The waitlist was removed when the beta
 * opened to everyone (docs/archive/waitlist), and the table was kept, rows and
 * all, because the signups are the one part of it that cannot be rebuilt. It
 * stays defined here so that no generated migration drops it by accident.
 */
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lower-cased on the way in, so the unique index catches a second signup. */
    email: text("email").notNull(),
    name: text("name"),
    country: text("country").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Their place in line, from 1, in the order they joined. The first 500 are
     * the founding cohort. Taken from a sequence, so two signups in the same
     * instant cannot share a number.
     */
    position: serial("position").notNull(),
    /** Their X handle without the @, as typed at signup. What the card shows. */
    handle: text("handle"),
    /**
     * The public name of their card, in its share link. Random rather than the
     * position, so the links cannot be walked to list everyone on the waitlist.
     */
    slug: text("slug").notNull(),
    /**
     * The photo behind their card, by file name. Kept so a card someone has
     * shared never changes; null, or a file since removed, falls back to one
     * chosen by position.
     */
    background: text("background"),
    /**
     * When the "Mercury is live" email went out, and the only record that it
     * did. Null means it has not.
     */
    betaMailedAt: timestamp("beta_mailed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("waitlist_email_idx").on(t.email),
    uniqueIndex("waitlist_position_idx").on(t.position),
    uniqueIndex("waitlist_slug_idx").on(t.slug),
  ],
);

/**
 * What an account was worth, once an hour.
 *
 * No upstream sells a portfolio's history — Jupiter gives spot, Pyth gives spot
 * and a calendar — so §6 of the backend design records it ourselves. This is
 * the only table written on a clock rather than in response to something that
 * happened, and the only one whose value is that it is old.
 *
 * `capturedAt` is the top of the hour, not the moment of the write, and the
 * unique index below is what makes that matter: a deploy that restarts the
 * process mid-hour upserts that hour's row instead of adding a second one. The
 * series is therefore a grid, which is also what lets a range be bucketed by
 * arithmetic rather than by a window function.
 *
 * Historical rows predate basket valuation. NULL means wallet-only history;
 * zero means a complete basket read found no basket value.
 */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshot",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    /** The top of the hour this reading belongs to, UTC. */
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    /**
     * When the balances behind it were actually read, which is anywhere up to
     * an hour after `capturedAt`.
     *
     * The chart subtracts deposits and withdrawals to show what the holdings
     * themselves did, and to do that it has to know which side of a reading a
     * transfer fell on. Judged by `capturedAt`, a deposit at 19:30 counts as
     * arriving after a reading stamped 19:00 that was actually taken at 19:47
     * and already contains it — so it is subtracted from a value that already
     * included it, and the line falls by the whole deposit.
     *
     * Null on rows written before this column. Those fall back to
     * `capturedAt`, which is the old behaviour and the best that can be said
     * about a reading whose real instant nobody recorded.
     */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Stocks plus cash less debt: net worth, the figure at the top of the page. */
    totalUsd: usd("total_usd").notNull(),
    stocksUsd: usd("stocks_usd").notNull(),
    cashUsd: usd("cash_usd").notNull(),
    basketUsd: usd("basket_usd"),
    /**
     * Owed to Kamino at this hour. Defaulted rather than backfilled: rows
     * written before this column measured a gross total, and inventing a debt
     * for them would be inventing a reading nobody took.
     */
    debtUsd: usd("debt_usd").notNull().default("0"),
    /**
     * What was in Earn, apart from the total that counts it. Null on readings
     * from before Earn. Read back when Kamino cannot be, as debt is.
     */
    earnUsd: usd("earn_usd"),
  },
  (t) => [
    primaryKey({ columns: [t.walletId, t.capturedAt] }),
    // A person's chart, across their wallets. The key used to lead with user_id.
    index("portfolio_snapshot_user_captured_idx").on(t.userId, t.capturedAt),
    /* max(captured_at) over the whole table, and the latest reading per user.
       The primary key leads with user_id, so neither can use it: a max would
       walk the entire PK index. Added for the removed admin dashboard and
       kept — see order_created_status_idx. */
    index("portfolio_snapshot_captured_idx").on(t.capturedAt),
  ],
);
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;

/**
 * What a loan did, and when.
 *
 * Kamino's obligation is current state: what is owed now, what is pledged now.
 * It has no history to read back, so a loan taken and repaid leaves no trace
 * anywhere once it is closed. This table is that trace — the same reason
 * `portfolio_snapshot` exists, for the same kind of number.
 *
 * It is not the activity feed. The feed is denormalised on purpose, read
 * constantly and never joined (docs/05); the rate at the time and the position
 * either side of the event belong here, where something can join them.
 */
export const loanEvents = pgTable(
  "loan_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    /** borrow, repay, pledge or unpledge. */
    kind: text("kind").notNull(),
    /** Dollars borrowed or repaid. Null when the event only moved collateral. */
    usdAmount: usd("usd_amount"),
    /** The collateral leg, when there is one. */
    ticker: text("ticker"),
    /** In the mint's smallest unit, as every token quantity here is. */
    tokensRaw: text("tokens_raw"),
    /**
     * Kamino's borrow APY at the moment this happened.
     *
     * Recorded because it cannot be recovered. What a loan actually cost is the
     * rate integrated over the balance, and the rate moves with utilisation
     * every block. Without a reading at each event, a past month's interest can
     * only ever be guessed at from today's rate.
     */
    borrowApy: numeric("borrow_apy", { precision: 38, scale: 18 }),
    /** The position straight after, as Kamino reported it. */
    debtAfterUsd: usd("debt_after_usd").notNull(),
    collateralAfterUsd: usd("collateral_after_usd").notNull(),
    /**
     * The collateral's share price when this happened. Lets the loan screen say
     * "Pledged 10 TSLAx at $240.10". Null where nobody recorded it.
     */
    priceUsd: usd("price_usd"),
    originSource: originSource(),
    txSignature: text("tx_signature").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loan_event_user_occurred_idx").on(t.userId, t.occurredAt),
    /**
     * Idempotency, and the reason `kind` is in the key.
     *
     * One `deposit_and_borrow` is a single transaction that does two things, so
     * one signature carries both a pledge and a borrow. Keyed on the signature
     * alone the second would be rejected as a duplicate of the first; keyed
     * with the kind, both land and confirming twice still writes nothing new.
     */
    uniqueIndex("loan_event_signature_kind_idx").on(t.walletId, t.txSignature, t.kind),
  ],
);
export type LoanEvent = typeof loanEvents.$inferSelect;

/**
 * What each borrower was last warned about.
 *
 * One row per account, overwritten. Its only job is to stop the watcher saying
 * the same thing every time it runs: a loan sitting at 86% of the way to
 * liquidation stays there for hours, and a job on a five-minute clock would
 * otherwise send that warning a hundred times before lunch. Somebody warned
 * constantly stops reading, which is the failure this feature exists to prevent.
 *
 * It holds the worst state we have *told them about*, not the worst they have
 * reached. Those differ when a notice could not be delivered, and the
 * difference is the point: undelivered is untold, so it is tried again.
 */
export const loanAlerts = pgTable("loan_alert", {
  /** One remembered health per loan, and a loan belongs to a wallet, not a person. */
  walletId: uuid("wallet_id")
    .primaryKey()
    .references(() => wallets.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** healthy, over_limit, margin_call or liquidation. See lending/capacity.ts. */
  health: text("health").notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LoanAlert = typeof loanAlerts.$inferSelect;

/**
 * Something worth telling, and whether it has been read.
 *
 * Every notification points at an `activity` row and carries none of its
 * words: the title and subtitle are read from the row when the inbox is read,
 * so a deposit `funding/enrich.ts` names a pass later ("From Tron · USDT")
 * shows the better wording without anything being copied twice.
 *
 * The unique index on `activity_id` is the idempotency guarantee, the same job
 * `activity_signature_mint_idx` does for `activity`: a pass that runs twice
 * writes one notification.
 */
export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["money_in", "dividend", "loan_alert"] }).notNull(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while unread. Set once: reading it again keeps the first time. */
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notification_user_created_idx").on(t.userId, t.createdAt, t.id),
    /* The badge. Partial, so it stays as small as the unread set. */
    index("notification_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notification_activity_idx").on(t.activityId),
  ],
);
export type Notification = typeof notifications.$inferSelect;

/**
 * A deposit we quoted, from the moment we quoted it.
 *
 * The row exists before the user sees an address, which is the whole point.
 * `wallet-events` can tell us that USDC arrived and never what it arrived
 * from, so without this a deposit bridged from Tron and a transfer from a
 * friend are the same two lines in the database.
 */
export const fundingIntents = pgTable(
  "funding_intent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The id Relay gave the quote we minted.
     *
     * Not an identity. Relay regenerates the quote on over- or underpayment
     * and the fill lands under a new id, so this is what we asked for and not
     * necessarily what happened. `deposit_address` is the identity.
     */
    relayRequestId: text("relay_request_id").notNull(),
    originChainId: integer("origin_chain_id").notNull(),
    originCurrency: text("origin_currency").notNull(),
    /**
     * The chain and token as they were named to the user, not as Relay names
     * them today.
     *
     * Stored rather than looked up, for the reason `order.decision` is stored:
     * the feed has to be able to say "from Base" a month later, and Relay's
     * chain list is theirs to change. A row that has to call an upstream to
     * describe itself is a row that reads differently depending on when you
     * read it.
     */
    originChainName: text("origin_chain_name").notNull(),
    originCurrencySymbol: text("origin_currency_symbol").notNull(),
    /** The Privy wallet, as quoted. Stored so a changed wallet is visible rather than assumed. */
    recipientAddress: text("recipient_address").notNull(),
    /** USDC base units. Indicative at mint time, and never updated. */
    quotedOutRaw: text("quoted_out_raw"),
    /**
     * Mercury's fee in the quote, in dollars, as Relay reported it. Null when
     * the deposit was charged none — Circle's USDC, or no recipient set.
     *
     * Relay holds every deposit's fee as one balance until it is claimed, so
     * this is the only record of which deposit each part of it came from.
     */
    mercuryFeeUsd: usd("mercury_fee_usd"),
    status: text("status").notNull().default("waiting"),
    inTxHash: text("in_tx_hash"),
    outTxHash: text("out_tx_hash"),
    failReason: text("fail_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("funding_intent_user_created_idx").on(t.userId, t.createdAt),
    /* Deposits by chain and status over a range — which chains money arrives
       from, and whether that is changing. Added for the removed admin
       dashboard and kept — see order_created_status_idx. */
    index("funding_intent_created_chain_idx").on(t.createdAt, t.originChainName, t.status),
    /**
     * The deposit's identity, and the webhook's idempotency.
     *
     * One quote is one deposit: the amount is fixed by a signature before
     * Relay ever sees it, so Relay has nothing to regenerate and the id it
     * gave us stays the id the fill lands under. That was not true while
     * deposit addresses existed — an open address is reusable, and Relay
     * reissues a quote on over- or underpayment — which is why this index was
     * briefly a partial one over a `deposit_address` column that no longer
     * exists.
     */
    uniqueIndex("funding_intent_request_idx").on(t.relayRequestId),
  ],
);
export type FundingIntent = typeof fundingIntents.$inferSelect;

/**
 * Money moved into and out of the Earn vault, one row per transaction.
 *
 * What makes "earned so far" knowable: the vault reports only what the shares
 * are worth now, so what was earned is that, less what went in, plus what came
 * back out. The chain has the same facts, but reading every past transaction
 * back to answer one number on a screen is not something to do per request.
 */
export const earnEvents = pgTable(
  "earn_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: walletId(),
    /** deposit or withdraw. */
    kind: text("kind").notNull(),
    /** USDC that left the wallet (deposit) or arrived in it (withdraw). */
    usdcAmount: usd("usdc_amount").notNull(),
    vault: text("vault").notNull(),
    originSource: originSource(),
    txSignature: text("tx_signature").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("earn_event_user_idx").on(t.userId, t.vault),
    // Confirming the same transaction twice writes nothing new.
    uniqueIndex("earn_event_signature_idx").on(t.txSignature),
  ],
);
export type EarnEvent = typeof earnEvents.$inferSelect;

/**
 * The history reader's queue: one row per wallet whose past is to be read.
 *
 * A table rather than memory, so the reader could move into a process of its
 * own later without changing how work is handed to it, and so a restart loses
 * nothing. Taken with `for update skip locked`, so two readers could share it.
 *
 * One row per wallet, kept after it is done. Its cursors are what let a wallet
 * that is linked again be read from where it stopped rather than from the start.
 */
export const historyJobs = pgTable(
  "history_job",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    /**
     * The newest signature read, per account the reader walks (each token
     * account and the loan account). An account with no entry has not been read.
     */
    cursors: jsonb("cursors").$type<Record<string, string>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    /** Not before this. Set further out after a failure, so a broken wallet does not spin. */
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("history_job_status_run_after_idx").on(t.status, t.runAfter)],
);
export type HistoryJob = typeof historyJobs.$inferSelect;

/**
 * A transaction as the chain returned it, kept raw.
 *
 * Kept so a better rule later can re-derive events without reading the chain
 * again. Keyed by signature alone: one transaction can belong to several
 * wallets' histories, and nothing in it says which account read it, so it is
 * not deleted with a wallet.
 */
export const historyTxs = pgTable("history_tx", {
  signature: text("signature").primaryKey(),
  slot: bigint("slot", { mode: "bigint" }).notNull(),
  /** Null when the node did not know the block's time. */
  blockTime: timestamp("block_time", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  raw: jsonb("raw").notNull(),
});
export type HistoryTx = typeof historyTxs.$inferSelect;

/**
 * One thing the history reader found in a wallet's past.
 *
 * Its own table, apart from Mercury's records. Only the reader's last step
 * turns these into `lot`, `loan_event` and `earn_event` rows.
 */
export const historyEvents = pgTable(
  "history_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: walletId(),
    /** The token account or loan account whose history this came from. */
    account: text("account").notNull(),
    signature: text("signature")
      .notNull()
      .references(() => historyTxs.signature),
    blockTime: timestamp("block_time", { withTimezone: true }),
    kind: text("kind", {
      enum: [
        "in",
        "out",
        "loan_open",
        "loan_deposit",
        "loan_withdraw",
        "loan_borrow",
        "loan_repay",
        "loan_liquidated",
        "earn_deposit",
        "earn_withdraw",
      ],
    }).notNull(),
    mint: text("mint"),
    /** In the mint's smallest unit. */
    amountRaw: bigint("amount_raw", { mode: "bigint" }),
    /** What left the wallet in the same transaction: what a swap paid with. */
    counterMint: text("counter_mint"),
    counterAmountRaw: bigint("counter_amount_raw", { mode: "bigint" }),
    /** For a transfer in, who sent it. Tells a move between a person's own wallets apart. */
    sourceOwner: text("source_owner"),
  },
  (t) => [
    index("history_event_wallet_account_time_idx").on(t.walletId, t.account, t.blockTime),
    // Reading a transaction twice writes nothing new.
    uniqueIndex("history_event_identity_idx").on(t.walletId, t.account, t.signature, t.kind),
  ],
);
export type HistoryEvent = typeof historyEvents.$inferSelect;
