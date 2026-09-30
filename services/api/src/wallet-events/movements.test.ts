import { describe, expect, it } from "vitest";
import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import { USDC_MINT } from "@mercury/chain";
import { movementsIn, NATIVE_SOL_MINT } from "./movements.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const OTHER = "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";
const NOW = new Date("2026-09-28T12:00:00.000Z");

const usdc = (owner: string, amount: bigint): TokenBalanceEntry => ({
  mint: USDC_MINT,
  owner,
  rawAmount: amount,
  decimals: 6,
});

/** The wallet is the fee payer at index 0 unless a test says otherwise. */
const tx = (over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  signature: SIG,
  blockTime: 1_790_573_221,
  succeeded: true,
  accountKeys: [WALLET, OTHER],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n, 0n],
  postLamports: [999_995_000n, 0n],
  preTokens: [],
  postTokens: [],
  ...over,
});

const KAMINO = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const ctx = { wallet: WALLET, now: NOW, lendingProgram: KAMINO };

describe("movementsIn — USDC", () => {
  it("reads a first deposit, where the account was created by this transaction and has no pre entry", () => {
    const m = movementsIn(tx({ preTokens: [], postTokens: [usdc(WALLET, 500_000_000n)] }), ctx);
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(USDC_MINT);
    expect(m[0]!.kind).toBe("transfer_in");
    expect(m[0]!.title).toBe("Added cash");
    expect(m[0]!.amountUsd!.toFixed()).toBe("500");
    expect(m[0]!.signature).toBe(SIG);
    expect(m[0]!.occurredAt).toEqual(new Date(1_790_573_221 * 1000));
  });

  it("reads a withdrawal as money leaving", () => {
    const m = movementsIn(
      tx({ preTokens: [usdc(WALLET, 500_000_000n)], postTokens: [usdc(WALLET, 200_000_000n)] }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("transfer_out");
    expect(m[0]!.title).toBe("Sent cash");
    expect(m[0]!.amountUsd!.toFixed()).toBe("300");
  });

  it("sums two accounts for the same mint, which a wallet is allowed to have", () => {
    const m = movementsIn(
      tx({
        preTokens: [usdc(WALLET, 100_000_000n), usdc(WALLET, 0n)],
        postTokens: [usdc(WALLET, 100_000_000n), usdc(WALLET, 50_000_000n)],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.amountUsd!.toFixed()).toBe("50");
  });

  it("ignores another owner's accounts in the same transaction", () => {
    const m = movementsIn(tx({ preTokens: [usdc(OTHER, 0n)], postTokens: [usdc(OTHER, 900_000_000n)] }), ctx);
    expect(m).toEqual([]);
  });

  it("falls back to the given clock when the node reports no block time", () => {
    const m = movementsIn(tx({ blockTime: null, postTokens: [usdc(WALLET, 1_000_000n)] }), ctx);
    expect(m[0]!.occurredAt).toEqual(NOW);
  });
});

describe("movementsIn — native SOL", () => {
  it("reads an incoming transfer where the wallet is not the fee payer", () => {
    const m = movementsIn(
      tx({
        accountKeys: [OTHER, WALLET],
        preLamports: [5_000_000_000n, 1_000_000_000n],
        postLamports: [3_799_994_700n, 2_200_000_000n],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(NATIVE_SOL_MINT);
    expect(m[0]!.kind).toBe("transfer_in");
    expect(m[0]!.title).toBe("Received SOL");
    expect(m[0]!.subtitle).toBe("1.2 SOL");
    expect(m[0]!.amountUsd).toBeNull();
  });

  it("emits nothing when the only lamport change is the fee the wallet paid", () => {
    // preLamports/postLamports in the default differ by exactly feeLamports.
    expect(movementsIn(tx(), ctx)).toEqual([]);
  });

  it("adds the fee back, so an outgoing transfer reports the amount sent and not the gas", () => {
    const m = movementsIn(tx({ preLamports: [1_000_000_000n, 0n], postLamports: [499_995_000n, 0n] }), ctx);
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("transfer_out");
    expect(m[0]!.subtitle).toBe("0.5 SOL");
  });

  it("suppresses the SOL leg when the same transaction moved USDC, because that is rent and gas", () => {
    const m = movementsIn(
      tx({
        preLamports: [1_000_000_000n, 0n],
        postLamports: [997_955_720n, 0n], // fee plus rent for the new token account
        postTokens: [usdc(WALLET, 500_000_000n)],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(USDC_MINT);
  });

  it("emits nothing when the wallet is not an account key at all", () => {
    const m = movementsIn(tx({ accountKeys: [OTHER], preLamports: [1n], postLamports: [2n] }), ctx);
    expect(m).toEqual([]);
  });

  it("does not trim a whole number to nonsense", () => {
    const m = movementsIn(
      tx({
        accountKeys: [OTHER, WALLET],
        preLamports: [0n, 0n],
        postLamports: [0n, 100_000_000_000n],
      }),
      ctx,
    );
    expect(m[0]!.subtitle).toBe("100 SOL");
  });
});

describe("a swap is not a cash transfer", () => {
  const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const stock = (owner: string, amount: bigint): TokenBalanceEntry => ({
    mint: NVDAX,
    owner,
    rawAmount: amount,
    decimals: 8,
  });

  it("writes nothing for a buy, because the order that placed it writes the row", () => {
    const m = movementsIn(
      tx({
        preTokens: [usdc(WALLET, 500_000_000n)],
        postTokens: [usdc(WALLET, 400_000_000n), stock(WALLET, 44_901_800n)],
      }),
      { wallet: WALLET, now: NOW, lendingProgram: KAMINO },
    );
    expect(m).toEqual([]);
  });

  it("writes nothing for a sell either", () => {
    const m = movementsIn(
      tx({
        preTokens: [stock(WALLET, 44_901_800n), usdc(WALLET, 0n)],
        postTokens: [stock(WALLET, 0n), usdc(WALLET, 99_500_000n)],
      }),
      { wallet: WALLET, now: NOW, lendingProgram: KAMINO },
    );
    expect(m).toEqual([]);
  });

  it("still reports plain cash arriving, which is the case the job exists for", () => {
    const m = movementsIn(tx({ preTokens: [], postTokens: [usdc(WALLET, 500_000_000n)] }), {
      wallet: WALLET,
      now: NOW,
      lendingProgram: KAMINO,
    });
    expect(m.length).toBe(1);
    expect(m[0]!.title).toBe("Added cash");
  });

  it("is not fooled by somebody else's token moving in the same transaction", () => {
    const m = movementsIn(
      tx({
        preTokens: [usdc(WALLET, 500_000_000n), stock(OTHER, 10n)],
        postTokens: [usdc(WALLET, 400_000_000n), stock(OTHER, 20n)],
      }),
      { wallet: WALLET, now: NOW, lendingProgram: KAMINO },
    );
    expect(m.length).toBe(1);
    expect(m[0]!.title).toBe("Sent cash");
  });
});

/**
 * A loan is not a deposit, and a repayment is not a withdrawal.
 *
 * Kamino pays a borrower into their own wallet, so from here a borrow is
 * indistinguishable from somebody sending themselves money: dollars arrive and
 * nothing else in the wallet moves. `POST /v1/borrow/confirm` writes the row
 * that says what really happened, with the collateral on it; this job must not
 * write a second one saying "Added cash".
 */
describe("movementsIn — a Kamino transaction", () => {
  it("writes nothing for dollars that arrived as a loan", () => {
    const m = movementsIn(
      tx({
        accountKeys: [WALLET, KAMINO],
        preTokens: [usdc(WALLET, 0n)],
        postTokens: [usdc(WALLET, 500_000_000n)],
      }),
      ctx,
    );
    expect(m).toEqual([]);
  });

  it("writes nothing for dollars that left as a repayment", () => {
    const m = movementsIn(
      tx({
        accountKeys: [WALLET, KAMINO],
        preTokens: [usdc(WALLET, 500_000_000n)],
        postTokens: [usdc(WALLET, 0n)],
      }),
      ctx,
    );
    expect(m).toEqual([]);
  });

  it("writes nothing for the SOL a lending transaction spends on rent", () => {
    const m = movementsIn(
      tx({
        accountKeys: [WALLET, KAMINO],
        preLamports: [1_000_000_000n, 0n],
        postLamports: [997_000_000n, 0n],
      }),
      ctx,
    );
    expect(m).toEqual([]);
  });

  it("still reports a transfer that had nothing to do with Kamino", () => {
    const m = movementsIn(
      tx({ accountKeys: [WALLET], preTokens: [], postTokens: [usdc(WALLET, 500_000_000n)] }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.title).toBe("Added cash");
  });
});
