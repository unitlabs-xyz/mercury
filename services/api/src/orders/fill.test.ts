import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";
import { planFill, type FillContext } from "./fill.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const OTHER = "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
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
