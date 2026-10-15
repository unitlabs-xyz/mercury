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
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wallet_address_idx").on(t.address)],
);

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
    source: text("source", { enum: ["buy", "transfer_in", "dividend", "basket"] }).notNull(),
    /** True when we inferred the cost. The UI has to say so. */
    isEstimated: boolean("is_estimated").notNull().default(false),
    orderId: uuid("order_id"),
  },
  (t) => [index("lot_user_token_idx").on(t.userId, t.tokenId)],
);

/** A derived rollup, per user per instrument. Rebuildable from lots at any time. */
export const positions = pgTable(
  "position",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [primaryKey({ columns: [t.userId, t.instrumentId] })],
);

export const orders = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("activity_basket_portfolio_idx").on(t.userId, t.basketPortfolioId, t.occurredAt),
    /**
     * The idempotency guarantee. A movement seen twice — a crash between
     * writing and advancing a cursor, a transaction that appears in both of a
     * wallet's streams, or two API instances running the job — is written once.
     *
     * Rows where `mint` is null are not constrained, which is what lets the
     * dividend rows `position-sync` writes carry no mint and no signature.
     */
    uniqueIndex("activity_signature_mint_idx").on(t.userId, t.txSignature, t.mint),
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
  },
  (t) => [primaryKey({ columns: [t.userId, t.capturedAt] })],
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
    uniqueIndex("loan_event_signature_kind_idx").on(t.userId, t.txSignature, t.kind),
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
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** healthy, over_limit, margin_call or liquidation. See lending/capacity.ts. */
  health: text("health").notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LoanAlert = typeof loanAlerts.$inferSelect;

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
    status: text("status").notNull().default("waiting"),
    inTxHash: text("in_tx_hash"),
    outTxHash: text("out_tx_hash"),
    failReason: text("fail_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("funding_intent_user_created_idx").on(t.userId, t.createdAt),
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
