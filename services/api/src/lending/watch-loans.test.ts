import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, loanAlerts, users, wallets } from "../db/schema.js";
import type { Notice, Notifier } from "../notify/ports.js";
import type { LendingPosition, LendingSource, LendingTerms } from "./ports.js";
import { watchAllLoans, type WatchDeps } from "./watch-loans.js";

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
