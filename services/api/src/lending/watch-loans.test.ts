import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import {
  activities,
  instruments,
  loanAlerts,
  loanEvents,
  lots,
  notifications,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import type { Notice, Notifier } from "../notify/ports.js";
import type { LendingPosition, LendingSource, LendingTerms } from "./ports.js";
import { HISTORY_EVERY_MS, historyDue, loanMemory, watchAllLoans, type WatchDeps } from "./watch-loans.js";
import type { KaminoLoanTx } from "./kamino-loans.js";
import { outstandingPrincipal } from "./interest.js";
import { loanLedger } from "./record.js";
import { unlinkWallet } from "../wallets/store.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPYX = "XsSPYx000000000000000000000000000000000000";
const ADDRESS = "Wa11etWatch0000000000000000000000000000";
const NOW = new Date("2026-09-30T12:00:00.000Z");

const terms = (): LendingTerms => ({
  collateral: [
    {
      ticker: "SPY",
      isStock: true,
      symbol: "SPYx",
      mint: SPYX,
      reserve: "r1",
      decimals: 8,
      ltv: D("0.73"),
      liquidationThreshold: D("0.75"),
      pricePerToken: D("100"),
      depositCapTokens: null,
      depositedTokens: ZERO,
    },
  ],
  minPositionUsd: D("0.01"),
  pool: {
    reserve: "usdc",
    availableUsd: D("1000000"),
    borrowedUsd: ZERO,
    borrowCapUsd: D("1000000"),
    borrowFactor: D(1),
    borrowApy: D("0.06"),
  },
});

/** One SPYx pledged at $100, owing `debt`. Liquidation starts at $75 of debt. */
const position = (debt: string): LendingPosition => ({
  obligation: "ob",
  deposits: [
    {
      ticker: "SPY",
      isStock: true,
      mint: SPYX,
      raw: 100_000_000n,
      decimals: 8,
      tokens: D(1),
      valueUsd: D("100"),
    },
  ],
  debtUsd: D(debt),
  owedUsdc: D(debt),
  debtBfAdjustedUsd: D(debt),
  allowedBorrowUsd: D("73"),
  liquidationBorrowUsd: D("75"),
});

const deps = (debt: string, notifier: Notifier): WatchDeps => ({
  lending: {
    terms: async () => terms(),
    position: async () => (debt === "none" ? null : position(debt)),
    build: async () => ({ transactions: [], messages: [], firstTime: false, expiresAt: NOW }),
  } satisfies LendingSource,
  chain: { tokenBalances: async () => [], mintConfig: async () => null } as ChainReader,
  usdcMint: USDC,
  notifier,
});

const collect = (ok = true) => {
  const sent: Notice[] = [];
  return { sent, notifier: { send: async (n: Notice) => (sent.push(n), ok) } satisfies Notifier };
};

const seed = async (email: string | null = "holder@example.com") => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:w", email }).returning();
  await db
    .insert(wallets)
    .values({ userId: user!.id, address: ADDRESS, kind: "privy_embedded", isPrimary: true });
  return { db, userId: user!.id };
};

/**
 * The job that runs when nobody is looking.
 *
 * Everything here was already computable; what was missing was anything
 * computing it without a browser open. The person most likely to be liquidated
 * is the one not watching the page.
 */
describe("watchAllLoans", () => {
  it("puts the warning in the inbox too, once", async () => {
    const { db, userId } = await seed();
    for (let i = 0; i < 3; i++) await watchAllLoans(db, deps("60", collect().notifier), NOW);

    const [row] = await db.select().from(activities).where(eq(activities.userId, userId));
    const told = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(told).toHaveLength(1);
    expect(told[0]!.kind).toBe("loan_alert");
    expect(told[0]!.activityId).toBe(row!.id);
  });

  /* The in-app copy is the one we control: it is there even when the mail is not. */
  it("puts it in the inbox when the mail did not get through", async () => {
    const { db } = await seed();
    await watchAllLoans(db, deps("60", collect(false).notifier), NOW);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("warns the owner of a loan that has gone past its limit", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect();
    // $60 against $100 of SPYx: past our target of $58.40, below the margin call at $63.75.
    const summary = await watchAllLoans(db, deps("60", notifier), NOW);

    expect(summary.loans).toBe(1);
    expect(summary.alerted).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(sent[0]!.to).toBe("holder@example.com");
    expect(sent[0]!.subject).toContain("past its safe limit");
  });

  it("writes the feed row as well, which is the copy we control", async () => {
    const { db, userId } = await seed();
    await watchAllLoans(db, deps("60", collect().notifier), NOW);
    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("loan_alert");
  });

  /* The reason the table exists: a job on a five-minute clock must not repeat itself. */
  it("says it once, however many times it runs", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect();
    for (let i = 0; i < 5; i++) await watchAllLoans(db, deps("60", notifier), NOW);
    expect(sent).toHaveLength(1);
  });

  it("speaks again when the same loan gets worse", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect();
    await watchAllLoans(db, deps("60", notifier), NOW);
    // $70 of $75: past the margin call at $63.75.
    await watchAllLoans(db, deps("70", notifier), NOW);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toContain("Repay now");
  });

  /*
   * Silence is not having told somebody. If the mark advanced on a failed
   * send, the message that mattered would be the one never retried.
   */
  it("tries again when the message did not get through", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect(false);
    await watchAllLoans(db, deps("60", notifier), NOW);
    await watchAllLoans(db, deps("60", notifier), NOW);
    expect(sent).toHaveLength(2);
  });

  /* The mail is tried again each pass; the app is told once. */
  it("puts the warning in the feed and the inbox once while it keeps trying the mail", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect(false);
    for (let i = 0; i < 3; i++) await watchAllLoans(db, deps("60", notifier), NOW);
    expect(sent).toHaveLength(3);
    expect(await db.select().from(activities)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("tells someone with no address in the app once, not every pass", async () => {
    const { db } = await seed(null);
    for (let i = 0; i < 3; i++) await watchAllLoans(db, deps("60", collect().notifier), NOW);
    expect(await db.select().from(activities)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("says it again in the app when the loan gets worse, and again after it recovers and relapses", async () => {
    const { db } = await seed(null);
    const { notifier } = collect();
    await watchAllLoans(db, deps("60", notifier), NOW);
    // Worse: past the margin call.
    await watchAllLoans(db, deps("70", notifier), NOW);
    expect(await db.select().from(activities)).toHaveLength(2);
    // Healthy, then over its limit again.
    await watchAllLoans(db, deps("10", notifier), NOW);
    await watchAllLoans(db, deps("60", notifier), NOW);
    expect(await db.select().from(activities)).toHaveLength(3);
  });

  it("leaves a healthy loan alone", async () => {
    const { db } = await seed();
    const { sent, notifier } = collect();
    const summary = await watchAllLoans(db, deps("40", notifier), NOW);
    expect(summary.loans).toBe(1);
    expect(summary.alerted).toBe(0);
    expect(sent).toEqual([]);
  });

  it("does not count an account with no loan at all", async () => {
    const { db } = await seed();
    const summary = await watchAllLoans(db, deps("none", collect().notifier), NOW);
    expect(summary.loans).toBe(0);
  });

  /* Measured 23 October 2026: seventeen wallets' balances read every five minutes to find no loans. */
  it("reads a wallet's balances only once it knows the wallet owes something", async () => {
    const { db } = await seed();
    let reads = 0;
    const counting = (debt: string): WatchDeps => ({
      ...deps(debt, collect().notifier),
      chain: { tokenBalances: async () => (reads++, []), mintConfig: async () => null } as ChainReader,
    });
    await watchAllLoans(db, counting("none"), NOW);
    await watchAllLoans(db, counting("0"), NOW);
    expect(reads).toBe(0);
    await watchAllLoans(db, counting("60"), NOW);
    expect(reads).toBe(1);
  });

  it("counts a wallet whose loan could not be read as failed, and checks the rest", async () => {
    const { db } = await seed();
    const failing: WatchDeps = {
      ...deps("60", collect().notifier),
      lending: {
        ...deps("60", collect().notifier).lending,
        position: async () => Promise.reject(new Error("429")),
      },
    };
    expect(await watchAllLoans(db, failing, NOW)).toMatchObject({ loans: 0, failed: 1 });
  });

  it("still records the alert for somebody with no address to write to", async () => {
    const { db, userId } = await seed(null);
    const { sent, notifier } = collect();
    const summary = await watchAllLoans(db, deps("60", notifier), NOW);
    expect(sent).toEqual([]);
    expect(summary.delivered).toBe(0);
    // The feed still carries it: they see it the moment they open the app.
    expect(await db.select().from(activities).where(eq(activities.userId, userId))).toHaveLength(1);
  });

  it("clears the mark when a loan recovers, so a relapse is worth saying again", async () => {
    const { db, userId } = await seed();
    const { sent, notifier } = collect();
    await watchAllLoans(db, deps("60", notifier), NOW);
    await watchAllLoans(db, deps("40", notifier), NOW);
    const [mark] = await db.select().from(loanAlerts).where(eq(loanAlerts.userId, userId));
    expect(mark!.health).toBe("healthy");
    await watchAllLoans(db, deps("60", notifier), NOW);
    expect(sent).toHaveLength(2);
  });
});

describe("watchAllLoans, linked wallets", () => {
  const PHANTOM = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";

  /** Loans by wallet: `owed` maps an address to its debt, and anything absent owes nothing. */
  const depsFor = (owed: Record<string, string>, notifier: Notifier): WatchDeps => ({
    ...deps("none", notifier),
    lending: {
      terms: async () => terms(),
      position: async (wallet: string) => (owed[wallet] === undefined ? null : position(owed[wallet]!)),
      build: async () => ({ transactions: [], messages: [], firstTime: false, expiresAt: NOW }),
    } satisfies LendingSource,
  });

  const withLinked = async (over: Partial<typeof wallets.$inferInsert> = {}) => {
    const { db, userId } = await seed();
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: PHANTOM, kind: "external", isPrimary: false, ...over })
      .returning();
    return { db, userId, linkedId: linked!.id };
  };

  it("checks a loan in a linked wallet as it checks the Mercury wallet's, and remembers it apart", async () => {
    const { db, linkedId } = await withLinked();
    const { sent, notifier } = collect();

    const summary = await watchAllLoans(db, depsFor({ [PHANTOM]: "60" }, notifier), NOW);

    expect(summary).toMatchObject({ loans: 1, alerted: 1, delivered: 1 });
    expect(sent).toHaveLength(1);
    const [remembered] = await db.select().from(loanAlerts);
    expect(remembered).toMatchObject({ walletId: linkedId, health: "over_limit" });
  });

  it("names the linked wallet and says where it can be repaid", async () => {
    const { db } = await withLinked({ label: "Phantom main" });
    const { sent, notifier } = collect();

    await watchAllLoans(db, depsFor({ [PHANTOM]: "64" }, notifier), NOW);

    expect(sent[0]!.subject).toBe("Repay now, or your shares will be sold (Phantom main)");
    expect(sent[0]!.body).toContain("This loan is in your linked wallet Phantom main.");
    expect(sent[0]!.body).toContain(
      "Repay or add collateral from Mercury on the web, where Phantom main approves it",
    );
    const [row] = await db.select().from(activities);
    expect(row!.title).toBe("Liquidation risk · Phantom main");
  });

  it("warns about each wallet's loan on its own, so two loans are two warnings", async () => {
    const { db } = await withLinked();
    const { sent, notifier } = collect();

    const summary = await watchAllLoans(db, depsFor({ [ADDRESS]: "60", [PHANTOM]: "60" }, notifier), NOW);

    expect(summary).toMatchObject({ loans: 2, alerted: 2 });
    expect(sent.map((n) => n.subject).sort()).toEqual([
      "Your loan is past its safe limit",
      "Your loan is past its safe limit (7EYn…awMs)",
    ]);
    expect(await db.select().from(loanAlerts)).toHaveLength(2);
  });

  /** A pass that reads the chain while the person unlinks the wallet, as can happen in the seconds a pass takes. */
  const unlinkedMidPass = (
    s: { db: Awaited<ReturnType<typeof withLinked>>["db"]; userId: string; linkedId: string },
    owed: Record<string, string>,
    notifier: Notifier,
  ): WatchDeps => ({
    ...depsFor(owed, notifier),
    chain: {
      tokenBalances: async () => {
        await unlinkWallet(s.db, { userId: s.userId, walletId: s.linkedId, deleteHistory: false, now: NOW });
        return [];
      },
      mintConfig: async () => null,
    } as unknown as ChainReader,
  });

  it("says nothing about a wallet unlinked while the pass was reading it, and remembers nothing", async () => {
    const s = await withLinked();
    const { sent, notifier } = collect();

    const summary = await watchAllLoans(s.db, unlinkedMidPass(s, { [PHANTOM]: "74" }, notifier), NOW);

    expect(summary).toMatchObject({ alerted: 0 });
    expect(sent).toEqual([]);
    expect(await s.db.select().from(activities)).toEqual([]);
    // Unlinking cleared it, and it stays cleared: linked again, a loan in trouble is warned about at once.
    expect(await s.db.select().from(loanAlerts)).toEqual([]);
  });

  it("leaves an unlinked wallet's loan alone, however close it gets", async () => {
    const { db } = await withLinked({ unlinkedAt: NOW });
    const { sent, notifier } = collect();

    const summary = await watchAllLoans(db, depsFor({ [PHANTOM]: "74" }, notifier), NOW);

    expect(summary).toMatchObject({ loans: 0, alerted: 0 });
    expect(sent).toEqual([]);
  });
});

/**
 * A liquidation is sent by a bot, not built by Mercury, so nothing Mercury
 * records sees it. The live loan does: the watcher reads Kamino's own record
 * of the loan when collateral or debt fell since its last pass, and books
 * what it finds.
 */
describe("watchAllLoans, a liquidation Mercury did not build", () => {
  const LIQ = "LiquidationSig";
  /** `tokens` SPYx pledged at $100 each, owing `debt`. */
  const live = (tokens: number, debt: string): LendingPosition => ({
    ...position(debt),
    deposits: [
      {
        ticker: "SPY",
        isStock: true,
        mint: SPYX,
        raw: BigInt(tokens) * 100_000_000n,
        decimals: 8,
        tokens: D(tokens),
        valueUsd: D(tokens * 100),
      },
    ],
    allowedBorrowUsd: D(tokens * 73),
    liquidationBorrowUsd: D(tokens * 75),
  });
  /** Kamino's record of the sale: one SPYx taken, worth $100, repaying $95 of the debt. */
  const sale: KaminoLoanTx[] = [
    // The loan as Mercury made it: in Kamino's record too.
    {
      signature: "MercuryPledge",
      at: new Date("2026-09-01T12:00:00.000Z"),
      action: "deposit",
      mint: SPYX,
      symbol: "SPYx",
      amount: D(2),
      priceUsd: D(100),
      valueUsd: D(200),
      liquidation: false,
    },
    {
      signature: "MercuryBorrow",
      at: new Date("2026-09-02T00:00:00.000Z"),
      action: "borrow",
      mint: USDC,
      symbol: "USDC",
      amount: D(100),
      priceUsd: D(1),
      valueUsd: D(100),
      liquidation: false,
    },
    {
      signature: LIQ,
      at: new Date(NOW.getTime() - 2 * 60_000),
      action: "liquidate",
      mint: USDC,
      symbol: "USDC",
      amount: D(95),
      priceUsd: D(1),
      valueUsd: D(95),
      liquidation: false,
    },
    {
      signature: LIQ,
      at: new Date(NOW.getTime() - 2 * 60_000),
      action: "liquidate",
      mint: SPYX,
      symbol: "SPYx",
      amount: D(1),
      priceUsd: D(100),
      valueUsd: D(100),
      liquidation: true,
    },
  ];

  const scene = async () => {
    const db = await testDb();
    const [user] = await db
      .insert(users)
      .values({ privyUserId: "did:privy:liq", email: "holder@example.com" })
      .returning();
    const userId = user!.id;
    const [w] = await db
      .insert(wallets)
      .values({
        userId,
        address: ADDRESS,
        kind: "privy_embedded",
        isPrimary: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning();
    const [instrument] = await db.insert(instruments).values({ ticker: "SPY", name: "S&P 500" }).returning();
    const [token] = await db
      .insert(tokens)
      .values({ instrumentId: instrument!.id, mint: SPYX, symbol: "SPYx", issuer: "backed", decimals: 8 })
      .returning();
    // Bought 2 SPYx at $120 in Mercury, pledged both, borrowed $100: all recorded by Mercury.
    await db.insert(lots).values({
      userId,
      walletId: w!.id,
      tokenId: token!.id,
      instrumentId: instrument!.id,
      tokenQty: 200_000_000n,
      shares: "2",
      unitCostUsd: "120",
      feeUsd: "0",
      acquiredAt: new Date("2026-09-01T00:00:00.000Z"),
      source: "buy",
    });
    await db.insert(loanEvents).values({
      userId,
      walletId: w!.id,
      kind: "borrow",
      usdAmount: "100",
      debtAfterUsd: "100",
      collateralAfterUsd: "200",
      txSignature: "MercuryBorrow",
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
    });

    let now = { position: live(2, "100"), history: [] as KaminoLoanTx[] };
    let asked = 0;
    const { sent, notifier } = collect();
    const memory = loanMemory();
    const watch = (at: Date) =>
      watchAllLoans(
        db,
        {
          ...deps("0", notifier),
          lending: { ...deps("0", notifier).lending, position: async () => now.position },
          loanHistory: {
            market: "Market",
            loans: {
              transactions: async () => {
                asked += 1;
                return now.history;
              },
              days: async () => [],
            },
          },
        },
        at,
        memory,
      );
    return {
      db,
      userId,
      walletId: w!.id,
      sent,
      watch,
      asked: () => asked,
      liquidate: () => {
        now = { position: live(1, "5"), history: sale };
      },
    };
  };

  it("finds the sale, books it as one, and tells the person in the feed, the inbox and by mail", async () => {
    const s = await scene();
    await s.watch(new Date(NOW.getTime() - 5 * 60_000));
    s.liquidate();
    const summary = await s.watch(NOW);

    expect(summary.liquidations).toBe(1);
    const [row] = await s.db.select().from(loanEvents).where(eq(loanEvents.txSignature, LIQ));
    // Sold 1 for the $95 of debt it repaid; it had cost $120.
    expect([
      row!.kind,
      row!.originSource,
      D(row!.usdAmount!).toString(),
      D(row!.realisedPnlUsd!).toString(),
    ]).toEqual(["liquidation", "chain", "95", "-25"]);
    const feed = await s.db.select().from(activities).where(eq(activities.txSignature, LIQ));
    expect(feed.map((a) => [a.kind, a.title, a.subtitle])).toEqual([
      ["liquidation", "Sold by Kamino", "1 SPY at $100.00 · repaid $95.00 of the loan"],
    ]);
    const told = await s.db.select().from(notifications).where(eq(notifications.userId, s.userId));
    expect(told.map((n) => [n.kind, n.activityId])).toEqual([["loan_alert", feed[0]!.id]]);
    expect(s.sent.map((m) => m.subject)).toEqual(["Kamino sold collateral to repay your loan"]);
    expect(s.sent[0]!.body).toContain("Kamino sold 1 SPY at $100.00, which repaid $95.00");
    // What Kamino repaid is off what was borrowed: the interest is not mistaken for a $0 loan.
    expect(outstandingPrincipal(await loanLedger(s.db, s))?.toString()).toBe("5");
  });

  it("tells it once, and reads nothing more while the loan sits still", async () => {
    const s = await scene();
    await s.watch(new Date(NOW.getTime() - 5 * 60_000));
    s.liquidate();
    await s.watch(NOW);
    const asked = s.asked();
    await s.watch(new Date(NOW.getTime() + 5 * 60_000));
    expect(s.asked()).toBe(asked);
    expect(s.sent).toHaveLength(1);
    expect(await s.db.select().from(notifications)).toHaveLength(1);
  });

  it("still finds a sale after a restart, when the loan was last warned it was close", async () => {
    const s = await scene();
    s.liquidate();
    await s.db.insert(loanAlerts).values({ walletId: s.walletId, userId: s.userId, health: "margin_call" });
    // A new process: no memory of the last pass. Close to liquidation is reason enough to read.
    expect((await s.watch(NOW)).liquidations).toBe(1);
  });
});

describe("historyDue", () => {
  const P = (tokens: bigint, debt: string): LendingPosition => ({
    ...position(debt),
    deposits: [{ ...position(debt).deposits[0]!, raw: tokens }],
  });
  const seen = () => {
    const m = loanMemory();
    m.pledged.set("w", new Map([[SPYX, 100n]]));
    m.debt.set("w", D(50));
    m.readAt.set("w", NOW.getTime());
    return m;
  };
  const soon = NOW.getTime() + 5 * 60_000;

  it("reads when collateral fell since the last pass", () => {
    expect(historyDue(seen(), "w", P(60n, "50"), "healthy", soon)).toBe(true);
  });
  it("reads when the debt fell since the last pass", () => {
    expect(historyDue(seen(), "w", P(100n, "10"), "healthy", soon)).toBe(true);
  });
  it("reads a loan last warned it was close to liquidation, every pass", () => {
    expect(historyDue(seen(), "w", P(100n, "50"), "margin_call", soon)).toBe(true);
  });
  it("leaves a loan alone that sat still, until the hour is up", () => {
    expect(historyDue(seen(), "w", P(100n, "50"), "healthy", soon)).toBe(false);
    expect(historyDue(seen(), "w", P(100n, "50"), null, NOW.getTime() + HISTORY_EVERY_MS)).toBe(true);
  });
  it("reads a loan it has never read", () => {
    expect(historyDue(loanMemory(), "w", P(100n, "50"), null, soon)).toBe(true);
  });
});
