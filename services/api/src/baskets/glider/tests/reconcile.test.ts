import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { USDC_MINT, type TransactionDetail } from "@mercury/chain";
import { mercuryWallet, testDb } from "../../../db/testing.js";
import { activities, basketActions, instruments, lots, tokens, users, wallets } from "../../../db/schema.js";
import { D } from "@mercury/core";
import { reconcileBasketExits, verifiedExitTransfers } from "../reconcile.js";

const SMART = "7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
const OWNER = "5hw9GJx6pajUsh2RSopHi3DesMkSRSh7ad9VGPVPWcyE";
const SOURCE_ACCOUNT = "8H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
const DESTINATION_ACCOUNT = "9H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
const SIGNATURE = "5".repeat(88);
const NOW = new Date("2026-10-07T00:05:00Z");
const TRANSFER_TIME = 1_791_331_380;

const payload = {
  mode: "liquidate_usdc" as const,
  smartAccountId: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${SMART}`,
  recipientAccountId: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${OWNER}`,
  baselineSignature: "baseline",
  authorization: {
    message: {
      portfolioId: "portfolio-1",
      recipientAccountId: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${OWNER}`,
      assets: [{ assetId: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:stock`, amountRaw: "1" }],
      nonce: `0x${"a".repeat(64)}`,
      expiresAt: 1_791_340_000,
      liquidate: true,
    },
    signature: "signed",
  },
  authorizedAssets: [{ mint: "stock", amountRaw: "1" }],
  expectedTransfers: [{ mint: USDC_MINT, symbol: "USDC", amountRaw: null }],
  templateName: "NVDA & TSLA 50/50",
};

const transaction = (sourceOwner = SMART): TransactionDetail => ({
  signature: SIGNATURE,
  blockTime: TRANSFER_TIME,
  succeeded: true,
  accountKeys: [SOURCE_ACCOUNT, DESTINATION_ACCOUNT],
  feeLamports: 0n,
  preLamports: [],
  postLamports: [],
  preTokens: [
    { owner: sourceOwner, mint: USDC_MINT, rawAmount: 5_000_000n, decimals: 6 },
    { owner: OWNER, mint: USDC_MINT, rawAmount: 0n, decimals: 6 },
  ],
  postTokens: [
    { owner: sourceOwner, mint: USDC_MINT, rawAmount: 0n, decimals: 6 },
    { owner: OWNER, mint: USDC_MINT, rawAmount: 5_000_000n, decimals: 6 },
  ],
  tokenTransfersIn: [
    {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      source: SOURCE_ACCOUNT,
      destination: DESTINATION_ACCOUNT,
      authority: sourceOwner,
      sourceOwner,
      destinationOwner: OWNER,
      mint: USDC_MINT,
      rawAmount: 5_000_000n,
      decimals: 6,
    },
  ],
});

describe("verifiedExitTransfers", () => {
  it("matches exact smart-account source, owner destination, mint and actual amount", () => {
    expect(verifiedExitTransfers(transaction(), payload)).toEqual([
      { mint: USDC_MINT, rawAmount: 5_000_000n, decimals: 6 },
    ]);
  });

  it("rejects the right mint and recipient when the source is another account", () => {
    expect(verifiedExitTransfers(transaction("AnotherSmartAccount"), payload)).toEqual([]);
  });

  it("rejects an in-kind transfer whose smart-account debit differs from the signed amount", () => {
    expect(
      verifiedExitTransfers(transaction(), {
        ...payload,
        expectedTransfers: [{ mint: USDC_MINT, symbol: "USDC", amountRaw: "6000000" }],
      }),
    ).toEqual([]);
  });
});

it("enriches an existing Added cash row idempotently before scanning the smart account", async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:exit" }).returning();
  const walletId = await mercuryWallet(db, user!.id);
  const [action] = await db
    .insert(basketActions)
    .values({
      userId: user!.id,
      slug: "nvda-tsla-50-50",
      kind: "liquidate_to_usdc",
      ownerAccountId: payload.recipientAccountId,
      strategyId: "strategy-1",
      portfolioId: "portfolio-1",
      operationId: "operation-1",
      nonce: payload.authorization.message.nonce,
      payload,
      reconciliationState: "pending",
      reconcileAfter: new Date("2026-10-07T00:04:00Z"),
      createdAt: new Date("2026-10-07T00:00:00Z"),
    })
    .returning();
  await db.insert(activities).values({
    userId: user!.id,
    walletId,
    kind: "transfer_in",
    occurredAt: new Date(TRANSFER_TIME * 1_000),
    title: "Added cash",
    amountUsd: "5",
    txSignature: SIGNATURE,
    mint: USDC_MINT,
  });

  const result = await reconcileBasketExits(
    db,
    {
      operation: async () => ({
        operationId: "operation-1",
        portfolioId: "portfolio-1",
        kind: "swap",
        state: "completed",
        createdAt: "2026-10-07T00:01:00Z",
        updatedAt: "2026-10-07T00:04:00Z",
        finishedAt: "2026-10-07T00:04:00Z",
        error: null,
      }),
      history: {
        tokenAccountsFor: async () => [],
        signatures: async () => {
          throw new Error("existing watcher candidate should settle without a signature scan");
        },
        transaction: async () => transaction(),
      },
    },
    NOW,
  );
  expect(result).toMatchObject({ checked: 1, recorded: 1, settled: 1, failed: 0 });

  const rows = await db.select().from(activities).where(eq(activities.userId, user!.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "liquidate_to_usdc",
    refTable: "basket_action",
    refId: action!.id,
    tokenQuantity: "5.000000000000000000",
    amountUsd: "5.000000000000000000",
  });
  expect((await db.select().from(basketActions).where(eq(basketActions.id, action!.id)))[0]).toMatchObject({
    reconciliationState: "settled",
  });

  expect(
    await reconcileBasketExits(
      db,
      {
        operation: async () => {
          throw new Error("settled action must not be polled again");
        },
        history: {
          tokenAccountsFor: async () => [],
          signatures: async () => [],
          transaction: async () => null,
        },
      },
      NOW,
    ),
  ).toEqual({ checked: 0, recorded: 0, settled: 0, stopped: 0, failed: 0 });
  expect(await db.select().from(activities).where(eq(activities.userId, user!.id))).toHaveLength(1);
});

describe("an in-kind exit, recorded where it landed with its cost", () => {
  const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  const MERCURY = "MercuryWa11et111111111111111111111111111111";
  const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";

  /** A linked wallet (OWNER) whose basket paid 1 TSLAx out to `recipient`, $300 of the basket's cost going with it. */
  const seed = async (recipient: string) => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:basket-move" }).returning();
    const mercuryId = await mercuryWallet(db, user!.id, MERCURY);
    const [linked] = await db
      .insert(wallets)
      .values({ userId: user!.id, address: OWNER, kind: "external", isPrimary: false })
      .returning();
    const [tsla] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    await db
      .insert(tokens)
      .values({ instrumentId: tsla!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 });
    const exit = {
      ...payload,
      mode: "in_kind" as const,
      recipientAccountId: `${SOL}:${recipient}`,
      authorization: {
        ...payload.authorization,
        message: {
          ...payload.authorization.message,
          recipientAccountId: `${SOL}:${recipient}`,
          liquidate: false,
        },
      },
      expectedTransfers: [{ mint: TSLAX, symbol: "TSLAx", amountRaw: "100000000" }],
      exitCosts: [{ mint: TSLAX, costUsd: "300" }],
    };
    const [action] = await db
      .insert(basketActions)
      .values({
        userId: user!.id,
        slug: "nvda-tsla-50-50",
        kind: "withdraw_in_kind",
        ownerAccountId: `${SOL}:${OWNER}`,
        strategyId: "strategy-1",
        portfolioId: "portfolio-1",
        operationId: "operation-1",
        nonce: exit.authorization.message.nonce,
        payload: exit,
        reconciliationState: "pending",
        reconcileAfter: new Date("2026-10-07T00:04:00Z"),
        createdAt: new Date("2026-10-07T00:00:00Z"),
      })
      .returning();
    const landedIn = recipient === MERCURY ? mercuryId : linked!.id;
    // What wallet-events wrote first, seeing tokens arrive.
    await db.insert(activities).values({
      userId: user!.id,
      walletId: landedIn,
      kind: "transfer_in",
      occurredAt: new Date(TRANSFER_TIME * 1_000),
      title: "Received TSLAx",
      txSignature: SIGNATURE,
      mint: TSLAX,
    });
    const moved: TransactionDetail = {
      ...transaction(),
      preTokens: [
        { owner: SMART, mint: TSLAX, rawAmount: 100_000_000n, decimals: 8 },
        { owner: recipient, mint: TSLAX, rawAmount: 0n, decimals: 8 },
      ],
      postTokens: [
        { owner: SMART, mint: TSLAX, rawAmount: 0n, decimals: 8 },
        { owner: recipient, mint: TSLAX, rawAmount: 100_000_000n, decimals: 8 },
      ],
      tokenTransfersIn: [
        {
          programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          source: SOURCE_ACCOUNT,
          destination: DESTINATION_ACCOUNT,
          authority: SMART,
          sourceOwner: SMART,
          destinationOwner: recipient,
          mint: TSLAX,
          rawAmount: 100_000_000n,
          decimals: 8,
        },
      ],
    };
    const reconcile = () =>
      reconcileBasketExits(
        db,
        {
          operation: async () => ({
            operationId: "operation-1",
            portfolioId: "portfolio-1",
            kind: "withdraw",
            state: "completed",
            createdAt: "2026-10-07T00:01:00Z",
            updatedAt: "2026-10-07T00:04:00Z",
            finishedAt: "2026-10-07T00:04:00Z",
            error: null,
          }),
          history: {
            tokenAccountsFor: async () => [],
            // The basket account's payout, found scanning it since the exit was signed.
            signatures: async () => [
              { signature: SIGNATURE, slot: 1, blockTime: TRANSFER_TIME, failed: false },
            ],
            transaction: async () => moved,
          },
        },
        NOW,
      );
    return { db, userId: user!.id, mercuryId, linkedId: linked!.id, action: action!, reconcile };
  };

  it("files a move into the Mercury wallet's feed, and gives the shares their share of what the basket cost", async () => {
    const s = await seed(MERCURY);
    expect(await s.reconcile()).toMatchObject({ recorded: 1, settled: 1 });

    const [row] = await s.db.select().from(activities).where(eq(activities.txSignature, SIGNATURE));
    expect([row!.walletId, row!.kind, row!.refId]).toEqual([s.mercuryId, "withdraw_in_kind", s.action.id]);
    const [lot] = await s.db.select().from(lots).where(eq(lots.walletId, s.mercuryId));
    expect([
      lot!.source,
      lot!.tokenQty,
      D(lot!.shares).toString(),
      D(lot!.unitCostUsd).toString(),
      lot!.isEstimated,
    ]).toEqual(["basket_exit", 100_000_000n, "1", "300", false]);
  });

  it("files a linked wallet's exit to itself in its own feed, not the Mercury wallet's", async () => {
    const s = await seed(OWNER);
    await s.reconcile();
    const [row] = await s.db.select().from(activities).where(eq(activities.txSignature, SIGNATURE));
    expect(row!.walletId).toBe(s.linkedId);
    expect((await s.db.select().from(lots).where(eq(lots.walletId, s.linkedId))).length).toBe(1);
  });

  it("carries the cost once, however many times the exit is looked at again", async () => {
    const s = await seed(MERCURY);
    await s.reconcile();
    await s.db
      .update(basketActions)
      .set({ reconciliationState: "pending", reconcileAfter: new Date("2026-10-07T00:04:00Z") })
      .where(eq(basketActions.id, s.action.id));
    await s.reconcile();
    expect(await s.db.select().from(lots).where(eq(lots.walletId, s.mercuryId))).toHaveLength(1);
  });

  it("carries the cost once when two passes look at the same exit at once", async () => {
    const s = await seed(MERCURY);
    await Promise.all([s.reconcile(), s.reconcile()]);
    expect(await s.db.select().from(lots).where(eq(lots.walletId, s.mercuryId))).toHaveLength(1);
  });

  it("writes the feed row and the shares' cost together: one that fails leaves neither, and the next pass writes both", async () => {
    const s = await seed(MERCURY);
    await s.db.execute(sql`alter table lot add constraint no_lots_yet check (false) not valid`);
    expect(await s.reconcile()).toMatchObject({ recorded: 0, failed: 1 });
    // Neither the exit's feed row nor its cost: the transaction that would have written both rolled back.
    const exitRows = () => s.db.select().from(activities).where(eq(activities.refId, s.action.id));
    expect(await exitRows()).toEqual([]);
    expect(await s.db.select().from(lots)).toEqual([]);

    await s.db.execute(sql`alter table lot drop constraint no_lots_yet`);
    await s.db
      .update(basketActions)
      .set({
        reconciliationState: "pending",
        reconcileAfter: new Date("2026-10-07T00:04:00Z"),
        resolvedAt: null,
      })
      .where(eq(basketActions.id, s.action.id));
    await s.reconcile();
    expect(await exitRows()).toHaveLength(1);
    expect(await s.db.select().from(lots).where(eq(lots.walletId, s.mercuryId))).toHaveLength(1);
  });

  it("writes no lot when no cost share was known when the exit was signed", async () => {
    const s = await seed(MERCURY);
    const { exitCosts: _none, ...withoutCost } = s.action.payload as { exitCosts?: unknown };
    await s.db.update(basketActions).set({ payload: withoutCost }).where(eq(basketActions.id, s.action.id));
    await s.reconcile();
    expect(await s.db.select().from(lots).where(eq(lots.walletId, s.mercuryId))).toEqual([]);
  });
});
