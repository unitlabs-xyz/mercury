/**
 * One seeded world, shared by the four aggregate tests.
 *
 * Fixed dates and fixed amounts, so every assertion is an exact figure rather
 * than "greater than zero" — an aggregate test that only checks a number is
 * positive passes just as happily when the group-by is wrong.
 *
 * The shape is chosen so each query has something to get wrong:
 *
 * - three users, one of whom has done nothing at all, so a count that joins
 *   where it should left-join is visible
 * - two snapshots per holder at different hours, so assets under management
 *   double if the query sums every reading instead of the latest per user
 * - a `refused` order, which belongs in the status breakdown and not in volume
 * - deposits from two chains with one failure, which is the question the
 *   dashboard was asked for
 * - a basket action still `pending` with its `reconcile_after` in the past,
 *   which is the definition of stuck
 */
import type { Db } from "../db/client.js";
import {
  basketActions,
  fundingIntents,
  instruments,
  orders,
  portfolioSnapshots,
  users,
  wallets,
} from "../db/schema.js";

const at = (iso: string): Date => new Date(iso);

/** The window the tests use. Every fixture row falls inside it but the ones that say otherwise. */
export const FIXTURE_RANGE = { from: "2026-09-01", to: "2026-10-01" } as const;

export interface SeededIds {
  readonly userA: string;
  readonly userB: string;
  /** Signed up and did nothing. */
  readonly userC: string;
  readonly apple: string;
  readonly tesla: string;
}

export const seedAdminFixtures = async (db: Db): Promise<SeededIds> => {
  const [a, b, c] = await db
    .insert(users)
    .values([
      { privyUserId: "did:privy:a", email: "a@example.com", createdAt: at("2026-09-02T09:00:00Z") },
      { privyUserId: "did:privy:b", email: "b@example.com", createdAt: at("2026-09-02T10:00:00Z") },
      { privyUserId: "did:privy:c", email: "c@example.com", createdAt: at("2026-09-20T10:00:00Z") },
    ])
    .returning();
  const userA = a!.id;
  const userB = b!.id;
  const userC = c!.id;

  await db.insert(wallets).values([
    { userId: userA, address: "wallet-a", kind: "privy_embedded" },
    { userId: userB, address: "wallet-b", kind: "privy_embedded" },
    { userId: userC, address: "wallet-c", kind: "external" },
  ]);

  const [apple, tesla] = await db
    .insert(instruments)
    .values([
      { ticker: "AAPL", name: "Apple" },
      { ticker: "TSLA", name: "Tesla" },
    ])
    .returning();

  await db.insert(orders).values([
    {
      userId: userA,
      instrumentId: apple!.id,
      side: "buy",
      usdAmount: "100",
      decision: {},
      status: "filled",
      feeUsd: "1.00",
      mercuryFeeUsd: "0.50",
      createdAt: at("2026-09-05T12:00:00Z"),
    },
    {
      userId: userA,
      instrumentId: apple!.id,
      side: "sell",
      usdAmount: "50",
      decision: {},
      status: "filled",
      feeUsd: "0.50",
      mercuryFeeUsd: "0.25",
      realisedPnlUsd: "5.00",
      createdAt: at("2026-09-06T12:00:00Z"),
    },
    {
      userId: userB,
      instrumentId: tesla!.id,
      side: "buy",
      usdAmount: "200",
      decision: {},
      status: "filled",
      feeUsd: "2.00",
      mercuryFeeUsd: "1.00",
      createdAt: at("2026-09-05T13:00:00Z"),
    },
    /* Refused: counted under its status, and never in volume. A refused order
       is a quote nobody filled, so adding its dollars to traded volume would
       report money that never moved. */
    {
      userId: userB,
      instrumentId: tesla!.id,
      side: "buy",
      usdAmount: "999",
      decision: {},
      status: "refused",
      createdAt: at("2026-09-07T13:00:00Z"),
    },
  ]);

  await db.insert(fundingIntents).values([
    {
      userId: userA,
      relayRequestId: "relay-1",
      originChainId: 8453,
      originCurrency: "0xusdc",
      originChainName: "Base",
      originCurrencySymbol: "USDC",
      recipientAddress: "wallet-a",
      status: "settled",
      createdAt: at("2026-09-02T10:00:00Z"),
      updatedAt: at("2026-09-02T10:00:30Z"),
    },
    {
      userId: userA,
      relayRequestId: "relay-2",
      originChainId: 42_161,
      originCurrency: "0xusdc",
      originChainName: "Arbitrum",
      originCurrencySymbol: "USDC",
      recipientAddress: "wallet-a",
      status: "settled",
      createdAt: at("2026-09-03T10:00:00Z"),
      updatedAt: at("2026-09-03T10:01:00Z"),
    },
    {
      userId: userA,
      relayRequestId: "relay-3",
      originChainId: 8453,
      originCurrency: "0xusdc",
      originChainName: "Base",
      originCurrencySymbol: "USDC",
      recipientAddress: "wallet-a",
      status: "failed",
      failReason: "underpaid",
      createdAt: at("2026-09-04T10:00:00Z"),
      updatedAt: at("2026-09-04T10:05:00Z"),
    },
  ]);

  /* Two readings each, an hour apart. Assets under management is the later one
     per user — 150 + 250 — and 700 if a query sums them all. */
  await db.insert(portfolioSnapshots).values([
    {
      userId: userA,
      capturedAt: at("2026-09-30T10:00:00Z"),
      totalUsd: "100",
      stocksUsd: "60",
      cashUsd: "40",
    },
    {
      userId: userA,
      capturedAt: at("2026-09-30T11:00:00Z"),
      totalUsd: "150",
      stocksUsd: "100",
      cashUsd: "50",
    },
    {
      userId: userB,
      capturedAt: at("2026-09-30T10:00:00Z"),
      totalUsd: "200",
      stocksUsd: "150",
      cashUsd: "50",
    },
    {
      userId: userB,
      capturedAt: at("2026-09-30T11:00:00Z"),
      totalUsd: "250",
      stocksUsd: "200",
      cashUsd: "50",
    },
  ]);

  await db.insert(basketActions).values([
    {
      userId: userA,
      slug: "growth",
      kind: "enroll",
      ownerAccountId: "acct-a",
      strategyId: "strat-1",
      payload: {},
      operationId: "op-1",
      reconciliationState: "settled",
      resolvedAt: at("2026-09-10T11:00:00Z"),
      createdAt: at("2026-09-10T10:00:00Z"),
    },
    /* Still pending with its retry time long past: stuck, and the one row on
       this page anybody has to act on. */
    {
      userId: userA,
      slug: "growth",
      kind: "exit",
      ownerAccountId: "acct-a",
      strategyId: "strat-1",
      payload: {},
      operationId: "op-2",
      reconciliationState: "pending",
      reconcileAfter: at("2026-09-11T10:00:00Z"),
      createdAt: at("2026-09-11T09:00:00Z"),
    },
  ]);

  return { userA, userB, userC, apple: apple!.id, tesla: tesla!.id };
};
