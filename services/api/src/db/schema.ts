import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
 * We store no email. Privy holds it, and docs/05 says we do not copy it.
 */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Privy's DID for this user, e.g. "did:privy:clxxxx". Our join key to them. */
    privyUserId: text("privy_user_id").notNull(),
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

/** An append-only feed. Denormalised on purpose: read constantly, never joined. */
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
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    txSignature: text("tx_signature"),
    /** Which asset moved. Null on a row with no single asset, such as a dividend. */
    mint: text("mint"),
  },
  (t) => [
    index("activity_user_occurred_idx").on(t.userId, t.occurredAt, t.id),
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
  },
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
);
export type WaitlistEntry = typeof waitlist.$inferSelect;
