import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, type Decimal } from "@mercury/core";
import type { TransactionDetail } from "@mercury/chain";
import { earnRoutes, usdcMoved, type EarnDeps } from "./earn.js";
import type { EarnIntent, EarnPosition, EarnSource } from "../earn/ports.js";
import type { EarnLedger, EarnRecord, EarnSettings } from "../earn/store.js";
import type { EarnDirectory, EarnHolding, EarnListing } from "../earn/directory.js";
import { EARN_VAULTS } from "../earn/catalog.js";
import type { KaminoApi } from "../earn/kamino-api.js";
import { EarnRefused } from "../earn/kamino-vault.js";
import { SponsorShort } from "../lending/ports.js";

/** The fields these tests read, off any of the routes' answers. */
type Body = {
  selected: string;
  vaults: { address: string; picked: boolean; kind: string | null; apy30d: string | null }[];
  holdings: { address: string; balanceUsd: string; earnedUsd: string }[];
  balanceUsd: string;
  earnedUsd: string;
  apy: string | null;
  walletUsd: string;
  points: { apy: string }[];
  allocation: { name: string; share: string }[];
  error: { code: string };
};

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "WaLLeT";
const [STEADY, OTHER] = [EARN_VAULTS[0]!.address, "OtherVault"];

const listing = (address: string, over: Partial<EarnListing> = {}): EarnListing => ({
  address,
  name: address === STEADY ? "Steakhouse USDC" : "Other USDC",
  picked: address === STEADY ? EARN_VAULTS[0]! : null,
  curator: address === STEADY ? "Steakhouse Financial" : null,
  logo: address === STEADY ? "steakhouse" : null,
  apy: D("0.04"),
  apy7d: D("0.05"),
  apy30d: D("0.0519"),
  apy365d: D("0.047"),
  tvlUsd: D(19e6),
  holders: 3422,
  performanceFee: D("0.05"),
  managementFee: D(0),
  minDepositUsdc: D("0.1"),
  full: false,
  sharesMint: `shares-${address}`,
  sharesDecimals: 6,
  tokensPerShare: D("1.06"),
  ...over,
});

type Fake = { position?: EarnPosition | null; built?: EarnIntent[]; fail?: Error };

const source = (address: string, f: Fake = {}): EarnSource => ({
  address,
  vault: async () => {
    throw new Error("the routes read the list, not the vault");
  },
  allocation: async () => [
    { market: "Main", usdc: D(75) },
    { market: "Jlp", usdc: D(25) },
  ],
  position: async () => f.position ?? null,
  build: async (_wallet, intent) => {
    if (f.fail) throw f.fail;
    f.built?.push(intent);
    return {
      transactions: ["dHg="],
      messages: [new Uint8Array([1])],
      firstTime: false,
      expiresAt: new Date(0),
    };
  },
});

const directory = (
  fakes: Record<string, Fake> = {},
  holdings: EarnHolding[] = [],
  listings: EarnListing[] = [listing(STEADY), listing(OTHER)],
): EarnDirectory => ({
  list: async () => listings,
  find: async (a) => listings.find((l) => l.address === a),
  source: (a) => source(a, fakes[a]),
  holdings: async () => holdings,
  defaultVault: STEADY,
  api,
});

const api: KaminoApi = {
  vaults: async () => [],
  metrics: async () => null,
  history: async () => [
    { at: "2026-10-16T00:00:00.000Z", apy: D("0.04"), tvlUsd: D(19e6), sharePrice: D("1.06") },
    { at: "2026-10-17T00:00:00.000Z", apy: D("0.041"), tvlUsd: D(19e6), sharePrice: D("1.0601") },
  ],
  marketNames: async () => new Map([["Main", "Main Market"]]),
};

const ledger = (net: Record<string, Decimal> = {}, records: EarnRecord[] = []) => {
  let settings: EarnSettings = { vault: null };
  const l: EarnLedger = {
    settings: async () => settings,
    save: async (_u, change) => {
      settings = { ...settings, ...change };
    },
    netDeposited: async () => new Map(Object.entries(net)),
    record: async (e) => {
      records.push(e);
      return true;
    },
  };
  return l;
};

const tx = (pre: bigint, post: bigint, keys: string[] = [WALLET, STEADY]): TransactionDetail => ({
  signature: "sig",
  blockTime: 1_760_000_000,
  succeeded: true,
  accountKeys: keys,
  feeLamports: 5000n,
  preLamports: [],
  postLamports: [],
  preTokens: [{ mint: USDC, owner: WALLET, rawAmount: pre, decimals: 6 }],
  postTokens: [{ mint: USDC, owner: WALLET, rawAmount: post, decimals: 6 }],
});

const deps = (over: Partial<EarnDeps> = {}): EarnDeps => ({
  directory: directory(),
  api,
  chain: {
    tokenBalances: async () => [{ mint: USDC, rawAmount: 25_000_000n, decimals: 6 }],
    mintConfig: async () => null,
  },
  history: {
    tokenAccountsFor: async () => [],
    signatures: async () => [],
    transaction: async () => tx(25_000_000n, 5_000_000n),
  },
  usdcMint: USDC,
  ledger: ledger(),
  ...over,
});

const appWith = (d: EarnDeps) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: WALLET });
    await next();
  });
  app.route("/", earnRoutes(d));
  return app;
};

const send = (app: Hono, method: string, path: string, body: unknown) =>
  app.request(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const json = async (res: Response) => (await res.json()) as Body;

describe("GET /v1/earn", () => {
  it("adds up every vault the wallet holds, and what each earned over what went in", async () => {
    const holdings = [
      { listing: listing(STEADY), shares: D(10), usdc: D("20.4") },
      { listing: listing(OTHER, { apy: D("0.06") }), shares: D(1), usdc: D("5.1") },
    ];
    const body = await json(
      await appWith(
        deps({ directory: directory({}, holdings), ledger: ledger({ [STEADY]: D(20), [OTHER]: D(5) }) }),
      ).request("/v1/earn"),
    );
    expect(body.balanceUsd).toBe("25.5");
    expect(body.earnedUsd).toBe("0.5");
    expect(body.walletUsd).toBe("25");
    expect(body.holdings.map((h) => h.address)).toEqual([STEADY, OTHER]);
    // (20.4 × 4% + 5.1 × 6%) / 25.5
    expect(body.apy).toBe("0.044");
  });

  it("reports nothing earned in a vault with no deposit recorded, and no rate with nothing in", async () => {
    const body = await json(
      await appWith(
        deps({ directory: directory({}, [{ listing: listing(STEADY), shares: D(10), usdc: D("20.4") }]) }),
      ).request("/v1/earn"),
    );
    expect(body.holdings[0]!.earnedUsd).toBe("0");
    expect((await json(await appWith(deps()).request("/v1/earn"))).apy).toBeNull();
  });

  it("defaults to the vault last moved into", async () => {
    const d = deps();
    await d.ledger.save("user-1", { vault: OTHER });
    expect((await json(await appWith(d).request("/v1/earn"))).selected).toBe(OTHER);
  });
});

describe("GET /v1/earn/vaults", () => {
  it("lists every vault on offer, the picks marked with our own words", async () => {
    const body = await json(await appWith(deps()).request("/v1/earn/vaults"));
    expect(body.vaults.map((v) => [v.address, v.picked, v.kind])).toEqual([
      [STEADY, true, "crypto"],
      [OTHER, false, null],
    ]);
  });
});

describe("GET /v1/earn/vaults/:address", () => {
  it("gives the rate over time and where the money is lent, by market name", async () => {
    const body = await json(await appWith(deps()).request(`/v1/earn/vaults/${STEADY}?range=1M`));
    expect(body.points.map((p) => p.apy)).toEqual(["0.04", "0.041"]);
    expect(body.allocation).toEqual([
      { market: "Main", name: "Main", share: "0.75" },
      { market: "Jlp", name: "Kamino market", share: "0.25" },
    ]);
  });

  it("refuses a vault Mercury does not offer", async () => {
    expect((await appWith(deps()).request("/v1/earn/vaults/Elsewhere")).status).toBe(404);
  });
});

describe("PUT /v1/earn/settings", () => {
  it("keeps the default vault", async () => {
    const d = deps();
    await send(appWith(d), "PUT", "/v1/earn/settings", { vault: OTHER });
    expect(await d.ledger.settings("user-1")).toEqual({ vault: OTHER });
  });

  it("refuses a vault Mercury does not offer", async () => {
    const res = await send(appWith(deps()), "PUT", "/v1/earn/settings", { vault: "Elsewhere" });
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/earn/transactions", () => {
  it("deposits into the chosen vault, within the wallet's cash", async () => {
    const built: EarnIntent[] = [];
    const d = deps({ directory: directory({ [OTHER]: { built } }) });
    await d.ledger.save("user-1", { vault: OTHER });
    const res = await send(appWith(d), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "20" });
    expect(res.status).toBe(200);
    expect(built[0]).toEqual({ kind: "deposit", usdc: D(20) });
  });

  it("moves all the wallet's cash when asked for all", async () => {
    const built: EarnIntent[] = [];
    await send(
      appWith(deps({ directory: directory({ [STEADY]: { built } }) })),
      "POST",
      "/v1/earn/transactions",
      {
        kind: "deposit",
        usd: "all",
      },
    );
    expect(built[0]).toEqual({ kind: "deposit", usdc: D(25) });
  });

  it("refuses more than the wallet holds", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "26" });
    expect((await json(res)).error.code).toBe("insufficient_cash");
  });

  it("withdraws from the vault named, every share when asked for all but the last cent", async () => {
    const built: EarnIntent[] = [];
    await send(
      appWith(
        deps({
          directory: directory({ [OTHER]: { position: { shares: D(10), usdc: D("20.405") }, built } }),
        }),
      ),
      "POST",
      "/v1/earn/transactions",
      { kind: "withdraw", usd: "20.40", vault: OTHER },
    );
    expect(built[0]).toEqual({ kind: "withdraw", usdc: "all" });
  });

  it("refuses a withdrawal with nothing in the vault", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/transactions", {
      kind: "withdraw",
      usd: "all",
    });
    expect((await json(res)).error.code).toBe("nothing_to_withdraw");
  });

  it("says a short relayer as an outage", async () => {
    const res = await send(
      appWith(deps({ directory: directory({ [STEADY]: { fail: new SponsorShort("R", 1n, 2n) } }) })),
      "POST",
      "/v1/earn/transactions",
      { kind: "deposit", usd: "1" },
    );
    expect(res.status).toBe(503);
  });

  it("says a vault refusal plainly", async () => {
    const res = await send(
      appWith(deps({ directory: directory({ [STEADY]: { fail: new EarnRefused("{}", []) } }) })),
      "POST",
      "/v1/earn/transactions",
      { kind: "deposit", usd: "1" },
    );
    expect((await json(res)).error.code).toBe("vault_refused");
  });
});

describe("POST /v1/earn/confirm", () => {
  it("records the USDC that actually left the wallet, against the vault", async () => {
    const records: EarnRecord[] = [];
    const res = await send(appWith(deps({ ledger: ledger({}, records) })), "POST", "/v1/earn/confirm", {
      signature: "sig",
      action: { kind: "deposit", usd: "20", vault: STEADY },
    });
    expect(res.status).toBe(200);
    expect(records[0]).toMatchObject({ kind: "deposit", vault: STEADY, signature: "sig" });
    expect(records[0]?.usdc.toString()).toBe("20");
  });

  it("refuses to file a transaction under a vault it never touched", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/confirm", {
      signature: "sig",
      action: { kind: "deposit", usd: "20", vault: OTHER },
    });
    expect(res.status).toBe(422);
  });

  it("refuses a transaction that moved the other way", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/confirm", {
      signature: "sig",
      action: { kind: "withdraw", usd: "all" },
    });
    expect(res.status).toBe(422);
  });

  it("asks to retry when the node has not seen it yet", async () => {
    const d = deps();
    const res = await send(
      appWith({ ...d, history: { ...d.history, transaction: async () => null } }),
      "POST",
      "/v1/earn/confirm",
      { signature: "sig", action: { kind: "deposit", usd: "1" } },
    );
    expect(res.status).toBe(409);
  });
});

describe("usdcMoved", () => {
  it("is the wallet's own USDC change, signed", () => {
    expect(usdcMoved(tx(1_000_000n, 3_500_000n), WALLET, USDC).toString()).toBe("2.5");
  });
});
