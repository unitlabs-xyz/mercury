import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";
import { planFill, type FillContext } from "./fill.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const OTHER = "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const RELAYER = "ReLay1nQ4Ka9ApDLnjZ8pQZaKuRnRxTYL5gWPhVrNqA";
const NOW = new Date("2026-09-29T12:00:00.000Z");

const bal = (mint: string, owner: string, rawAmount: bigint, decimals: number): TokenBalanceEntry => ({
  mint,
  owner,
  rawAmount,
  decimals,
});

const tx = (over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  signature: "sig-1",
  blockTime: 1_790_659_621,
  succeeded: true,
  accountKeys: [WALLET],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n],
  postLamports: [999_995_000n],
  preTokens: [],
  postTokens: [],
  ...over,
});

const ctx = (over: Partial<FillContext> = {}): FillContext => ({
  wallet: WALLET,
  side: "buy",
  mint: NVDAX,
  decimals: 8,
  multiplier: D("1.001701196801074"),
  now: NOW,
  ...over,
});

/** $100 of USDC out, 0.44901800 NVDAx in — a first purchase, so no pre entry for the token. */
const aBuy = tx({
  preTokens: [bal(USDC_MINT, WALLET, 500_000_000n, 6)],
  postTokens: [bal(USDC_MINT, WALLET, 400_000_000n, 6), bal(NVDAX, WALLET, 44_901_800n, 8)],
});

describe("planFill", () => {
  it("reads the fill from the wallet's balances, not from any quote", () => {
    const f = planFill(aBuy, ctx());
    expect(f.kind).toBe("filled");
    if (f.kind !== "filled") return;

    expect(f.usd.toFixed()).toBe("100");
    expect(f.tokens.toFixed()).toBe("0.449018");
    expect(f.tokensRaw).toBe(44_901_800n);
    // 0.449018 tokens x 1.001701196801074 shares per token.
    expect(f.shares.toFixed(8)).toBe("0.44978187");
    expect(f.pricePerShare.toFixed(2)).toBe("222.33");
  });

  it("counts a token account created inside the same transaction, which every first buy is", () => {
    // `preTokens` has no NVDAx entry at all — the account did not exist yet.
    expect(aBuy.preTokens.some((b) => b.mint === NVDAX)).toBe(false);
    const f = planFill(aBuy, ctx());
    expect(f.kind).toBe("filled");
  });

  it("adds up two accounts for the same mint rather than picking one", () => {
    const f = planFill(
      tx({
        preTokens: [bal(USDC_MINT, WALLET, 500_000_000n, 6)],
        postTokens: [
          bal(USDC_MINT, WALLET, 400_000_000n, 6),
          bal(NVDAX, WALLET, 20_000_000n, 8),
          bal(NVDAX, WALLET, 24_901_800n, 8),
        ],
      }),
      ctx(),
    );
    expect(f.kind).toBe("filled");
    if (f.kind !== "filled") return;
    expect(f.tokensRaw).toBe(44_901_800n);
  });

  it("ignores balances that belong to somebody else in the same transaction", () => {
    const f = planFill(
      tx({
        preTokens: [bal(USDC_MINT, WALLET, 500_000_000n, 6)],
        postTokens: [
          bal(USDC_MINT, WALLET, 400_000_000n, 6),
          bal(NVDAX, WALLET, 44_901_800n, 8),
          bal(NVDAX, OTHER, 900_000_000n, 8),
        ],
      }),
      ctx(),
    );
    expect(f.kind).toBe("filled");
    if (f.kind !== "filled") return;
    expect(f.tokensRaw).toBe(44_901_800n);
  });

  it("reads a sell the other way round: tokens out, dollars in", () => {
    const f = planFill(
      tx({
        preTokens: [bal(NVDAX, WALLET, 44_901_800n, 8), bal(USDC_MINT, WALLET, 0n, 6)],
        postTokens: [bal(NVDAX, WALLET, 0n, 8), bal(USDC_MINT, WALLET, 99_500_000n, 6)],
      }),
      ctx({ side: "sell" }),
    );
    expect(f.kind).toBe("filled");
    if (f.kind !== "filled") return;
    expect(f.usd.toFixed()).toBe("99.5");
    expect(f.tokensRaw).toBe(44_901_800n);
  });

  it("refuses a transaction that failed on chain", () => {
    const f = planFill({ ...aBuy, succeeded: false }, ctx());
    expect(f.kind).toBe("not_a_fill");
    if (f.kind !== "not_a_fill") return;
    expect(f.detail).toMatch(/did not succeed/);
  });

  it("refuses a plain transfer in, where tokens arrived but no dollars left", () => {
    const f = planFill(tx({ preTokens: [], postTokens: [bal(NVDAX, WALLET, 44_901_800n, 8)] }), ctx());
    expect(f.kind).toBe("not_a_fill");
  });

  it("refuses a sell signature offered against a buy order, and the reverse", () => {
    const sellTx = tx({
      preTokens: [bal(NVDAX, WALLET, 44_901_800n, 8)],
      postTokens: [bal(NVDAX, WALLET, 0n, 8), bal(USDC_MINT, WALLET, 99_500_000n, 6)],
    });
    expect(planFill(sellTx, ctx({ side: "buy" })).kind).toBe("not_a_fill");
    expect(planFill(aBuy, ctx({ side: "sell" })).kind).toBe("not_a_fill");
  });

  it("refuses somebody else's transaction, however well formed", () => {
    expect(planFill(aBuy, ctx({ wallet: OTHER })).kind).toBe("not_a_fill");
  });

  it("dates the fill by the block, falling back to now when the node gives no time", () => {
    const withTime = planFill(aBuy, ctx());
    expect(withTime.kind === "filled" && withTime.occurredAt.toISOString()).toBe("2026-09-29T05:27:01.000Z");
    const noTime = planFill({ ...aBuy, blockTime: null }, ctx());
    expect(noTime.kind === "filled" && noTime.occurredAt).toEqual(NOW);
  });
});

/**
 * A sponsored trade puts the swap and the charge for sponsoring it in one
 * transaction, so the wallet's own USDC delta is gross of the charge on a buy
 * and net of it on a sell. Neither is the trade: the charge bought no shares.
 * It is read off the relayer's own leg and reported separately, so a position
 * does not open at a loss of exactly the fee and a sale does not give up its
 * fee twice.
 */
describe("a sponsored trade", () => {
  /** A buy charges first, so $20 leaves the wallet and $19.77 of it reaches the swap. */
  const sponsoredBuy = tx({
    preTokens: [bal(USDC_MINT, WALLET, 20_000_000n, 6), bal(USDC_MINT, RELAYER, 1_000_000n, 6)],
    postTokens: [
      bal(USDC_MINT, WALLET, 0n, 6),
      bal(USDC_MINT, RELAYER, 1_230_000n, 6),
      bal(NVDAX, WALLET, 100_000_000n, 8),
    ],
  });

  it("prices a buy on what reached the swap, not on what left the wallet", () => {
    const fill = planFill(sponsoredBuy, ctx({ relayer: RELAYER, multiplier: D(1) }));
    expect(fill.kind).toBe("filled");
    if (fill.kind !== "filled") return;
    expect(fill.feeUsd.toFixed(2)).toBe("0.23");
    expect(fill.usd.toFixed(2)).toBe("19.77");
    // Not $20.00. A whole token bought with $19.77 cost $19.77, and recording
    // it at $20.00 is the -1.15% opening loss this separation exists to stop.
    expect(fill.pricePerShare.toFixed(2)).toBe("19.77");
  });

  it("prices a sell on what the swap made, not on what reached the wallet", () => {
    const sold = tx({
      preTokens: [bal(NVDAX, WALLET, 100_000_000n, 8), bal(USDC_MINT, RELAYER, 1_000_000n, 6)],
      // One whole token out; $10 in from the swap, less $0.25 back to the relayer.
      postTokens: [
        bal(NVDAX, WALLET, 0n, 8),
        bal(USDC_MINT, WALLET, 9_750_000n, 6),
        bal(USDC_MINT, RELAYER, 1_250_000n, 6),
      ],
    });
    const fill = planFill(sold, ctx({ side: "sell", relayer: RELAYER, multiplier: D(1) }));
    expect(fill.kind).toBe("filled");
    if (fill.kind !== "filled") return;
    expect(fill.feeUsd.toFixed(2)).toBe("0.25");
    expect(fill.usd.toFixed(2)).toBe("10.00");
    expect(fill.pricePerShare.toFixed(2)).toBe("10.00");
  });

  it("charges nothing when the trade was not sponsored, so the delta is the trade", () => {
    const fill = planFill(aBuy, ctx());
    expect(fill.kind === "filled" && fill.feeUsd.toFixed()).toBe("0");
    expect(fill.kind === "filled" && fill.usd.toFixed()).toBe("100");
  });

  it("ignores a relayer leg nobody named, so an unsponsored trade cannot lose dollars to it", () => {
    // The same transaction, read without being told who the relayer is: the
    // charge is then part of the trade, which is the old behaviour and the bug.
    const fill = planFill(sponsoredBuy, ctx({ multiplier: D(1) }));
    expect(fill.kind === "filled" && fill.usd.toFixed(2)).toBe("20.00");
  });

  it("reads no charge from a relayer that spent USDC rather than receiving it", () => {
    const refunded = tx({
      preTokens: [bal(USDC_MINT, WALLET, 20_000_000n, 6), bal(USDC_MINT, RELAYER, 1_000_000n, 6)],
      postTokens: [
        bal(USDC_MINT, WALLET, 0n, 6),
        bal(USDC_MINT, RELAYER, 900_000n, 6),
        bal(NVDAX, WALLET, 100_000_000n, 8),
      ],
    });
    // A negative fee would add dollars to the swap that nobody paid, pricing
    // the share above what left the wallet.
    const fill = planFill(refunded, ctx({ relayer: RELAYER, multiplier: D(1) }));
    expect(fill.kind === "filled" && fill.feeUsd.toFixed()).toBe("0");
    expect(fill.kind === "filled" && fill.usd.toFixed(2)).toBe("20.00");
  });

  it("refuses a buy whose whole movement was the charge, rather than pricing shares at nothing", () => {
    const allFee = tx({
      preTokens: [bal(USDC_MINT, WALLET, 230_000n, 6), bal(USDC_MINT, RELAYER, 0n, 6)],
      postTokens: [
        bal(USDC_MINT, WALLET, 0n, 6),
        bal(USDC_MINT, RELAYER, 230_000n, 6),
        bal(NVDAX, WALLET, 100_000_000n, 8),
      ],
    });
    const fill = planFill(allFee, ctx({ relayer: RELAYER, multiplier: D(1) }));
    expect(fill.kind).toBe("not_a_fill");
  });

  it("takes no charge from a relayer that is the trader, which would read the trade as its own fee", () => {
    // A sell, because that is where it bites: the trader's USDC goes up, so
    // reading their own leg as the charge would double the proceeds. On a buy
    // the leg is negative and no charge is read from it either way.
    const sold = tx({
      preTokens: [bal(NVDAX, WALLET, 100_000_000n, 8)],
      postTokens: [bal(NVDAX, WALLET, 0n, 8), bal(USDC_MINT, WALLET, 10_000_000n, 6)],
    });
    const fill = planFill(sold, ctx({ side: "sell", relayer: WALLET, multiplier: D(1) }));
    expect(fill.kind === "filled" && fill.feeUsd.toFixed()).toBe("0");
    expect(fill.kind === "filled" && fill.usd.toFixed(2)).toBe("10.00");
  });
});
