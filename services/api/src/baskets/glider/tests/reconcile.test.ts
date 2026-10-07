import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { USDC_MINT, type TransactionDetail } from "@mercury/chain";
import { testDb } from "../../../db/testing.js";
import { activities, basketActions, users } from "../../../db/schema.js";
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
