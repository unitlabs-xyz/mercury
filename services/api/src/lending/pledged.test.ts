import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { LendingSource } from "./ports.js";
import { withPledged } from "./pledged.js";

const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const chain: ChainReader = {
  tokenBalances: async () => [
    { mint: SPYX, rawAmount: 300_000_000n, decimals: 8 },
    { mint: USDC, rawAmount: 5_000_000n, decimals: 6 },
  ],
  mintConfig: async () => null,
};

const lending = (position: Awaited<ReturnType<LendingSource["position"]>> | Error): LendingSource => ({
  terms: async () => {
    throw new Error("unused");
  },
  position: async () => {
    if (position instanceof Error) throw position;
    return position;
  },
  build: async () => {
    throw new Error("unused");
  },
});

const position = {
  obligation: "Obligation",
  deposits: [
    {
      ticker: "SPY",
      isStock: true,
      mint: SPYX,
      raw: 700_000_000n,
      decimals: 8,
      tokens: D(7),
      valueUsd: D(5_600),
    },
    {
      ticker: "USDC",
      isStock: false,
      mint: USDC,
      raw: 9_000_000n,
      decimals: 6,
      tokens: D(9),
      valueUsd: D(9),
    },
  ],
  debtUsd: ZERO,
  owedUsdc: ZERO,
  debtBfAdjustedUsd: ZERO,
  allowedBorrowUsd: ZERO,
  liquidationBorrowUsd: ZERO,
};

describe("withPledged", () => {
  it("counts pledged stock as still held, so pledging never reads as selling", async () => {
    const balances = await withPledged(chain, lending(position)).tokenBalances("WaLLeT");
    expect(balances.find((b) => b.mint === SPYX)!.rawAmount).toBe(1_000_000_000n);
  });

  it("does not add pledged cash to the wallet's balance", async () => {
    const balances = await withPledged(chain, lending(position)).tokenBalances("WaLLeT");
    expect(balances.find((b) => b.mint === USDC)!.rawAmount).toBe(5_000_000n);
  });

  it("is the wallet alone for someone with no Kamino position", async () => {
    const balances = await withPledged(chain, lending(null)).tokenBalances("WaLLeT");
    expect(balances.find((b) => b.mint === SPYX)!.rawAmount).toBe(300_000_000n);
  });

  it("fails rather than reporting the wallet alone when Kamino cannot be read", async () => {
    await expect(withPledged(chain, lending(new Error("down"))).tokenBalances("WaLLeT")).rejects.toThrow(
      "down",
    );
  });
});
