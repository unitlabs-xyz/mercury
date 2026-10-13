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
const TRON: RelaySource = {
  chainId: 728126428,
  name: "tron",
  vmType: "tvm",
  currencies: [{ id: "usdt", symbol: "USDT", name: "USDT", address: "TR7NHq", decimals: 6 }],
};
const HYPE: RelaySource = {
  chainId: 999,
  name: "hyperliquid",
  vmType: "hypevm",
  currencies: [{ id: "usdc", symbol: "USDC", name: "USD Coin", address: "0xusdc", decimals: 6 }],
};

const REFUND = { evm: "0xevmRefund", svm: "SvmRefund", bvm: "bc1qRefund" };
const RECOVERY = { evm: "0xevmRecovery", svm: "SvmRecovery", bvm: "bc1qRecovery" };

const store = (over: Partial<FundDeps["store"]> = {}): FundDeps["store"] => ({
  create: vi.fn().mockResolvedValue({ id: "row" }),
  byDepositAddress: vi.fn(),
  advance: vi.fn(),
  forUser: vi.fn().mockResolvedValue([]),
  ...over,
});

const harness = (
  over: { chains?: readonly RelaySource[]; deps?: Partial<FundDeps> } = {},
  wallet: string | null = "PrivyWallet111",
) => {
  const chains = vi.fn().mockResolvedValue(over.chains ?? [SOLANA, BASE]);
  const depositAddressQuote = vi
    .fn()
    .mockResolvedValue({ requestId: "0xreq", depositAddress: "0xdeposit", quotedOutRaw: "9990000" });
  const deps: FundDeps = {
    relay: { chains, depositAddressQuote, status: vi.fn() },
    store: store(),
    refund: REFUND,
    recovery: RECOVERY,
    minimumUsd: 10,
    ...over.deps,
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: wallet });
    await next();
  });
  app.route("/", fundRoutes(deps));
  return { app, chains, depositAddressQuote, deps };
};

const post = (app: Hono, body: unknown) =>
  app.request("/v1/money/fund/address", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await app.request("/v1/money/fund/sources")).status).toBe(401);
  });

  it("answers 503 when Relay cannot be read", async () => {
    const { app } = harness({
      deps: {
        relay: {
          chains: vi.fn().mockRejectedValue(new Error("relay /chains failed: 500")),
          depositAddressQuote: vi.fn(),
          status: vi.fn(),
        },
      },
    });
    expect((await app.request("/v1/money/fund/sources")).status).toBe(503);
  });
});

describe("fundRoutes · address", () => {
  it("quotes to the session's wallet even when the body names another", async () => {
    const { app, depositAddressQuote } = harness();

    await post(app, { chainId: 8453, currency: "0x0", recipient: "AttackerWallet" });

    expect(depositAddressQuote.mock.calls[0]![0].recipient).toBe("PrivyWallet111");
  });

  it("picks the refund address by VM family, not by chain id", async () => {
    const { app, depositAddressQuote } = harness();

    await post(app, { chainId: 792703809, currency: "Es9vMFrz" });
    expect(depositAddressQuote.mock.calls[0]![0]).toMatchObject({
      refundTo: REFUND.svm,
      recoveryAddress: RECOVERY.svm,
    });

    await post(app, { chainId: 8453, currency: "0x0" });
    expect(depositAddressQuote.mock.calls[1]![0]).toMatchObject({ refundTo: REFUND.evm });
  });

  it("treats Hyperliquid's EVM as EVM", async () => {
    const { app, depositAddressQuote } = harness({ chains: [HYPE] });

    await post(app, { chainId: 999, currency: "0xusdc" });

    expect(depositAddressQuote.mock.calls[0]![0].refundTo).toBe(REFUND.evm);
  });

  it("sends no refund address for a family we hold no key for, and says so", async () => {
    const { app, depositAddressQuote } = harness({ chains: [TRON] });

    const res = await post(app, { chainId: 728126428, currency: "TR7NHq" });

    /* An 0x address on Tron would have Relay refund into nothing, silently. */
    expect(depositAddressQuote.mock.calls[0]![0]).not.toHaveProperty("refundTo");
    expect(depositAddressQuote.mock.calls[0]![0]).not.toHaveProperty("recoveryAddress");
    expect(await res.json()).toMatchObject({ autoRefund: false });
  });

  it("reports autoRefund for a family we do hold a key for", async () => {
    const { app } = harness();
    const res = await post(app, { chainId: 8453, currency: "0x0" });
    expect(await res.json()).toMatchObject({ autoRefund: true });
  });

  it("refuses an unknown chain and writes nothing", async () => {
    const { app, depositAddressQuote, deps } = harness();

    expect((await post(app, { chainId: 999999, currency: "0x0" })).status).toBe(400);
    expect(depositAddressQuote).not.toHaveBeenCalled();
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("refuses a token the chain does not solve, because such a deposit is unrecoverable", async () => {
    const { app, depositAddressQuote, deps } = harness();

    expect((await post(app, { chainId: 8453, currency: "0xNotSolved" })).status).toBe(400);
    expect(depositAddressQuote).not.toHaveBeenCalled();
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("refuses a malformed body", async () => {
    const { app } = harness();
    expect((await post(app, { chainId: "base" })).status).toBe(400);
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await post(app, { chainId: 8453, currency: "0x0" })).status).toBe(401);
  });

  it("records the intent before answering", async () => {
    const { app, deps } = harness();

    await post(app, { chainId: 8453, currency: "0x0" });

    expect(vi.mocked(deps.store.create).mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      relayRequestId: "0xreq",
      depositAddress: "0xdeposit",
      originChainId: 8453,
      originCurrency: "0x0",
      originChainName: "base",
      originCurrencySymbol: "ETH",
      recipientAddress: "PrivyWallet111",
      quotedOutRaw: "9990000",
    });
  });

  it("answers 503 on an upstream failure without leaking its text", async () => {
    const { app } = harness({
      chains: [BASE],
      deps: {
        relay: {
          chains: vi.fn().mockResolvedValue([BASE]),
          depositAddressQuote: vi
            .fn()
            .mockRejectedValue(new Error("relay /quote/v2 failed: 500 x-api-key abc123")),
          status: vi.fn(),
        },
      },
    });

    const res = await post(app, { chainId: 8453, currency: "0x0" });

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("x-api-key");
  });
});

describe("fundRoutes · intents", () => {
  const rows = [
    {
      id: "b",
      status: "pending",
      depositAddress: "bc1qdep",
      originChainId: 8253038,
      originCurrency: "bc1q",
      quotedOutRaw: null,
      inTxHash: null,
      outTxHash: null,
      failReason: null,
      createdAt: new Date("2026-10-13T10:00:00Z"),
    },
    {
      id: "a",
      status: "success",
      depositAddress: "0xdep",
      originChainId: 8453,
      originCurrency: "0x0",
      quotedOutRaw: "9990000",
      inTxHash: "0xin",
      outTxHash: "0xout",
      failReason: null,
      createdAt: new Date("2026-10-12T10:00:00Z"),
    },
  ];

  it("returns this user's deposits, newest first, with dates on the wire", async () => {
    const forUser = vi.fn().mockResolvedValue(rows);
    const { app } = harness({ deps: { store: store({ forUser }) } });

    const body = (await (await app.request("/v1/money/fund/intents")).json()) as {
      intents: { id: string; createdAt: string }[];
    };

    expect(forUser).toHaveBeenCalledWith("user-1");
    expect(body.intents.map((i) => i.id)).toEqual(["b", "a"]);
    expect(body.intents[0]!.createdAt).toBe("2026-10-13T10:00:00.000Z");
  });

  it("asks only for the session's own user, so there is nothing to tamper with", async () => {
    const forUser = vi.fn().mockResolvedValue([]);
    const { app } = harness({ deps: { store: store({ forUser }) } });

    await app.request("/v1/money/fund/intents?userId=someone-else");

    expect(forUser).toHaveBeenCalledWith("user-1");
    expect(forUser).toHaveBeenCalledTimes(1);
  });

  it("refuses an unauthenticated read of deposits", async () => {
    const { app } = harness({}, null);
    expect((await app.request("/v1/money/fund/intents")).status).toBe(401);
  });
});
