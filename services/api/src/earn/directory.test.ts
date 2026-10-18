import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { earnDirectory } from "./directory.js";
import { EARN_VAULTS, HIDDEN_VAULTS } from "./catalog.js";
import type { KaminoApi, ListedVault, VaultMetrics } from "./kamino-api.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STEADY = EARN_VAULTS[0]!.address;
const HIDDEN = [...HIDDEN_VAULTS][0]!;

const vault = (address: string, over: Partial<ListedVault> = {}): ListedVault => ({
  address,
  name: `Vault ${address.slice(0, 4)}`,
  tokenMint: USDC,
  sharesMint: `shares-${address}`,
  sharesDecimals: 6,
  tokenDecimals: 6,
  performanceFeeBps: 500,
  managementFeeBps: 0,
  minDeposit: 100_000n,
  depositCap: 0n,
  createdAt: null,
  ...over,
});

const metrics = (tvl: number, holders: number): VaultMetrics => ({
  apy: D("0.05"),
  apy7d: D("0.05"),
  apy30d: D("0.05"),
  apy365d: D("0.05"),
  tvlUsd: D(tvl),
  holders,
  tokensPerShare: D("1.1"),
});

const api = (rows: ListedVault[], m: Record<string, VaultMetrics | null>): KaminoApi => ({
  vaults: async () => rows,
  metrics: async (a) => m[a] ?? null,
  history: async () => [],
  marketNames: async () => new Map(),
});

const dir = (rows: ListedVault[], m: Record<string, VaultMetrics | null>) =>
  earnDirectory({
    api: api(rows, m),
    usdcMint: USDC,
    rpcUrl: "http://localhost:1",
    make: () => ({}) as never,
  });

describe("earnDirectory.list", () => {
  it("puts Mercury's picks first, then the rest by size", async () => {
    const list = await dir([vault("Small"), vault(STEADY), vault("Big")], {
      Small: metrics(200_000, 50),
      [STEADY]: metrics(1_000_000, 3000),
      Big: metrics(5_000_000, 40),
    }).list();
    expect(list.map((l) => l.address)).toEqual([STEADY, "Big", "Small"]);
    expect(list[0]!.picked?.curator).toBe("Steakhouse Financial");
    expect(list[1]!.picked).toBeNull();
  });

  it("leaves out small, thinly held, hidden, non-USDC and unreadable vaults", async () => {
    const list = await dir(
      [vault("Tiny"), vault("Lonely"), vault(HIDDEN), vault("Sol", { tokenMint: "So11" }), vault("Blank")],
      {
        Tiny: metrics(20_000, 100),
        Lonely: metrics(5_000_000, 3),
        [HIDDEN]: metrics(5_000_000, 400),
        Sol: metrics(5_000_000, 400),
        Blank: null,
      },
    ).list();
    expect(list).toEqual([]);
  });

  it("marks a vault at its deposit cap as full", async () => {
    const [l] = await dir([vault("Capped", { depositCap: 1_000_000_000_000n })], {
      Capped: metrics(1_000_000, 100),
    }).list();
    expect(l!.full).toBe(true);
  });
});

describe("curators of vaults Mercury did not pick", () => {
  it("are read off the vault's name, and a name that says nothing has none", async () => {
    const list = await dir(
      [
        vault("G", { name: "Gauntlet Frontier" }),
        vault("P", { name: "Plume x Re7 USDC" }),
        vault("U", { name: "USDC Prime" }),
      ],
      { G: metrics(3_000_000, 100), P: metrics(2_000_000, 100), U: metrics(1_000_000, 100) },
    ).list();
    expect(list.map((l) => [l.name, l.curator, l.logo])).toEqual([
      ["Gauntlet Frontier", "Gauntlet", "gauntlet"],
      ["Plume x Re7 USDC", "Re7 Labs", "re7"],
      ["USDC Prime", null, null],
    ]);
  });
});
