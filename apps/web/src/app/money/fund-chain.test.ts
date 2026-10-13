import { describe, expect, it } from "vitest";
import {
  anyInFlight,
  leadOptions,
  matchOptions,
  optionsOf,
  statusCopy,
  timingCopy,
  type FundSource,
} from "./fund-chain";

const currency = (symbol: string, name = symbol, address = symbol.toLowerCase()) => ({
  id: symbol.toLowerCase(),
  symbol,
  name,
  address,
  decimals: 6,
});

const SOURCES: readonly FundSource[] = [
  {
    chainId: 792703809,
    name: "solana",
    vmType: "svm",
    currencies: [currency("SOL", "Solana"), currency("USDT")],
  },
  {
    chainId: 8453,
    name: "base",
    vmType: "evm",
    currencies: [currency("ETH", "Ether"), currency("USDC", "USD Coin")],
  },
  { chainId: 728126428, name: "tron", vmType: "tvm", currencies: [currency("USDT")] },
  { chainId: 8253038, name: "bitcoin", vmType: "bvm", currencies: [currency("BTC", "Bitcoin")] },
];

describe("optionsOf", () => {
  it("makes one row per token per chain", () => {
    expect(optionsOf(SOURCES)).toHaveLength(6);
  });

  it("carries the chain's name and vm type onto every row", () => {
    const tron = optionsOf(SOURCES).find((o) => o.chainName === "tron");
    expect(tron).toMatchObject({ vmType: "tvm", chainId: 728126428 });
  });
});

describe("matchOptions", () => {
  const options = optionsOf(SOURCES);

  it("returns everything for an empty query", () => {
    expect(matchOptions(options, "")).toHaveLength(6);
    expect(matchOptions(options, "   ")).toHaveLength(6);
  });

  it("finds a token by its symbol", () => {
    expect(matchOptions(options, "btc").map((o) => o.chainName)).toEqual(["bitcoin"]);
  });

  it("finds a chain by its name", () => {
    /* Somebody looking for USDT on Tron types either word. A search that only
       matched the token would make the chain unfindable. */
    expect(matchOptions(options, "tron")).toHaveLength(1);
  });

  it("finds a token by its full name", () => {
    expect(matchOptions(options, "usd coin").map((o) => o.currency.symbol)).toEqual(["USDC"]);
  });

  it("ignores case and surrounding space", () => {
    expect(matchOptions(options, "  TRON ")).toHaveLength(1);
  });

  it("returns the same token on every chain that has it", () => {
    expect(
      matchOptions(options, "usdt")
        .map((o) => o.chainName)
        .sort(),
    ).toEqual(["solana", "tron"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(matchOptions(options, "dogecoin")).toEqual([]);
  });
});

describe("leadOptions", () => {
  it("leads with the handful somebody is most likely to hold", () => {
    const leads = leadOptions(optionsOf(SOURCES));
    expect(leads[0]).toMatchObject({ chainName: "solana", currency: { symbol: "USDT" } });
    expect(leads.map((o) => `${o.chainName}:${o.currency.symbol}`)).toContain("bitcoin:BTC");
  });

  it("leaves out a lead that is not on offer", () => {
    /* The list is a preference, not an assertion about what Relay supports. */
    const withoutBitcoin = SOURCES.filter((s) => s.vmType !== "bvm");
    expect(leadOptions(optionsOf(withoutBitcoin)).map((o) => o.currency.symbol)).not.toContain("BTC");
  });

  it("never invents a row", () => {
    const all = optionsOf(SOURCES);
    for (const lead of leadOptions(all)) expect(all).toContain(lead);
  });
});

describe("anyInFlight", () => {
  it.each(["waiting", "depositing", "pending", "submitted"])("is true while %s", (status) => {
    expect(anyInFlight([status])).toBe(true);
  });

  it.each(["success", "failure", "refund"])("is false once %s", (status) => {
    expect(anyInFlight([status])).toBe(false);
  });

  it("is true when any one of several is still moving", () => {
    expect(anyInFlight(["success", "refund", "pending"])).toBe(true);
  });

  it("is false with nothing to watch", () => {
    expect(anyInFlight([])).toBe(false);
  });
});

describe("statusCopy", () => {
  it("does not make waiting sound like a problem", () => {
    const { label, done } = statusCopy("waiting");
    expect(label).toBe("Waiting for your transfer");
    expect(done).toBe(false);
  });

  it("marks only the terminal states as done", () => {
    expect(statusCopy("success").done).toBe(true);
    expect(statusCopy("refund").done).toBe(true);
    expect(statusCopy("submitted").done).toBe(false);
  });

  it("says something sane about a status Relay has not told us about", () => {
    expect(statusCopy("quantum").label).toBe("In progress");
  });
});

describe("timingCopy", () => {
  it("tells the truth about Bitcoin", () => {
    /* "About a minute" would have somebody refreshing for forty of them,
       convinced their money was gone. */
    expect(timingCopy("bvm")).toMatch(/10 to 60 minutes/);
  });

  it("is about a minute everywhere else", () => {
    for (const vm of ["evm", "svm", "tvm", "tonvm"]) expect(timingCopy(vm)).toMatch(/about a minute/);
  });
});
