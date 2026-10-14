import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { fundRoutes, type FundDeps } from "./fund.js";
import type { RelaySource } from "../funding/relay.js";

const SOLANA: RelaySource = {
  chainId: 792703809,
  name: "solana",
  vmType: "svm",
  currencies: [{ id: "usdt", symbol: "USDT", name: "USDT", address: "Es9vMFrz", decimals: 6 }],
};
const BASE: RelaySource = {
  chainId: 8453,
  name: "base",
  vmType: "evm",
  currencies: [{ id: "eth", symbol: "ETH", name: "Ether", address: "0x0", decimals: 18 }],
};
const BITCOIN: RelaySource = {
  chainId: 8253038,
  name: "bitcoin",
  vmType: "bvm",
  currencies: [{ id: "btc", symbol: "BTC", name: "Bitcoin", address: "bc1qq", decimals: 8 }],
};

const SOL_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const EVM_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const INTENT_ID = "11111111-1111-4111-8111-111111111111";
/* Realistic lengths: the schema has a floor, and a six-character stand-in
   trips it rather than the code under test. */
const IN_HASH = `0x${"a".repeat(64)}`;
const OUT_HASH = "5".repeat(88);

const DETAILS = {
  requestId: "0xreq",
  inFormatted: "10.0",
  outRaw: "9990651",
  outFormatted: "9.990651",
  impactPct: "0.01",
};

const store = (over: Partial<FundDeps["store"]> = {}): FundDeps["store"] => ({
  create: vi.fn().mockResolvedValue({ id: INTENT_ID }),
  byId: vi.fn(),
  forUser: vi.fn().mockResolvedValue([]),
  markSubmitted: vi.fn().mockResolvedValue({ id: INTENT_ID, status: "submitted" }),
  byRequestId: vi.fn(),
  settle: vi.fn(),
  unsettled: vi.fn().mockResolvedValue([]),
  ...over,
});

const harness = (
  over: { chains?: readonly RelaySource[]; deps?: Partial<FundDeps> } = {},
  wallet: string | null = "PrivyWallet111",
) => {
  const chains = vi.fn().mockResolvedValue(over.chains ?? [SOLANA, BASE]);
  const fundQuote = vi.fn().mockResolvedValue({ details: DETAILS, quote: { requestId: "0xreq" } });
  const deps: FundDeps = {
    relay: { chains, fundQuote, status: vi.fn() },
    store: store(),
    minimumUsd: 10,
    ...over.deps,
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: wallet });
    await next();
  });
  app.route("/", fundRoutes(deps));
  return { app, chains, fundQuote, deps };
};

const post = (app: Hono, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const swap = { chainId: 792703809, currency: "Es9vMFrz", amountRaw: "10000000", from: SOL_WALLET };

describe("fundRoutes · sources", () => {
  it("offers every chain the client reports, and caches the list", async () => {
    const { app, chains } = harness();

    const first = await app.request("/v1/money/fund/sources");
    await app.request("/v1/money/fund/sources");

    expect(((await first.json()) as { chains: unknown[] }).chains).toHaveLength(2);
    expect(chains).toHaveBeenCalledTimes(1);
  });

  it("states the minimum rather than leaving the interface to hardcode it", async () => {
    const { app } = harness();
    const body = (await (await app.request("/v1/money/fund/sources")).json()) as { minimumUsd: string };
    expect(body.minimumUsd).toBe("10");
  });

  it("does not offer Bitcoin, which has no wallet this app can sign with", async () => {
    const { app } = harness({ chains: [SOLANA, BITCOIN] });

    const body = (await (await app.request("/v1/money/fund/sources")).json()) as {
      chains: { name: string }[];
    };

    /* Relay would take a BTC deposit, but only to an address — a connected
       wallet answers with a PSBT and nothing here signs one. */
    expect(body.chains.map((c) => c.name)).toEqual(["solana"]);
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await app.request("/v1/money/fund/sources")).status).toBe(401);
  });

  it("answers 503 when Relay cannot be read", async () => {
    const { app } = harness({
      deps: {
        relay: {
          chains: vi.fn().mockRejectedValue(new Error("relay /chains failed: 500")),
          fundQuote: vi.fn(),
          status: vi.fn(),
        },
      },
    });
    expect((await app.request("/v1/money/fund/sources")).status).toBe(503);
  });
});

describe("fundRoutes · swap", () => {
  it("quotes to the session's wallet, whatever the body says", async () => {
    const { app, fundQuote } = harness();

    await post(app, "/v1/money/fund/swap", { ...swap, recipient: "AttackerWallet" });

    expect(fundQuote.mock.calls[0]![0]).toMatchObject({ recipient: "PrivyWallet111", user: SOL_WALLET });
  });

  it("returns the quote for the browser to execute, with the intent", async () => {
    const { app } = harness();

    const body = (await (await post(app, "/v1/money/fund/swap", swap)).json()) as Record<string, unknown>;

    expect(body["intentId"]).toBe(INTENT_ID);
    expect(body["quote"]).toMatchObject({ requestId: "0xreq" });
    expect(body["out"]).toMatchObject({ amountFormatted: "9.990651", symbol: "USDC" });
  });

  it("uses the same shape for an EVM origin", async () => {
    /* One path for every VM is the point: the route does not branch, and the
       browser hands whatever comes back to Relay's execute(). */
    const { app } = harness({ chains: [BASE] });

    const body = (await (
      await post(app, "/v1/money/fund/swap", {
        chainId: 8453,
        currency: "0x0",
        amountRaw: "10000000000000000",
        from: EVM_WALLET,
      })
    ).json()) as Record<string, unknown>;

    expect(body["quote"]).toMatchObject({ requestId: "0xreq" });
    expect(body["intentId"]).toBe(INTENT_ID);
  });

  it("records the intent with what the user was shown", async () => {
    const { app, deps } = harness();

    await post(app, "/v1/money/fund/swap", swap);

    expect(vi.mocked(deps.store.create).mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      relayRequestId: "0xreq",
      originChainId: 792703809,
      originChainName: "solana",
      originCurrencySymbol: "USDT",
      recipientAddress: "PrivyWallet111",
    });
  });

  it("refuses an unknown chain and writes nothing", async () => {
    const { app, fundQuote, deps } = harness();

    expect((await post(app, "/v1/money/fund/swap", { ...swap, chainId: 999999 })).status).toBe(400);
    expect(fundQuote).not.toHaveBeenCalled();
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("refuses a token the chain does not solve, because such a deposit is unrecoverable", async () => {
    const { app, fundQuote } = harness();

    expect((await post(app, "/v1/money/fund/swap", { ...swap, currency: "0xNope" })).status).toBe(400);
    expect(fundQuote).not.toHaveBeenCalled();
  });

  it("refuses an address from the wrong VM, in both directions", async () => {
    const { app } = harness();
    expect((await post(app, "/v1/money/fund/swap", { ...swap, from: EVM_WALLET })).status).toBe(400);

    const evm = harness({ chains: [BASE] });
    expect(
      (
        await post(evm.app, "/v1/money/fund/swap", {
          chainId: 8453,
          currency: "0x0",
          amountRaw: "1",
          from: SOL_WALLET,
        })
      ).status,
    ).toBe(400);
  });

  it("refuses a zero or non-numeric amount", async () => {
    const { app } = harness();
    expect((await post(app, "/v1/money/fund/swap", { ...swap, amountRaw: "0" })).status).toBe(400);
    expect((await post(app, "/v1/money/fund/swap", { ...swap, amountRaw: "ten" })).status).toBe(400);
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await post(app, "/v1/money/fund/swap", swap)).status).toBe(401);
  });

  it("answers 503 on an upstream failure without leaking its text", async () => {
    const { app } = harness({
      chains: [SOLANA],
      deps: {
        relay: {
          chains: vi.fn().mockResolvedValue([SOLANA]),
          fundQuote: vi.fn().mockRejectedValue(new Error("relay /quote/v2 failed: 500 x-api-key abc")),
          status: vi.fn(),
        },
      },
    });

    const res = await post(app, "/v1/money/fund/swap", swap);

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("x-api-key");
  });
});

describe("fundRoutes · submitted, which is a report and not a verdict", () => {
  it("records the hashes the browser executed", async () => {
    const markSubmitted = vi.fn().mockResolvedValue({ status: "submitted" });
    const { app } = harness({ deps: { store: store({ markSubmitted }) } });

    const res = await post(app, "/v1/money/fund/submitted", {
      intentId: INTENT_ID,
      inTxHash: IN_HASH,
      outTxHash: OUT_HASH,
    });

    expect(await res.json()).toEqual({ status: "submitted" });
    expect(markSubmitted).toHaveBeenCalledWith("user-1", INTENT_ID, {
      inTxHash: IN_HASH,
      outTxHash: OUT_HASH,
    });
  });

  it("accepts a report with only the origin hash, which is all a cross-chain deposit has", async () => {
    const markSubmitted = vi.fn().mockResolvedValue({ status: "submitted" });
    const { app } = harness({ deps: { store: store({ markSubmitted }) } });

    await post(app, "/v1/money/fund/submitted", { intentId: INTENT_ID, inTxHash: IN_HASH });

    expect(markSubmitted.mock.calls[0]![2]).toEqual({ inTxHash: IN_HASH });
  });

  it("has no way to ask for a terminal status", async () => {
    const markSubmitted = vi.fn().mockResolvedValue({ status: "submitted" });
    const { app } = harness({ deps: { store: store({ markSubmitted }) } });

    /* A client naming a status is simply not read. Only Relay's signed
       webhook settles a deposit; see routes/relay-webhook.ts. */
    const res = await post(app, "/v1/money/fund/submitted", {
      intentId: INTENT_ID,
      inTxHash: IN_HASH,
      status: "success",
    });

    expect(await res.json()).toEqual({ status: "submitted" });
    expect(markSubmitted.mock.calls[0]![2]).not.toHaveProperty("status");
  });

  it("answers 404 for an intent that is not this caller's, or is already settled", async () => {
    const { app } = harness({ deps: { store: store({ markSubmitted: vi.fn().mockResolvedValue(null) }) } });

    expect((await post(app, "/v1/money/fund/submitted", { intentId: INTENT_ID })).status).toBe(404);
  });

  it("refuses a body that is not an intent id", async () => {
    const { app } = harness();
    expect((await post(app, "/v1/money/fund/submitted", { intentId: "nope" })).status).toBe(400);
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await post(app, "/v1/money/fund/submitted", { intentId: INTENT_ID })).status).toBe(401);
  });
});

describe("fundRoutes · intents", () => {
  const rows = [
    {
      id: "b",
      status: "submitted",
      originChainId: 8453,
      originChainName: "base",
      originCurrencySymbol: "ETH",
      quotedOutRaw: "9990651",
      inTxHash: IN_HASH,
      outTxHash: null,
      failReason: null,
      createdAt: new Date("2026-10-14T10:00:00Z"),
    },
    {
      id: "a",
      status: "success",
      originChainId: 792703809,
      originChainName: "solana",
      originCurrencySymbol: "USDT",
      quotedOutRaw: "9990651",
      inTxHash: "sig",
      outTxHash: "sig",
      failReason: null,
      createdAt: new Date("2026-10-13T10:00:00Z"),
    },
  ];

  it("returns this user's deposits, newest first, with dates on the wire", async () => {
    const forUser = vi.fn().mockResolvedValue(rows);
    const { app } = harness({ deps: { store: store({ forUser }) } });

    const body = (await (await app.request("/v1/money/fund/intents")).json()) as {
      intents: { id: string; createdAt: string; originChainName: string }[];
    };

    expect(forUser).toHaveBeenCalledWith("user-1");
    expect(body.intents.map((i) => i.id)).toEqual(["b", "a"]);
    expect(body.intents[0]!.createdAt).toBe("2026-10-14T10:00:00.000Z");
    expect(body.intents[0]!.originChainName).toBe("base");
  });

  it("asks only for the session's own user, so there is nothing to tamper with", async () => {
    const forUser = vi.fn().mockResolvedValue([]);
    const { app } = harness({ deps: { store: store({ forUser }) } });

    await app.request("/v1/money/fund/intents?userId=someone-else");

    expect(forUser).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("refuses an unauthenticated read of deposits", async () => {
    const { app } = harness({}, null);
    expect((await app.request("/v1/money/fund/intents")).status).toBe(401);
  });
});
