import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { SIGNATURE_LAMPORTS, TOKEN_ACCOUNT_RENT_LAMPORTS, investable, networkFee } from "./fee.js";

const SOL = D("119.39");

describe("networkFee", () => {
  /*
   * The number that actually blocked a real first buy on 30 September 2026:
   * 2,039,280 lamports of rent against 5,000 of fee. Gas was never the problem.
   */
  it("charges rent and the signature when the account has to be opened", () => {
    const fee = networkFee({ needsTokenAccount: true, solPriceUsd: SOL });
    expect(fee.lamports).toBe(TOKEN_ACCOUNT_RENT_LAMPORTS + SIGNATURE_LAMPORTS);
    // 0.00204428 SOL at $119.39 is $0.2441, which rounds up to a cent.
    expect(fee.usdc.toString()).toBe("0.25");
  });

  it("charges only the signature when the buyer already holds the stock", () => {
    const fee = networkFee({ needsTokenAccount: false, solPriceUsd: SOL });
    expect(fee.lamports).toBe(SIGNATURE_LAMPORTS);
    expect(fee.usdc.toString()).toBe("0.01");
  });

  /* Rent dominates by two orders of magnitude; the point of the distinction. */
  it("makes a first buy far dearer than a second", () => {
    const first = networkFee({ needsTokenAccount: true, solPriceUsd: SOL });
    const again = networkFee({ needsTokenAccount: false, solPriceUsd: SOL });
    expect(first.lamports / again.lamports).toBeGreaterThan(400);
  });

  /*
   * Always up, never down. A fee quoted a hair short is an order that dies at
   * the relayer for the price of a rounding error.
   */
  it("rounds up to the cent rather than to the nearest", () => {
    // Priced so the exact figure lands just over a cent boundary.
    const fee = networkFee({ needsTokenAccount: false, solPriceUsd: D("2000") });
    // 5,000 lamports at $2,000 is $0.01 exactly.
    expect(fee.usdc.toString()).toBe("0.01");
    const dearer = networkFee({ needsTokenAccount: false, solPriceUsd: D("2000.01") });
    expect(dearer.usdc.toString()).toBe("0.02");
  });

  it("follows the SOL price", () => {
    const cheap = networkFee({ needsTokenAccount: true, solPriceUsd: D("50") });
    const dear = networkFee({ needsTokenAccount: true, solPriceUsd: D("500") });
    expect(Number(dear.usdc.toString())).toBeGreaterThan(Number(cheap.usdc.toString()));
  });
});

describe("investable", () => {
  /*
   * The whole reason the fee is deducted rather than added: a buyer holding
   * exactly $5 can never pay $5.25, so adding on top would make their whole
   * balance unspendable and "Max" impossible.
   */
  it("takes the fee out of the amount, so the amount is what leaves the wallet", () => {
    const fee = networkFee({ needsTokenAccount: true, solPriceUsd: SOL });
    expect(investable(D("5"), fee).toString()).toBe("4.75");
  });

  it("leaves the amount alone when nothing is owed", () => {
    expect(investable(D("5"), { usdc: D(0), lamports: 0 }).toString()).toBe("5");
  });
});
