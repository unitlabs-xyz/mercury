import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { PriceBoard, TokenPrice } from "@mercury/market";
import { USDC_MINT } from "@mercury/chain";
import { quoteFee, quoteTransferFee } from "./quote.js";
import { STOCK_ACCOUNT_BYTES, TOKEN_ACCOUNT_BYTES } from "../rent.js";

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

/*
 * A reader that cannot ask for rent unless given `rent`, so these charge at the
 * rate measured on 15 October 2026: $0.19 for a new stock account and $0.18
 * for a new USDC one, at $119.39 SOL.
 */
const deps = (
  balances: TokenBalance[],
  solUsd: string | null,
  rent?: (bytes: number) => Promise<bigint>,
) => ({
  chain: {
    tokenBalances: async () => balances,
    mintConfig: async () => null,
    ...(rent === undefined ? {} : { rentExemption: rent }),
  } as ChainReader,
  prices: {
    pricesFor: async () => new Map(solUsd === null ? [] : [[SOL, price(solUsd)]]),
  } as PriceBoard,
});

const held = (mint: string, raw = 1n): TokenBalance => ({ mint, rawAmount: raw, decimals: 8 });

describe("quoteFee", () => {
  it("charges rent on a first buy, when the buyer holds none of the token", async () => {
    const fee = await quoteFee(deps([], "119.39"), { owner: OWNER, receivingMint: SPCX });
    expect(fee.usdc.toString()).toBe("0.19");
  });

  it("charges only the signature once the buyer already holds it", async () => {
    const fee = await quoteFee(deps([held(SPCX)], "119.39"), { owner: OWNER, receivingMint: SPCX });
    expect(fee.usdc.toString()).toBe("0.01");
  });

  /*
   * Rent pays for the account, not for what is in it. A holding that has been
   * sold down to nothing still has its account, so charging again would be
   * charging for something that already exists.
   */
  it("treats a zero balance as the account still existing", async () => {
    const fee = await quoteFee(deps([held(SPCX, 0n)], "119.39"), { owner: OWNER, receivingMint: SPCX });
    expect(fee.usdc.toString()).toBe("0.01");
  });

  it("does not let another token's balance excuse this one's rent", async () => {
    const other = "Xs7ZdzSHLU9GLSSPoSZuMkQ8GHjNKz1F8gUQRA2ZfZ7";
    const fee = await quoteFee(deps([held(other)], "119.39"), { owner: OWNER, receivingMint: SPCX });
    expect(fee.usdc.toString()).toBe("0.19");
  });

  /*
   * A fee we cannot price is not a fee we guess at. The buy is fine either
   * way; it is only the repayment that has no number.
   */
  it("charges nothing when SOL has no price", async () => {
    const fee = await quoteFee(deps([], null), { owner: OWNER, receivingMint: SPCX });
    expect(fee.usdc.toString()).toBe("0");
    expect(fee.lamports).toBe(0);
  });

  it("charges nothing when SOL prices at zero", async () => {
    const fee = await quoteFee(deps([], "0"), { owner: OWNER, receivingMint: SPCX });
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
      { owner: OWNER, receivingMint: SPCX },
    );
    // Sequential would finish balances first; concurrent lets the faster one land first.
    expect(order).toEqual(["prices", "balances"]);
  });
});

/**
 * Which account the rent is for, which is not the same question on both sides.
 * A seller always holds the stock account already; it is the dollars that
 * might have nowhere to land.
 */
describe("quoteFee, selling", () => {
  it("charges rent when the seller has no USDC account yet", async () => {
    const fee = await quoteFee(deps([held(SPCX)], "119.39"), { owner: OWNER, receivingMint: USDC_MINT });
    expect(fee.usdc.toString()).toBe("0.18");
  });

  it("charges only the signature once the USDC account is open", async () => {
    const balances = [held(SPCX), held(USDC_MINT)];
    const fee = await quoteFee(deps(balances, "119.39"), { owner: OWNER, receivingMint: USDC_MINT });
    expect(fee.usdc.toString()).toBe("0.01");
  });

  /* The trap this replaces: asking about the stock says "already held, no rent"
     on every sell, including the one where the dollars have nowhere to go. */
  it("does not let the stock account excuse the USDC account's rent", async () => {
    const fee = await quoteFee(deps([held(SPCX, 500n)], "119.39"), {
      owner: OWNER,
      receivingMint: USDC_MINT,
    });
    expect(fee.usdc.toString()).toBe("0.18");
  });
});

const RECIPIENT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("quoteTransferFee", () => {
  /*
   * The question is about the recipient, not the sender. The sender holds the
   * USDC they are sending, so their account exists by definition; it is the
   * recipient's that may have to be opened. Reading the sender's balances —
   * which is what `quoteFee` would do — answers zero every single time.
   */
  it("charges rent when the recipient has never held USDC", async () => {
    const fee = await quoteTransferFee(deps([], "119.39"), { destination: RECIPIENT });
    expect(fee.usdc.toString()).toBe("0.18");
  });

  it("charges nothing when the recipient already holds USDC", async () => {
    const fee = await quoteTransferFee(deps([held(USDC_MINT)], "119.39"), { destination: RECIPIENT });
    expect(fee.usdc.toString()).toBe("0");
  });

  it("treats a recipient's emptied USDC account as still existing", async () => {
    const fee = await quoteTransferFee(deps([held(USDC_MINT, 0n)], "119.39"), { destination: RECIPIENT });
    expect(fee.usdc.toString()).toBe("0");
  });

  it("does not let some other token the recipient holds excuse the USDC rent", async () => {
    const fee = await quoteTransferFee(deps([held(SPCX)], "119.39"), { destination: RECIPIENT });
    expect(fee.usdc.toString()).toBe("0.18");
  });

  it("charges nothing when SOL has no price, rather than guessing one", async () => {
    const fee = await quoteTransferFee(deps([], null), { destination: RECIPIENT });
    expect(fee.usdc.toString()).toBe("0");
  });
});

/**
 * The rent is the node's figure for the account being opened, and which
 * account that is decides the size asked about: the stock's on a buy, USDC's on
 * a sell or a transfer.
 */
describe("the rent each quote charges", () => {
  const node = () => {
    const asked: number[] = [];
    const rent = async (bytes: number) => {
      asked.push(bytes);
      // The rate mainnet charged before October 2026, so it shows apart from the fallback.
      return BigInt(128 + bytes) * 6_960n;
    };
    return { asked, rent };
  };

  it("asks for a stock account's rent on a first buy, and charges it", async () => {
    const { asked, rent } = node();
    const fee = await quoteFee(deps([], "119.39", rent), { owner: OWNER, receivingMint: SPCX });
    expect(asked).toEqual([STOCK_ACCOUNT_BYTES]);
    expect(fee.lamports).toBe((128 + STOCK_ACCOUNT_BYTES) * 6_960 + 5_000);
  });

  it("asks for a USDC account's rent on a first sell", async () => {
    const { asked, rent } = node();
    const fee = await quoteFee(deps([held(SPCX)], "119.39", rent), {
      owner: OWNER,
      receivingMint: USDC_MINT,
    });
    expect(asked).toEqual([TOKEN_ACCOUNT_BYTES]);
    expect(fee.lamports).toBe((128 + TOKEN_ACCOUNT_BYTES) * 6_960 + 5_000);
  });

  it("asks for a USDC account's rent on a transfer to someone without one", async () => {
    const { asked, rent } = node();
    const fee = await quoteTransferFee(deps([], "119.39", rent), { destination: RECIPIENT });
    expect(asked).toEqual([TOKEN_ACCOUNT_BYTES]);
    expect(fee.lamports).toBe((128 + TOKEN_ACCOUNT_BYTES) * 6_960);
  });

  it("charges no rent once the account is open", async () => {
    const { rent } = node();
    const fee = await quoteFee(deps([held(SPCX)], "119.39", rent), { owner: OWNER, receivingMint: SPCX });
    expect(fee.lamports).toBe(5_000);
  });
});
