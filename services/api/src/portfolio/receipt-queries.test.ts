import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import { USDC_MINT, type TransactionDetail } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, fundingIntents, instruments, orders, tokens, users } from "../db/schema.js";
import { settleOrder } from "../orders/settle.js";
import { recordLoanEvents } from "../lending/record.js";
import { planLoanEvents } from "../lending/events.js";
import { readReceipt, type ReceiptChain } from "./receipt-queries.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const FRIEND = "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W";
const RELAYER = "4bXpkay5mCujD5BnjtpBGXLbuAZ2rUKhbfW8QBtQxrRm";

const noChain: ReceiptChain = { history: { transaction: async () => null } };

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:receipt" }).returning();
  const [stranger] = await db.insert(users).values({ privyUserId: "did:privy:stranger" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", logoUrl: "https://logo/nvda.png" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  return { db, userId: user!.id, strangerId: stranger!.id, instrumentId: instrument!.id, tokenId: token!.id };
};

type Seeded = Awaited<ReturnType<typeof seed>>;

const rowFor = async (s: Seeded, signature: string, kind?: string) => {
  const rows = await s.db.select().from(activities).where(eq(activities.txSignature, signature));
  return rows.find((r) => kind === undefined || r.kind === kind)!;
};

/** A $10 buy of NVDA that paid $0.26 of fees, $0.05 of them Mercury's, settled as the fill route does. */
const settledBuy = async (s: Seeded) => {
  const [order] = await s.db
    .insert(orders)
    .values({
      userId: s.userId,
      instrumentId: s.instrumentId,
      side: "buy",
      usdAmount: "10",
      decision: { kind: "execute" },
      chosenTokenId: s.tokenId,
      status: "executing",
      feeUsd: "0.26",
      mercuryFeeUsd: "0.05",
    })
    .returning();
  await settleOrder(s.db, {
    userId: s.userId,
    orderId: order!.id,
    signature: "SigBuy",
    side: "buy",
    ticker: "NVDA",
    mint: NVDAX,
    tokenId: s.tokenId,
    instrumentId: s.instrumentId,
    fill: {
      kind: "filled",
      tokensRaw: 4_461_900n,
      tokens: D("0.044619"),
      shares: D("0.044619"),
      usd: D("9.74"),
      feeUsd: D("0.26"),
      pricePerShare: D("218.29"),
      occurredAt: new Date("2026-10-15T14:32:00Z"),
    },
    referencePricePerShare: D("218.05"),
  });
  return rowFor(s, "SigBuy");
};

const loan = (
  s: Seeded,
  intent: Parameters<typeof planLoanEvents>[0],
  signature: string,
  at: string,
  debtAfter: string,
) =>
  recordLoanEvents(
    s.db,
    planLoanEvents(intent, () => 8),
    {
      userId: s.userId,
      signature,
      occurredAt: new Date(at),
      borrowApy: D("0.058"),
      debtAfterUsd: D(debtAfter),
      collateralAfterUsd: D("4.36"),
      mintFor: (e) => (e.kind === "pledge" || e.kind === "unpledge" ? NVDAX : USDC_MINT),
    },
  );

describe("readReceipt", () => {
  it("reads a buy back from its order and the lot it wrote", async () => {
    const s = await seed();
    const row = await settledBuy(s);
    const found = await readReceipt(s.db, s.userId, row.id, WALLET, noChain);
    expect(found?.row.title).toBe("Bought NVDA");
    expect(found?.row.logoUrl).toBe("https://logo/nvda.png");
    expect(found?.detail).toMatchObject({
      type: "trade",
      side: "buy",
      ticker: "NVDA",
      shares: "0.044619",
      pricePerShare: "218.29",
      referencePricePerShare: "218.05",
      sharesUsd: "9.74",
      mercuryFeeUsd: "0.05",
      networkFeeUsd: "0.21",
    });
  });

  /* A row is somebody's. Another account asking for it by id learns nothing, not even that it exists. */
  it("finds nothing for another account's row", async () => {
    const s = await seed();
    const row = await settledBuy(s);
    expect(await readReceipt(s.db, s.strangerId, row.id, WALLET, noChain)).toBeNull();
  });

  it("finds nothing for an id that is not one", async () => {
    const s = await seed();
    expect(await readReceipt(s.db, s.userId, "not-a-uuid", WALLET, noChain)).toBeNull();
  });

  it("reads both halves of a pledge-and-borrow, from either row", async () => {
    const s = await seed();
    await loan(
      s,
      { kind: "deposit_and_borrow", ticker: "NVDA", tokensRaw: "2239976", usd: D("2.11") },
      "SigLoan",
      "2026-10-16T09:05:00Z",
      "2.11",
    );
    const borrow = await rowFor(s, "SigLoan", "borrow");
    const found = await readReceipt(s.db, s.userId, borrow.id, WALLET, noChain);
    expect(found?.detail).toMatchObject({
      type: "loan",
      legs: [
        { kind: "pledge", usdAmount: null, ticker: "NVDA", tokens: "0.02239976" },
        { kind: "borrow", usdAmount: "2.11", ticker: "NVDA", tokens: null },
      ],
      borrowApy: "0.058",
      debtAfterUsd: "2.11",
      openedAccount: true,
      interestPaidUsd: null,
    });
    const pledge = await rowFor(s, "SigLoan", "pledge");
    expect((await readReceipt(s.db, s.userId, pledge.id, WALLET, noChain))?.detail).toEqual(found?.detail);
  });

  it("says how much of the repay that closed a loan was interest, and that it opened no account", async () => {
    const s = await seed();
    await loan(s, { kind: "borrow", usd: D("2.11") }, "SigBorrow", "2026-10-16T09:05:00Z", "2.11");
    await recordLoanEvents(
      s.db,
      [
        {
          kind: "repay",
          usdAmount: D("2.110015"),
          ticker: null,
          tokensRaw: null,
          title: "Repaid your loan in full",
          subtitle: null,
        },
      ],
      {
        userId: s.userId,
        signature: "SigClose",
        occurredAt: new Date("2026-10-17T09:05:00Z"),
        borrowApy: D("0.058"),
        debtAfterUsd: ZERO,
        collateralAfterUsd: D("4.36"),
        mintFor: () => USDC_MINT,
      },
    );
    const found = await readReceipt(s.db, s.userId, (await rowFor(s, "SigClose")).id, WALLET, noChain);
    expect(found?.detail).toMatchObject({ type: "loan", openedAccount: false, interestPaidUsd: "0.000015" });
  });

  it("names where a deposit came from and Mercury's fee on it", async () => {
    const s = await seed();
    const [intent] = await s.db
      .insert(fundingIntents)
      .values({
        userId: s.userId,
        relayRequestId: "0xrequest",
        originChainId: 8453,
        originCurrency: "0xcbbtc",
        originChainName: "Base",
        originCurrencySymbol: "cbBTC",
        recipientAddress: WALLET,
        mercuryFeeUsd: "0.05",
        status: "success",
        inTxHash: "0xbase",
        outTxHash: "SigDeposit",
      })
      .returning();
    const [row] = await s.db
      .insert(activities)
      .values({
        userId: s.userId,
        kind: "transfer_in",
        title: "Added cash",
        subtitle: "cbBTC from Base",
        amountUsd: "21.04",
        txSignature: "SigDeposit",
        mint: USDC_MINT,
        refTable: "funding_intent",
        refId: intent!.id,
      })
      .returning();
    const found = await readReceipt(s.db, s.userId, row!.id, WALLET, noChain);
    expect(found?.detail).toEqual({
      type: "deposit",
      fromChain: "Base",
      fromToken: "cbBTC",
      mercuryFeeUsd: "0.05",
      sourceTx: "0xbase",
    });
  });

  it("reads who a send went to off its transaction, and what opening their account cost", async () => {
    const s = await seed();
    const [row] = await s.db
      .insert(activities)
      .values({
        userId: s.userId,
        kind: "transfer_out",
        title: "Sent cash",
        amountUsd: "20",
        txSignature: "SigSend",
        mint: USDC_MINT,
      })
      .returning();
    const usdc = (owner: string, rawAmount: bigint) => ({ mint: USDC_MINT, owner, rawAmount, decimals: 6 });
    const sent: TransactionDetail = {
      signature: "SigSend",
      blockTime: 1,
      succeeded: true,
      accountKeys: [RELAYER, WALLET, FRIEND],
      feeLamports: 5000n,
      preLamports: [0n, 0n, 0n],
      postLamports: [0n, 0n, 0n],
      preTokens: [usdc(WALLET, 100_000_000n), usdc(RELAYER, 7_000_000n)],
      postTokens: [usdc(WALLET, 79_750_000n), usdc(RELAYER, 7_250_000n), usdc(FRIEND, 20_000_000n)],
    };
    const chain: ReceiptChain = {
      history: { transaction: async (sig) => (sig === "SigSend" ? sent : null) },
      relayer: RELAYER,
    };
    const found = await readReceipt(s.db, s.userId, row!.id, WALLET, chain);
    expect(found?.detail).toEqual({ type: "transfer", counterparty: FRIEND, accountSetupUsd: "0.25" });
  });

  /* The node being down is a receipt with less on it, not an error in place of one. */
  it("still answers when the transaction cannot be read", async () => {
    const s = await seed();
    const [row] = await s.db
      .insert(activities)
      .values({
        userId: s.userId,
        kind: "transfer_out",
        title: "Sent cash",
        amountUsd: "20",
        txSignature: "SigGone",
        mint: USDC_MINT,
      })
      .returning();
    const failing: ReceiptChain = {
      history: {
        transaction: async () => {
          throw new Error("rpc down");
        },
      },
    };
    const found = await readReceipt(s.db, s.userId, row!.id, WALLET, failing);
    expect(found?.row.title).toBe("Sent cash");
    expect(found?.detail).toBeNull();
  });

  it("has no detail for a row with nothing behind it", async () => {
    const s = await seed();
    const [row] = await s.db
      .insert(activities)
      .values({
        userId: s.userId,
        kind: "loan_alert",
        title: "Your loan is close to its limit",
        subtitle: "Repay some.",
      })
      .returning();
    const found = await readReceipt(s.db, s.userId, row!.id, WALLET, noChain);
    expect(found?.row.subtitle).toBe("Repay some.");
    expect(found?.detail).toBeNull();
  });
});
