import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { SIGNATURE_LAMPORTS, investable, networkFee, tradingFee, transferFee } from "./fee.js";

const SOL = D("119.39");

/* What a new stock account and a new USDC account held on mainnet, 15 October 2026. */
const STOCK_RENT = 1_559_560;
const USDC_RENT = 1_488_440;

describe("networkFee", () => {
  /*
   * Rent was what blocked a real first buy on 30 September 2026: 2,039,280
   * lamports of it, at the rate then, against 5,000 of fee. Gas was never the
   * problem.
   */
  it("charges rent and the signature when an account has to be opened", () => {
    const fee = networkFee({ rentLamports: STOCK_RENT, solPriceUsd: SOL });
    expect(fee.lamports).toBe(STOCK_RENT + SIGNATURE_LAMPORTS);
    // 0.00156456 SOL at $119.39 is $0.1868, which rounds up to a cent.
    expect(fee.usdc.toString()).toBe("0.19");
  });

  it("charges only the signature when nothing has to be opened", () => {
    const fee = networkFee({ rentLamports: 0, solPriceUsd: SOL });
    expect(fee.lamports).toBe(SIGNATURE_LAMPORTS);
    expect(fee.usdc.toString()).toBe("0.01");
  });

  /* Rent dominates by two orders of magnitude; the point of the distinction. */
  it("makes a first buy far dearer than a second", () => {
    const first = networkFee({ rentLamports: STOCK_RENT, solPriceUsd: SOL });
    const again = networkFee({ rentLamports: 0, solPriceUsd: SOL });
    expect(first.lamports / again.lamports).toBeGreaterThan(300);
  });

  /*
   * Always up, never down. A fee quoted a hair short is an order that dies at
   * the relayer for the price of a rounding error.
   */
  it("rounds up to the cent rather than to the nearest", () => {
    // Priced so the exact figure lands just over a cent boundary.
    const fee = networkFee({ rentLamports: 0, solPriceUsd: D("2000") });
    // 5,000 lamports at $2,000 is $0.01 exactly.
    expect(fee.usdc.toString()).toBe("0.01");
    const dearer = networkFee({ rentLamports: 0, solPriceUsd: D("2000.01") });
    expect(dearer.usdc.toString()).toBe("0.02");
  });

  it("follows the SOL price", () => {
    const cheap = networkFee({ rentLamports: STOCK_RENT, solPriceUsd: D("50") });
    const dear = networkFee({ rentLamports: STOCK_RENT, solPriceUsd: D("500") });
    expect(Number(dear.usdc.toString())).toBeGreaterThan(Number(cheap.usdc.toString()));
  });

  /* The rate is the node's to say. Whatever rent it reports is what is charged. */
  it("follows the rent it is given", () => {
    const fee = networkFee({ rentLamports: 2_039_280, solPriceUsd: SOL });
    expect(fee.lamports).toBe(2_039_280 + SIGNATURE_LAMPORTS);
    expect(fee.usdc.toString()).toBe("0.25");
  });
});

describe("investable", () => {
  /*
   * The whole reason the fee is deducted rather than added: a buyer holding
   * exactly $5 can never pay $5.19, so adding on top would make their whole
   * balance unspendable and "Max" impossible.
   */
  it("takes the fee out of the amount, so the amount is what leaves the wallet", () => {
    const fee = networkFee({ rentLamports: STOCK_RENT, solPriceUsd: SOL });
    expect(investable(D("5"), fee).toString()).toBe("4.81");
  });

  it("leaves the amount alone when nothing is owed", () => {
    expect(investable(D("5"), { usdc: D(0), lamports: 0 }).toString()).toBe("5");
  });
});

describe("transferFee", () => {
  /*
   * A transfer absorbs the signature and charges only rent. The signature is a
   * tenth of a cent — less than the rounding on any charge we could make for
   * it — and a sender being told "Mercury covers the network fee" is worth
   * more than recovering it.
   */
  it("charges nothing when the recipient already holds USDC", () => {
    expect(transferFee({ rentLamports: 0, solPriceUsd: D("119.39") }).usdc.toString()).toBe("0");
  });

  it("charges the rent when the recipient's account has to be opened", () => {
    const fee = transferFee({ rentLamports: USDC_RENT, solPriceUsd: D("119.39") });
    expect(fee.usdc.toString()).toBe("0.18");
    expect(fee.lamports).toBe(USDC_RENT);
  });

  it("leaves the signature out of what it charges, unlike a trade", () => {
    const sol = D("119.39");
    const trade = networkFee({ rentLamports: USDC_RENT, solPriceUsd: sol });
    const transfer = transferFee({ rentLamports: USDC_RENT, solPriceUsd: sol });
    expect(trade.lamports - transfer.lamports).toBe(SIGNATURE_LAMPORTS);
  });

  it("rounds the rent up to the cent, like every other charge", () => {
    // Rent at this SOL price is $0.1488…, and a charge quoted a hair short is
    // a transfer that fails at the relayer for the price of a rounding error.
    expect(transferFee({ rentLamports: USDC_RENT, solPriceUsd: D("100") }).usdc.toString()).toBe("0.15");
  });
});

describe("tradingFee", () => {
  /* The deck's own example: $500 of Nvidia at 0.5% is $2.50. */
  it("is the rate's share of what the trade is worth", () => {
    expect(tradingFee(D(500), 50).toString()).toBe("2.5");
  });

  /*
   * Down, never up. The rate is what the ticket promises, so a fraction of a
   * cent is ours to give away: $333 at 0.5% is $1.665, and $1.67 would be more
   * than half a percent.
   */
  it("rounds down to the cent, so it never comes to more than the rate", () => {
    expect(tradingFee(D(333), 50).toString()).toBe("1.66");
  });

  it("is nothing on a trade too small for a whole cent of it", () => {
    expect(tradingFee(D("1.99"), 50).toString()).toBe("0");
  });

  it("is nothing when the rate is zero", () => {
    expect(tradingFee(D(500), 0).toString()).toBe("0");
  });
});
