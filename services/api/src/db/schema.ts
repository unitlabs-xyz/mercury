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
    /** Cost per share, not per token. */
    unitCostUsd: usd("unit_cost_usd").notNull(),
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
 * signed in, so this is the one table that holds an email, and it is never
 * joined to anything. Read only through the admin export or the database.
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
     *
     * In the database rather than beside whoever sent it, because two things
     * send it now — the script by hand and the scheduled job — and a sender
     * that remembers privately will mail someone the other has already
     * reached. Adding to Privy's allowlist twice is free; emailing twice is
     * not.
     */
    betaMailedAt: timestamp("beta_mailed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("waitlist_email_idx").on(t.email),
    uniqueIndex("waitlist_position_idx").on(t.position),
    uniqueIndex("waitlist_slug_idx").on(t.slug),
  ],
);
export type WaitlistEntry = typeof waitlist.$inferSelect;

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
