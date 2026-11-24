import { describe, expect, it } from "vitest";
import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import {
  KAMINO_LENDING_PROGRAM,
  KAMINO_VAULT_PROGRAM,
  SOL_MINT,
  balanceOf,
  emptyBefore,
  movementOf,
  rawJson,
} from "./events.js";

const ME = "Phantom1111111111111111111111111111111111111";
const FRIEND = "Friend11111111111111111111111111111111111111";
const POOL = "Pool111111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const entry = (owner: string, mint: string, raw: bigint): TokenBalanceEntry => ({
  owner,
  mint,
  rawAmount: raw,
  decimals: mint === USDC ? 6 : 8,
});

const tx = (over: Partial<TransactionDetail>): TransactionDetail => ({
  signature: "Sig",
  blockTime: 1_760_000_000,
  succeeded: true,
  accountKeys: [ME],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n],
  postLamports: [999_995_000n],
  preTokens: [],
  postTokens: [],
  ...over,
});

describe("balanceOf", () => {
  it("sums the owner's accounts of one mint, and nobody else's", () => {
    const entries = [
      entry(ME, TSLAX, 2n),
      entry(ME, TSLAX, 3n),
      entry(FRIEND, TSLAX, 7n),
      entry(ME, USDC, 9n),
    ];
    expect(balanceOf(entries, ME, TSLAX)).toBe(5n);
    expect(balanceOf(entries, ME, "Other")).toBe(0n);
  });
});

describe("movementOf, at Kamino", () => {
  const RESERVE = "Reserve11111111111111111111111111111111111";

  it("reads stock pledged as collateral as a pledge, not a departure", () => {
    const m = movementOf(
      tx({
        accountKeys: [ME, KAMINO_LENDING_PROGRAM],
        preTokens: [entry(ME, TSLAX, 1_000_000_000n), entry(RESERVE, TSLAX, 0n)],
        postTokens: [entry(ME, TSLAX, 200_000_000n), entry(RESERVE, TSLAX, 800_000_000n)],
      }),
      ME,
      TSLAX,
    );
    expect(m).toEqual({
      kind: "loan_deposit",
      amountRaw: 800_000_000n,
      counterMint: null,
      counterAmountRaw: null,
      sourceOwner: null,
      destinationOwner: null,
    });
  });

  it("reads a pledge and a borrow in one transaction as a pledge, though USDC arrived", () => {
    const m = movementOf(
      tx({
        accountKeys: [ME, KAMINO_LENDING_PROGRAM],
        preTokens: [entry(ME, TSLAX, 1_000_000_000n), entry(ME, USDC, 0n)],
        postTokens: [entry(ME, TSLAX, 0n), entry(ME, USDC, 500_000_000n)],
      }),
      ME,
      TSLAX,
    );
    expect(m?.kind).toBe("loan_deposit");
  });

  it("reads collateral taken back as a withdrawal, not an arrival with no cost", () => {
    const m = movementOf(
      tx({
        accountKeys: [ME, KAMINO_LENDING_PROGRAM],
        preTokens: [entry(ME, TSLAX, 0n)],
        postTokens: [entry(ME, TSLAX, 800_000_000n)],
      }),
      ME,
      TSLAX,
    );
    expect(m).toMatchObject({ kind: "loan_withdraw", amountRaw: 800_000_000n, sourceOwner: null });
  });

  it("reads an Earn deposit as the trade it is: a vault calls the lending program too", () => {
    const SHARES = "EarnShares111111111111111111111111111111111";
    const m = movementOf(
      tx({
        accountKeys: [ME, KAMINO_VAULT_PROGRAM, KAMINO_LENDING_PROGRAM],
        preTokens: [entry(ME, USDC, 500_000_000n)],
        postTokens: [entry(ME, USDC, 0n), entry(ME, SHARES, 480_000_000n)],
      }),
      ME,
      SHARES,
    );
    expect(m).toMatchObject({ kind: "in", counterMint: USDC, counterAmountRaw: 500_000_000n });
  });
});

describe("movementOf", () => {
  it("reads a swap for USDC as an arrival, with the USDC that left as its counter", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(ME, USDC, 500_000_000n), entry(POOL, TSLAX, 9_000_000_000n)],
        postTokens: [
          entry(ME, USDC, 100_000_000n),
          entry(ME, TSLAX, 100_000_000n),
          entry(POOL, TSLAX, 8_900_000_000n),
        ],
      }),
      ME,
      TSLAX,
    );
    expect(m).toEqual({
      kind: "in",
      amountRaw: 100_000_000n,
      counterMint: USDC,
      counterAmountRaw: 400_000_000n,
      sourceOwner: null,
      destinationOwner: null,
    });
  });

  it("reads a swap paid in SOL by what left beyond the network fee", () => {
    const m = movementOf(
      tx({
        preLamports: [3_000_000_000n],
        postLamports: [1_999_995_000n],
        postTokens: [entry(ME, TSLAX, 50_000_000n)],
      }),
      ME,
      TSLAX,
    );
    expect(m).toMatchObject({ kind: "in", counterMint: SOL_MINT, counterAmountRaw: 1_000_000_000n });
  });

  it("does not take the fee alone for a payment, nor a relayer's SOL for the wallet's", () => {
    // The wallet paid only the fee: a plain transfer in, not a swap.
    expect(movementOf(tx({ postTokens: [entry(ME, TSLAX, 1n)] }), ME, TSLAX)?.counterMint).toBeNull();
    // A relayer paid the fee and the wallet's SOL did not move.
    const relayed = tx({
      accountKeys: ["Relayer1111111111111111111111111111111111111", ME],
      preLamports: [5_000_000n, 1_000n],
      postLamports: [4_995_000n, 1_000n],
      postTokens: [entry(ME, TSLAX, 1n)],
    });
    expect(movementOf(relayed, ME, TSLAX)?.counterMint).toBeNull();
  });

  it("names who sent a plain transfer in, from the parsed transfer", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(FRIEND, TSLAX, 10n)],
        postTokens: [entry(FRIEND, TSLAX, 4n), entry(ME, TSLAX, 6n)],
        tokenTransfersIn: [
          {
            programId: "Tokenz",
            source: "a",
            destination: "b",
            authority: FRIEND,
            sourceOwner: FRIEND,
            destinationOwner: ME,
            mint: TSLAX,
            rawAmount: 6n,
            decimals: 8,
          },
        ],
      }),
      ME,
      TSLAX,
    );
    expect(m).toEqual({
      kind: "in",
      amountRaw: 6n,
      counterMint: null,
      counterAmountRaw: null,
      sourceOwner: FRIEND,
      destinationOwner: null,
    });
  });

  it("falls back to whose balance fell when the transfers were not parsed", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(FRIEND, TSLAX, 10n)],
        postTokens: [entry(FRIEND, TSLAX, 4n), entry(ME, TSLAX, 6n)],
      }),
      ME,
      TSLAX,
    );
    expect(m?.sourceOwner).toBe(FRIEND);
  });

  it("picks the largest of several tokens that left as the counter", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(ME, USDC, 900n), entry(ME, "Bonk", 5_000n)],
        postTokens: [entry(ME, USDC, 100n), entry(ME, "Bonk", 4_990n), entry(ME, TSLAX, 1n)],
      }),
      ME,
      TSLAX,
    );
    expect(m).toMatchObject({ counterMint: USDC, counterAmountRaw: 800n });
  });

  it("reads a departure with no counter", () => {
    const m = movementOf(
      tx({ preTokens: [entry(ME, TSLAX, 9n)], postTokens: [entry(ME, TSLAX, 2n), entry(ME, USDC, 70n)] }),
      ME,
      TSLAX,
    );
    expect(m).toEqual({
      kind: "out",
      amountRaw: 7n,
      counterMint: null,
      counterAmountRaw: null,
      sourceOwner: null,
      // Dollars came back for it: a sale to a pool, not a send to anyone.
      destinationOwner: null,
    });
  });

  it("names who received a plain transfer out, from the parsed transfer", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(ME, TSLAX, 10n)],
        postTokens: [entry(ME, TSLAX, 4n), entry(FRIEND, TSLAX, 6n)],
        tokenTransfersIn: [
          {
            programId: "Tokenz",
            source: "a",
            destination: "b",
            authority: ME,
            sourceOwner: ME,
            destinationOwner: FRIEND,
            mint: TSLAX,
            rawAmount: 6n,
            decimals: 8,
          },
        ],
      }),
      ME,
      TSLAX,
    );
    expect(m).toEqual({
      kind: "out",
      amountRaw: 6n,
      counterMint: null,
      counterAmountRaw: null,
      sourceOwner: null,
      destinationOwner: FRIEND,
    });
  });

  it("falls back to whose balance rose when the transfers were not parsed", () => {
    const m = movementOf(
      tx({
        preTokens: [entry(ME, TSLAX, 10n)],
        postTokens: [entry(ME, TSLAX, 4n), entry(FRIEND, TSLAX, 6n)],
      }),
      ME,
      TSLAX,
    );
    expect(m?.destinationOwner).toBe(FRIEND);
  });

  it("names nobody when nobody's balance rose: tokens burned, or sent somewhere the node didn't say", () => {
    const m = movementOf(
      tx({ preTokens: [entry(ME, TSLAX, 10n)], postTokens: [entry(ME, TSLAX, 4n)] }),
      ME,
      TSLAX,
    );
    expect(m?.destinationOwner).toBeNull();
  });

  it("is nothing for a transaction that did not touch the token, or failed", () => {
    expect(movementOf(tx({ postTokens: [entry(ME, USDC, 5n)] }), ME, TSLAX)).toBeNull();
    expect(movementOf(tx({ succeeded: false, postTokens: [entry(ME, TSLAX, 5n)] }), ME, TSLAX)).toBeNull();
  });
});

describe("emptyBefore", () => {
  it("is where the walk back stops: the wallet held none of it just before", () => {
    expect(emptyBefore(tx({ postTokens: [entry(ME, TSLAX, 5n)] }), ME, TSLAX)).toBe(true);
    expect(emptyBefore(tx({ preTokens: [entry(ME, TSLAX, 0n)] }), ME, TSLAX)).toBe(true);
    expect(emptyBefore(tx({ preTokens: [entry(ME, TSLAX, 1n)] }), ME, TSLAX)).toBe(false);
  });
});

describe("rawJson", () => {
  it("keeps the transaction whole, with its big numbers as strings", () => {
    const raw = rawJson(tx({ postTokens: [entry(ME, TSLAX, 12345678901234567890n)] })) as {
      feeLamports: string;
      postTokens: { rawAmount: string }[];
    };
    expect(raw.feeLamports).toBe("5000");
    expect(raw.postTokens[0]!.rawAmount).toBe("12345678901234567890");
  });
});
