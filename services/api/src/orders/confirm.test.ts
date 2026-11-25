import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";
import { confirmOrder, type ConfirmOrderDeps } from "./confirm.js";
import type { StoredOrder } from "./store.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const RELAYER = "ReLay1nQ4Ka9ApDLnjZ8pQZaKuRnRxTYL5gWPhVrNqA";

const bal = (mint: string, owner: string, rawAmount: bigint, decimals: number): TokenBalanceEntry => ({
  mint,
  owner,
  rawAmount,
  decimals,
});

/** A buy that sent `fee` micro-USDC to the relayer beside the swap. */
const buyPaying = (feeRaw: bigint): TransactionDetail => ({
  signature: "sig-1",
  blockTime: 1_790_659_621,
  succeeded: true,
  accountKeys: [WALLET],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n],
  postLamports: [999_995_000n],
  preTokens: [bal(USDC_MINT, WALLET, 20_000_000n, 6), bal(USDC_MINT, RELAYER, 1_000_000n, 6)],
  postTokens: [
    bal(USDC_MINT, WALLET, 0n, 6),
    bal(USDC_MINT, RELAYER, 1_000_000n + feeRaw, 6),
    bal(NVDAX, WALLET, 100_000_000n, 8),
  ],
});

const order = (mercuryFeeUsd: string | null): StoredOrder => ({
  id: "order-1",
  decision: { kind: "execute", side: "buy", ticker: "NVDA", amount: "20", best: { mint: NVDAX } },
  status: "executing",
  usdAmount: "20",
  max: false,
  mercuryFeeUsd,
  createdAt: "2026-11-25T00:00:00.000Z",
  walletId: "wallet-1",
});

const settles: unknown[] = [];
const deps = (tx: TransactionDetail | null): ConfirmOrderDeps => ({
  history: { transaction: async () => tx },
  registry: { byMint: async () => ({ decimals: 8 }) as never },
  multipliers: { multiplierFor: async () => D(1) },
  prices: { pricesFor: async () => new Map() },
  fills: {
    tokenRef: async () => ({ tokenId: "t", instrumentId: "i" }),
    settle: async (input) => {
      settles.push(input);
      return { kind: "settled", realisedPnlUsd: null };
    },
  },
  relayer: RELAYER,
});

const input = { userId: "u", walletId: "wallet-1", address: WALLET, signature: "sig-1" };

describe("confirmOrder", () => {
  it("settles a fill that paid the fee it was built with", async () => {
    settles.length = 0;
    const r = await confirmOrder(deps(buyPaying(230_000n)), order("0.23"), input);
    expect(r.kind).toBe("settled");
    expect(settles).toHaveLength(1);
  });

  it("settles when the transaction paid more than Mercury's part, which is where the network's repayment goes", async () => {
    settles.length = 0;
    const r = await confirmOrder(deps(buyPaying(480_000n)), order("0.23"), input);
    expect(r.kind).toBe("settled");
  });

  /*
   * A linked wallet is the fee payer of its own trade, so nothing but the
   * message the server built stops its owner dropping the charge before signing.
   */
  it("refuses a fill whose transaction left out Mercury's fee", async () => {
    settles.length = 0;
    const r = await confirmOrder(deps(buyPaying(0n)), order("0.23"), input);
    expect(r).toMatchObject({ kind: "refused", status: 422, code: "validation_failed" });
    expect(settles).toHaveLength(0);
  });

  it("refuses a fill that paid a part of the fee", async () => {
    const r = await confirmOrder(deps(buyPaying(100_000n)), order("0.23"), input);
    expect(r.kind).toBe("refused");
  });

  it("does not ask for a fee the order was never built with", async () => {
    const r = await confirmOrder(deps(buyPaying(0n)), order(null), input);
    expect(r.kind).toBe("settled");
  });

  it("does not check a fee where there is no relayer to have been paid", async () => {
    const r = await confirmOrder({ ...deps(buyPaying(0n)), relayer: undefined }, order("0.23"), input);
    expect(r.kind).toBe("settled");
  });

  it("says pending while the node cannot return the transaction yet", async () => {
    expect(await confirmOrder(deps(null), order("0.23"), input)).toEqual({ kind: "pending" });
  });
});
