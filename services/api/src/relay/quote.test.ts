import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { PriceBoard, TokenPrice } from "@mercury/market";
import { quoteFee } from "./quote.js";

const SOL = "So11111111111111111111111111111111111111112";
const SPCX = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const OWNER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";

const price = (usd: string): TokenPrice => ({
  mint: SOL,
  usdPricePerToken: D(usd),
  pricePerShare: null,
  changePct24h: null,
  liquidityUsd: D(0),
  multiplier: D(1),
  observedAt: new Date(),
});

const deps = (balances: TokenBalance[], solUsd: string | null) => ({
  chain: { tokenBalances: async () => balances, mintConfig: async () => null } as ChainReader,
  prices: {
    pricesFor: async () => new Map(solUsd === null ? [] : [[SOL, price(solUsd)]]),
  } as PriceBoard,
});

const held = (mint: string, raw = 1n): TokenBalance => ({ mint, rawAmount: raw, decimals: 8 });

describe("quoteFee", () => {
  it("charges rent on a first buy, when the buyer holds none of the token", async () => {
    const fee = await quoteFee(deps([], "119.39"), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0.25");
  });

  it("charges only the signature once the buyer already holds it", async () => {
    const fee = await quoteFee(deps([held(SPCX)], "119.39"), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0.01");
  });

  /*
   * Rent pays for the account, not for what is in it. A holding that has been
   * sold down to nothing still has its account, so charging again would be
   * charging for something that already exists.
   */
  it("treats a zero balance as the account still existing", async () => {
    const fee = await quoteFee(deps([held(SPCX, 0n)], "119.39"), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0.01");
  });

  it("does not let another token's balance excuse this one's rent", async () => {
    const other = "Xs7ZdzSHLU9GLSSPoSZuMkQ8GHjNKz1F8gUQRA2ZfZ7";
    const fee = await quoteFee(deps([held(other)], "119.39"), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0.25");
  });

  /*
   * A fee we cannot price is not a fee we guess at. The buy is fine either
   * way; it is only the repayment that has no number.
   */
  it("charges nothing when SOL has no price", async () => {
    const fee = await quoteFee(deps([], null), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0");
    expect(fee.lamports).toBe(0);
  });

  it("charges nothing when SOL prices at zero", async () => {
    const fee = await quoteFee(deps([], "0"), { owner: OWNER, mint: SPCX });
    expect(fee.usdc.toString()).toBe("0");
  });

  /* Two round trips, and a buyer waiting on both. */
  it("reads the balance and the price at the same time", async () => {
    const order: string[] = [];
    const slow = <T>(tag: string, value: T, ms: number) =>
      new Promise<T>((r) =>
        setTimeout(() => {
          order.push(tag);
          r(value);
        }, ms),
      );
    await quoteFee(
      {
        chain: { tokenBalances: () => slow("balances", [], 20), mintConfig: async () => null } as ChainReader,
        prices: { pricesFor: () => slow("prices", new Map([[SOL, price("100")]]), 5) } as PriceBoard,
      },
      { owner: OWNER, mint: SPCX },
    );
    // Sequential would finish balances first; concurrent lets the faster one land first.
    expect(order).toEqual(["prices", "balances"]);
  });
});
