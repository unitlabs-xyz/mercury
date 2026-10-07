import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../store.js";
import { testDb } from "../../../db/testing.js";
import { activities, users } from "../../../db/schema.js";
import { eq } from "drizzle-orm";
import { USDC_MINT } from "@mercury/chain";

describe("JsonBasketStore", () => {
  it("persists an enrollment challenge across reads and records its result", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:pilot" }).returning();
    const store = new JsonBasketStore("postgres://unused", catalogJson, db);
    const id = await store.saveEnrollmentIntent({
      userId: user!.id,
      slug: "magnificent-seven",
      ownerAccountId: "solana:owner",
      strategyId: "strategy-1",
      expiresAt: new Date(Date.now() + 60_000),
      challenge: {
        flowId: "flow-1",
        accountIndex: "0",
        agentAccountId: "solana:agent",
        message: { kind: "solana-message", text: "Sign me" },
      },
    });
    expect(await store.enrollmentIntent(id)).toMatchObject({
      userId: user!.id,
      slug: "magnificent-seven",
      portfolioId: null,
      challenge: { flowId: "flow-1" },
    });
    await store.completeEnrollmentIntent(id, "portfolio-1");
    expect(await store.enrollmentIntent(id)).toMatchObject({ portfolioId: "portfolio-1" });
  });
  it("enriches a wallet-watcher transfer once and keeps rebalance history", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:activity" }).returning();
    const store = new JsonBasketStore("postgres://unused", catalogJson, db);
    const signature = "5".repeat(88);
    await db.insert(activities).values({
      userId: user!.id,
      kind: "transfer_out",
      title: "Sent cash",
      amountUsd: "5",
      txSignature: signature,
      mint: USDC_MINT,
    });
    const funding = {
      userId: user!.id,
      slug: "magnificent-seven",
      portfolioId: "portfolio-1",
      title: "Funded Magnificent Seven",
      signature,
      mint: USDC_MINT,
      amountRaw: 5_000_000n,
      occurredAt: new Date(),
    };
    await store.confirmFunding(funding);
    await store.confirmFunding(funding);
    const rows = await db.select().from(activities).where(eq(activities.userId, user!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "basket_funding",
      basketPortfolioId: "portfolio-1",
      title: funding.title,
    });
    await store.saveRebalance({
      userId: user!.id,
      slug: funding.slug,
      ownerAccountId: "solana:owner",
      strategyId: "strategy-1",
      portfolioId: "portfolio-1",
      operationId: "op-1",
      submittedAt: "2026-10-06T00:00:00Z",
    });
    expect(await store.recentActions(user!.id, "portfolio-1")).toMatchObject([
      { kind: "rebalance", operationId: "op-1" },
    ]);
    expect(await store.recentFunding(user!.id, "portfolio-1")).toHaveLength(1);
  });
  it("keeps one durable exit intent per signed nonce and attaches one operation idempotently", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:exit-intent" }).returning();
    const store = new JsonBasketStore("postgres://unused", catalogJson, db);
    const nonce = `0x${"a".repeat(64)}`;
    const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5hw9GJx6pajUsh2RSopHi3DesMkSRSh7ad9VGPVPWcyE";
    const input = {
      userId: user!.id,
      slug: "nvda-tsla-50-50",
      ownerAccountId: owner,
      strategyId: "strategy-1",
      portfolioId: "portfolio-1",
      nonce,
      expiresAt: new Date("2026-10-07T01:00:00Z"),
      payload: {
        mode: "liquidate_usdc" as const,
        smartAccountId: owner,
        recipientAccountId: owner,
        baselineSignature: null,
        authorization: {
          message: {
            portfolioId: "portfolio-1",
            recipientAccountId: owner,
            assets: [{ assetId: `${owner}/spl:stock`, amountRaw: "1" }],
            nonce,
            expiresAt: 1_791_340_000,
            liquidate: true,
          },
          signature: "signed",
        },
        authorizedAssets: [{ mint: "stock", amountRaw: "1" }],
        expectedTransfers: [{ mint: USDC_MINT, symbol: "USDC", amountRaw: null }],
        templateName: "NVDA & TSLA 50/50",
      },
    };
    const first = await store.saveExitIntent(input);
    const replay = await store.saveExitIntent(input);
    expect(replay.id).toBe(first.id);
    await store.attachExitOperation(first.id, "operation-1", new Date("2026-10-07T00:01:00Z"));
    await store.attachExitOperation(first.id, "operation-1", new Date("2026-10-07T00:01:00Z"));
    expect(await store.exitIntent(user!.id, nonce)).toMatchObject({
      id: first.id,
      operationId: "operation-1",
      payload: { baselineSignature: null },
    });
    await expect(
      store.attachExitOperation(first.id, "operation-2", new Date("2026-10-07T00:02:00Z")),
    ).rejects.toThrow(/conflicts/i);
  });
  it("resolves the curated catalog to Solana asset IDs", async () => {
    const baskets = await new JsonBasketStore("postgres://unused").load();
    expect(baskets).toHaveLength(23);
    expect(baskets.flatMap((basket) => basket.assets)).toHaveLength(208);
    const magnificentSeven = baskets.find((basket) => basket.slug === "magnificent-seven");
    expect(magnificentSeven?.assets).toContainEqual({
      ticker: "NVDA",
      assetId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
      weightBps: 1428,
    });
    expect(
      baskets.filter((basket) => basket.slug.endsWith("-tracker") && basket.name.endsWith("(Daily Variant)")),
    ).toHaveLength(4);
    expect(baskets.find((basket) => basket.slug === "nvda-tsla-50-50")).toMatchObject({
      providerId: "01M49AGQ193X4CRQ3MQ4YHNDZJ",
      sourceStrategyId: "01M49AGQ193X4CRQ3MQ4YHNDZJ",
      status: "candidate",
      tags: ["theme:technology"],
      schedule: { type: "interval", frequency: "daily" },
      assets: [
        { ticker: "NVDA", weightBps: 5000 },
        { ticker: "TSLA", weightBps: 5000 },
      ],
    });
  });

  it.each([
    [
      "unknown ticker",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[0]!.ticker = "UNKNOWN";
      },
      /UNKNOWN/,
    ],
    [
      "repeated asset",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[1]!.ticker = catalog.strategies[0]!.allocations[0]!.ticker;
      },
      /duplicate Solana asset/,
    ],
    [
      "incorrect total",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[0]!.weightBps += 1;
      },
      /10,000 bps/,
    ],
    [
      "missing primary grouping",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.tags = ["shelf:featured"];
      },
      /primary theme or pros tag/,
    ],
  ])("rejects a catalog with %s", async (_case, mutate, expected) => {
    const catalog = structuredClone(catalogJson);
    mutate(catalog);
    await expect(new JsonBasketStore("postgres://unused", catalog).load()).rejects.toThrow(expected);
  });
});
