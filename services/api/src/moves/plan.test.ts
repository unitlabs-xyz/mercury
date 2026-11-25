import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { OwnedTokenAccount } from "@mercury/chain";
import { planMove, type MovePlanInput } from "./plan.js";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const account = (
  mint: string,
  rawAmount: bigint,
  over: Partial<OwnedTokenAccount> = {},
): OwnedTokenAccount => ({
  address: `acct-${mint.slice(0, 4)}-${rawAmount}`,
  mint,
  programId: mint === USDC || mint === BONK ? TOKEN : TOKEN_2022,
  rawAmount,
  decimals: mint === USDC ? 6 : 8,
  ...over,
});

/** SOL at $200 and the node's rent: 2,039,280 lamports for a classic account, 2,136,720 for a stock's. */
const input = (over: Partial<MovePlanInput> = {}): MovePlanInput => ({
  owned: [account(NVDAX, 100n), account(USDC, 20_000_000n)],
  listed: new Set([USDC, NVDAX, TSLAX]),
  mercuryHolds: new Set(),
  rent: { classic: 2_039_280n, token2022: 2_136_720n },
  solPriceUsd: D(200),
  ...over,
});

describe("planMove", () => {
  it("moves everything Mercury lists that the wallet holds, and nothing it doesn't list", () => {
    const plan = planMove(input({ owned: [account(NVDAX, 100n), account(BONK, 5n), account(TSLAX, 0n)] }));
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.tokens.map((t) => [t.mint, t.amountRaw])).toEqual([[NVDAX, 100n]]);
  });

  it("carries each token's own account, program and decimals into the move", () => {
    const plan = planMove(input());
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.tokens).toEqual([
      { mint: NVDAX, source: "acct-Xsc9-100", programId: TOKEN_2022, decimals: 8, amountRaw: 100n },
      { mint: USDC, source: "acct-EPjF-20000000", programId: TOKEN, decimals: 6, amountRaw: 20_000_000n },
    ]);
  });

  it("works out the rent of the accounts the Mercury wallet lacks, which the linked wallet pays in SOL", () => {
    // 2,136,720 + 2,039,280 lamports: 0.004176 SOL, $0.8352 at $200 a SOL.
    const plan = planMove(input());
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.rentLamports).toBe(4_176_000n);
    expect(plan.rentUsd.toFixed()).toBe("0.8352");
  });

  it("owes no rent for an account the Mercury wallet already has, empty or not", () => {
    const plan = planMove(input({ mercuryHolds: new Set([NVDAX, USDC]) }));
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.rentLamports).toBe(0n);
    expect(plan.rentUsd.toFixed()).toBe("0");
  });

  it("still says the rent in SOL when SOL has no price", () => {
    const plan = planMove(input({ solPriceUsd: undefined }));
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.rentLamports).toBe(4_176_000n);
    expect(plan.rentUsd.toFixed()).toBe("0");
  });

  it("charges rent once for a token kept in two accounts, and moves from each, the larger first", () => {
    const plan = planMove(
      input({
        owned: [account(NVDAX, 30n, { address: "small" }), account(NVDAX, 70n, { address: "large" })],
        asked: new Map([[NVDAX, 90n]]),
      }),
    );
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.tokens.map((t) => [t.source, t.amountRaw])).toEqual([
      ["large", 70n],
      ["small", 20n],
    ]);
    expect(plan.rentLamports).toBe(2_136_720n);
  });

  it("moves only what was asked for, and nothing of a token left out", () => {
    const plan = planMove(input({ asked: new Map([[NVDAX, 40n]]) }));
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.tokens.map((t) => [t.mint, t.amountRaw])).toEqual([[NVDAX, 40n]]);
  });

  it("refuses a token the wallet doesn't hold, or more than it holds", () => {
    expect(planMove(input({ asked: new Map([[TSLAX, 1n]]) }))).toEqual({
      ok: false,
      code: "not_held",
      mint: TSLAX,
    });
    expect(planMove(input({ asked: new Map([[NVDAX, 101n]]) }))).toEqual({
      ok: false,
      code: "too_much",
      mint: NVDAX,
    });
  });

  it("says there is nothing to move when nothing listed is held, or every amount asked is zero", () => {
    expect(planMove(input({ owned: [account(BONK, 5n)] }))).toEqual({ ok: false, code: "nothing_to_move" });
    expect(planMove(input({ asked: new Map([[NVDAX, 0n]]) }))).toEqual({
      ok: false,
      code: "nothing_to_move",
    });
  });
});
