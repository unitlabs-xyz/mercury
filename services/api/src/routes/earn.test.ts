import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, type Decimal } from "@mercury/core";
import type { TransactionDetail } from "@mercury/chain";
import { earnRoutes, type EarnDeps } from "./earn.js";
import { usdcMoved } from "../earn/record.js";
import type { EarnIntent, EarnPosition, EarnSource } from "../earn/ports.js";
import type { EarnLedger, EarnRecord, EarnSettings } from "../earn/store.js";
import type { EarnDirectory, EarnHolding, EarnListing } from "../earn/directory.js";
import { EARN_VAULTS } from "../earn/catalog.js";
import type { KaminoApi } from "../earn/kamino-api.js";
import { EarnRefused } from "../earn/kamino-vault.js";
import { EARN_RISK_VERSION } from "../earn/risk.js";
import { OwnerShort, SponsorShort } from "../lending/ports.js";
import type { Acting } from "../wallets/acting.js";
import { actingAs, actingLinked } from "../wallets/testing.js";

/** The fields these tests read, off any of the routes' answers. */
type Body = {
  selected: string;
  vaults: { address: string; picked: boolean; kind: string | null; apy30d: string | null }[];
  holdings: { address: string; balanceUsd: string; earnedUsd: string }[];
  balanceUsd: string;
  earnedUsd: string;
  apy: string | null;
  walletUsd: string;
  riskAccepted: boolean;
  points: { apy: string }[];
  allocation: { name: string; share: string }[];
  error: { code: string };
};

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "WaLLeT";
const [STEADY, OTHER] = [EARN_VAULTS[0]!.address, "OtherVault"];
/** A Kamino USDC vault this wallet holds that Mercury no longer lists. */
const GONE = "GoneVault";

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
  offered: true,
  ...over,
});

type Fake = {
  position?: EarnPosition | null;
  built?: EarnIntent[];
  fail?: Error;
  /** Each build's sponsor, as it was asked. */
  sponsors?: (string | undefined)[];
};

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
  build: async (_wallet, intent, sponsor) => {
    if (f.fail) throw f.fail;
    f.built?.push(intent);
    f.sponsors?.push(sponsor);
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
  known: async (a) => a === GONE || listings.some((l) => l.address === a),
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

const ledger = (
  net: Record<string, Decimal> = {},
  records: EarnRecord[] = [],
  riskAccepted: string | null = EARN_RISK_VERSION,
) => {
  let settings: EarnSettings = { vault: null, riskAccepted };
  const l: EarnLedger = {
    settings: async () => settings,
    save: async (_u, change) => {
      settings = { ...settings, ...change };
    },
    netDeposited: async () => new Map(Object.entries(net)),
    estimatedVaults: async () => new Set(),
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

const appWith = (d: EarnDeps, acting: Acting = { all: false, wallets: [actingAs(WALLET)] }) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: WALLET });
    c.set("acting", acting);
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

  it("falls back to the first vault on offer when the configured default is not one", async () => {
    const d = deps({ directory: { ...directory(), defaultVault: "NotListed" } });
    expect((await json(await appWith(d).request("/v1/earn"))).selected).toBe(STEADY);
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

  it("refuses a range it does not know, including the names every object inherits", async () => {
    for (const range of ["5Y", "constructor", "toString", "__proto__"]) {
      const res = await appWith(deps()).request(`/v1/earn/vaults/${STEADY}?range=${range}`);
      expect(res.status, range).toBe(400);
    }
  });
});

describe("Earn's risks", () => {
  /* Money went in with no word that a vault can lose it or make you wait. */
  it("refuses a first deposit until the current wording is accepted", async () => {
    const d = deps({ ledger: ledger({}, [], null) });
    expect((await json(await appWith(d).request("/v1/earn"))).riskAccepted).toBe(false);
    const res = await send(appWith(d), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "1" });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("risk_not_accepted");
  });

  it("takes a deposit once accepted", async () => {
    const d = deps({ ledger: ledger({}, [], null) });
    const accepted = await send(appWith(d), "PUT", "/v1/earn/risk", { version: EARN_RISK_VERSION });
    expect(accepted.status).toBe(200);
    expect((await json(await appWith(d).request("/v1/earn"))).riskAccepted).toBe(true);
    const res = await send(appWith(d), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "1" });
    expect(res.status).toBe(200);
  });

  it("asks again when the wording has changed since", async () => {
    const d = deps({ ledger: ledger({}, [], "2026-01-01") });
    expect((await json(await appWith(d).request("/v1/earn"))).riskAccepted).toBe(false);
    const stale = await send(appWith(d), "PUT", "/v1/earn/risk", { version: "2026-01-01" });
    expect((await json(stale)).error.code).toBe("risk_changed");
  });

  it("never stands between a person and their withdrawal", async () => {
    const d = deps({
      ledger: ledger({}, [], null),
      directory: directory({ [STEADY]: { position: { shares: D(1), usdc: D(5) } } }),
    });
    const res = await send(appWith(d), "POST", "/v1/earn/transactions", { kind: "withdraw", usd: "all" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /v1/earn/settings", () => {
  it("keeps the default vault", async () => {
    const d = deps();
    await send(appWith(d), "PUT", "/v1/earn/settings", { vault: OTHER });
    expect((await d.ledger.settings("user-1")).vault).toBe(OTHER);
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

  it("remembers each move it builds, so the move is recorded even if the app never confirms", async () => {
    const remembered: unknown[] = [];
    const d = deps({ sends: { remember: (bytes, move) => remembered.push([[...bytes], move]) } });
    await send(appWith(d), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "20" });
    expect(remembered).toEqual([
      [
        [1],
        { userId: "user-1", wallet: WALLET, walletId: "wallet-id-WaLLeT", kind: "deposit", vault: STEADY },
      ],
    ]);
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

  it("withdraws from a vault the wallet holds that Mercury no longer lists", async () => {
    const built: EarnIntent[] = [];
    const res = await send(
      appWith(deps({ directory: directory({ [GONE]: { position: { shares: D(1), usdc: D(5) }, built } }) })),
      "POST",
      "/v1/earn/transactions",
      { kind: "withdraw", usd: "all", vault: GONE },
    );
    expect(res.status).toBe(200);
    expect(built[0]).toEqual({ kind: "withdraw", usdc: "all" });
  });

  it("never deposits into a vault Mercury no longer lists", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/transactions", {
      kind: "deposit",
      usd: "1",
      vault: GONE,
    });
    expect(res.status).toBe(404);
  });

  it("refuses to withdraw from something that is not a Kamino USDC vault", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/transactions", {
      kind: "withdraw",
      usd: "all",
      vault: "Elsewhere",
    });
    expect(res.status).toBe(404);
  });

  it("refuses to withdraw nothing", async () => {
    const res = await send(
      appWith(deps({ directory: directory({ [STEADY]: { position: { shares: D(10), usdc: D(20) } } }) })),
      "POST",
      "/v1/earn/transactions",
      { kind: "withdraw", usd: "0.00", vault: STEADY },
    );
    expect((await json(res)).error.code).toBe("validation_failed");
  });

  it("refuses a withdrawal with nothing in the vault", async () => {
    const res = await send(appWith(deps()), "POST", "/v1/earn/transactions", {
      kind: "withdraw",
      usd: "all",
    });
    expect((await json(res)).error.code).toBe("nothing_to_withdraw");
  });

  it("sponsors the Mercury wallet, and has a linked wallet pay its own fee and rent", async () => {
    const sponsors: (string | undefined)[] = [];
    const withRelay = {
      ...deps({ directory: directory({ [STEADY]: { sponsors } }) }),
      relay: { relayer: "ReLaYeR", builds: { remember: () => {}, recognises: () => false, size: 0 } },
    };
    await send(appWith(withRelay), "POST", "/v1/earn/transactions", { kind: "deposit", usd: "1" });
    await send(
      appWith(withRelay, { all: false, wallets: [actingLinked(WALLET)] }),
      "POST",
      "/v1/earn/transactions",
      { kind: "deposit", usd: "1" },
    );
    expect(sponsors).toEqual(["ReLaYeR", undefined]);
  });

  it("says what SOL a linked wallet paying its own way needs, before it signs", async () => {
    const res = await send(
      appWith(deps({ directory: directory({ [STEADY]: { fail: new OwnerShort(50_000n, 2_139_280n) } }) }), {
        all: false,
        wallets: [actingLinked(WALLET)],
      }),
      "POST",
      "/v1/earn/transactions",
      { kind: "deposit", usd: "1" },
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error.code).toBe("needs_sol");
    expect((body.error as unknown as { message: string }).message).toContain(
      "needs about 0.002 SOL, and holds 0.000",
    );
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

  it("says a refused withdrawal is about the vault's cash, not to try another vault", async () => {
    const res = await send(
      appWith(
        deps({
          directory: directory({
            [STEADY]: { position: { shares: D(10), usdc: D(20) }, fail: new EarnRefused("{}", []) },
          }),
        }),
      ),
      "POST",
      "/v1/earn/transactions",
      { kind: "withdraw", usd: "all", vault: STEADY },
    );
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("vault_refused");
    expect(body.error.message).toMatch(/can't pay that out right now/);
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

  it("records a withdrawal from a vault Mercury no longer lists", async () => {
    const records: EarnRecord[] = [];
    const d = deps({ ledger: ledger({}, records) });
    const res = await send(
      appWith({
        ...d,
        history: { ...d.history, transaction: async () => tx(0n, 5_000_000n, [WALLET, GONE]) },
      }),
      "POST",
      "/v1/earn/confirm",
      { signature: "sig", action: { kind: "withdraw", usd: "all", vault: GONE } },
    );
    expect(res.status).toBe(200);
    expect(records[0]).toMatchObject({ kind: "withdraw", vault: GONE });
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

describe("GET /v1/earn, across wallets", () => {
  const MERCURY = actingAs(WALLET);
  const PHANTOM = actingLinked("Phantom");

  /** The Mercury wallet in STEADY with $20 recorded; the linked one in STEADY and OTHER with nothing recorded. */
  const twoWallets = () => {
    const owners: unknown[] = [];
    const d = deps({
      directory: {
        ...directory(),
        holdings: async (wallet) =>
          wallet === WALLET
            ? [{ listing: listing(STEADY), shares: D(10), usdc: D("20.4") }]
            : [
                { listing: listing(STEADY), shares: D(5), usdc: D("10") },
                { listing: listing(OTHER), shares: D(1), usdc: D("3") },
              ],
      },
      ledger: {
        ...ledger(),
        netDeposited: async (owner) => {
          owners.push(owner);
          return new Map(owner.walletId === MERCURY.id ? [[STEADY, D(20)]] : []);
        },
      },
      chain: {
        tokenBalances: async (wallet) => [
          { mint: USDC, rawAmount: wallet === WALLET ? 25_000_000n : 7_000_000n, decimals: 6 },
        ],
        mintConfig: async () => null,
      },
    });
    return { d, owners };
  };

  it("reads the chosen linked wallet's vaults against its own deposits", async () => {
    const { d, owners } = twoWallets();
    const body = await json(await appWith(d, { all: false, wallets: [PHANTOM] }).request("/v1/earn"));
    expect(owners).toEqual([{ userId: "user-1", walletId: PHANTOM.id }]);
    expect(body.balanceUsd).toBe("13");
    expect(body.walletUsd).toBe("7");
    // Nothing recorded against the linked wallet: nothing earned, never its whole balance.
    expect(body.earnedUsd).toBe("0");
  });

  it("adds every wallet up, a vault held in two wallets as one row, each earned against its own wallet", async () => {
    const { d } = twoWallets();
    const body = await json(await appWith(d, { all: true, wallets: [MERCURY, PHANTOM] }).request("/v1/earn"));
    expect(body.holdings.map((h) => [h.address, h.balanceUsd])).toEqual([
      [STEADY, "30.4"],
      [OTHER, "3"],
    ]);
    // Only the Mercury wallet's $0.40 over its $20: the linked wallet's $10 is not measured against it.
    expect(body.earnedUsd).toBe("0.4");
    expect(body.balanceUsd).toBe("33.4");
    expect(body.walletUsd).toBe("32");
  });
});
