import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";
import { planFeeBackfill, type BackfillOrder } from "./backfill.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const RELAYER = "ReLay1nQ4Ka9ApDLnjZ8pQZaKuRnRxTYL5gWPhVrNqA";
const SIG = "sig-1";

const bal = (owner: string, rawAmount: bigint): TokenBalanceEntry => ({
  mint: USDC_MINT,
  owner,
  rawAmount,
  decimals: 6,
});

/**
 * A sponsored transaction: the relayer paid for it, so it is the first account
 * key, and its USDC went up by `fee` of a dollar.
 */
const charged = (fee: bigint, over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  signature: SIG,
  blockTime: 1_790_659_621,
  succeeded: true,
  accountKeys: [RELAYER, WALLET],
  feeLamports: 5_000n,
  preLamports: [],
  postLamports: [],
  preTokens: [bal(RELAYER, 1_000_000n)],
  postTokens: [bal(RELAYER, 1_000_000n + fee)],
  ...over,
});

/** $20 of NVDA at one share, recorded the old way: the fee is inside the price. */
const order = (over: Partial<BackfillOrder> = {}): BackfillOrder => ({
  id: "order-1",
  side: "buy",
  txSignature: SIG,
  wallet: WALLET,
  referencePrice: D("19.80"),
  lot: { id: "lot-1", shares: D(1), unitCostUsd: D("20.00") },
  ...over,
});

const planOne = (o: BackfillOrder, tx: TransactionDetail | null = charged(230_000n)) =>
  planFeeBackfill([o], tx === null ? new Map() : new Map([[SIG, tx]]));

describe("planFeeBackfill", () => {
  it("takes the fee back out of the price per share it was hidden in", () => {
    const plan = planOne(order());
    expect(plan.skipped).toEqual([]);
    const [c] = plan.corrections;
    expect(c!.feeUsd.toFixed(2)).toBe("0.23");
    // $20.00 recorded, $0.23 of which was never shares: $19.77 is the price.
    expect(c!.lot!.unitCostUsd.toFixed(2)).toBe("19.77");
    expect(c!.lot!.feeUsd.toFixed(2)).toBe("0.23");
  });

  it("divides the fee across the shares, not off the whole price", () => {
    const plan = planOne(order({ lot: { id: "lot-1", shares: D(4), unitCostUsd: D("5.00") } }));
    // $0.23 over four shares is $0.0575 each, so $4.9425 — not $4.77.
    expect(plan.corrections[0]!.lot!.unitCostUsd.toFixed(4)).toBe("4.9425");
  });

  it("carries the quote's reference price onto the lot, which is the nearest record there is", () => {
    expect(planOne(order()).corrections[0]!.lot!.referencePriceUsd!.toFixed(2)).toBe("19.80");
  });

  it("leaves the reference null on an order whose quote was not kept", () => {
    expect(planOne(order({ referencePrice: null })).corrections[0]!.lot!.referencePriceUsd).toBeNull();
  });

  it("records the fee on a sell and corrects no lot, because a sell writes none", () => {
    const plan = planOne(order({ side: "sell", lot: null }));
    const [c] = plan.corrections;
    expect(c!.feeUsd.toFixed(2)).toBe("0.23");
    expect(c!.lot).toBeUndefined();
  });

  it("reads no fee from a transaction the relayer did not charge in", () => {
    const plan = planOne(order(), charged(0n));
    expect(plan.corrections[0]!.feeUsd.toFixed()).toBe("0");
    // Nothing to take out, so the price it was recorded at was already right.
    expect(plan.corrections[0]!.lot!.unitCostUsd.toFixed(2)).toBe("20.00");
  });

  it("reads no fee from a relayer that spent USDC rather than receiving it", () => {
    const refunded = charged(0n, { postTokens: [bal(RELAYER, 900_000n)] });
    expect(planOne(order(), refunded).corrections[0]!.feeUsd.toFixed()).toBe("0");
  });

  it("finds the relayer without being told, from whoever paid for the transaction", () => {
    // A backfill has no relayer address: it is derived from a signing key that
    // lives only where the service is deployed. The transaction names the fee
    // payer, and `composeSponsored` makes that the relayer.
    const other = "ReLay2wQ7Kb3BpEMnkZ9qRZbLvSoSyUZM6hXQiWsOrB";
    const rotated = charged(0n, {
      accountKeys: [other, WALLET],
      preTokens: [bal(other, 0n)],
      postTokens: [bal(other, 230_000n)],
    });
    expect(planOne(order(), rotated).corrections[0]!.feeUsd.toFixed(2)).toBe("0.23");
  });

  it("reads no fee from a trade the trader paid for themselves", () => {
    // Unsponsored: the trader is the fee payer, and their USDC leg is the
    // trade. Reading it as a fee would take the whole cost off the lot.
    const unsponsored = charged(0n, {
      accountKeys: [WALLET],
      preTokens: [bal(WALLET, 0n)],
      postTokens: [bal(WALLET, 20_000_000n)],
    });
    const plan = planOne(order({ side: "sell", lot: null }), unsponsored);
    expect(plan.corrections[0]!.feeUsd.toFixed()).toBe("0");
  });

  it("reads no fee from a transaction with no accounts on it at all", () => {
    const headless = charged(230_000n, { accountKeys: [] });
    expect(planOne(order(), headless).corrections[0]!.feeUsd.toFixed()).toBe("0");
  });

  it("skips an order whose transaction the node no longer has", () => {
    const plan = planOne(order(), null);
    expect(plan.corrections).toEqual([]);
    expect(plan.skipped).toEqual([{ orderId: "order-1", reason: "transaction not found on chain" }]);
  });

  it("skips a transaction that failed, which filled nothing to correct", () => {
    const plan = planOne(order(), charged(230_000n, { succeeded: false }));
    expect(plan.corrections).toEqual([]);
    expect(plan.skipped[0]!.reason).toBe("transaction did not succeed");
  });

  it("skips rather than writing a price per share of nothing", () => {
    // A fee at or above the lot's whole recorded cost cannot be right, and a
    // zero price would report the position's entire value as profit.
    const plan = planOne(order({ lot: { id: "lot-1", shares: D(1), unitCostUsd: D("0.20") } }));
    expect(plan.corrections).toEqual([]);
    expect(plan.skipped[0]!.reason).toBe("fee is the whole of the recorded cost");
  });

  it("skips a lot recording no shares rather than dividing by it", () => {
    const plan = planOne(order({ lot: { id: "lot-1", shares: D(0), unitCostUsd: D(20) } }));
    expect(plan.corrections).toEqual([]);
    expect(plan.skipped[0]!.reason).toBe("lot records no shares");
  });

  it("corrects every order it is given, and reports each skip beside them", () => {
    const plan = planFeeBackfill(
      [order(), order({ id: "order-2", txSignature: "sig-missing" })],
      new Map([[SIG, charged(230_000n)]]),
    );
    expect(plan.corrections.map((c) => c.orderId)).toEqual(["order-1"]);
    expect(plan.skipped.map((s) => s.orderId)).toEqual(["order-2"]);
  });

  it("is the same correction however often it is computed", () => {
    const first = planOne(order());
    const second = planOne(order());
    expect(second.corrections[0]!.lot!.unitCostUsd.toFixed(18)).toBe(
      first.corrections[0]!.lot!.unitCostUsd.toFixed(18),
    );
  });
});
