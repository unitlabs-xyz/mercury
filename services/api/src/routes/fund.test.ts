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
  byId: vi.fn(),
  settleById: vi.fn(),
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
    relay: { chains, depositAddressQuote, swapQuote: vi.fn(), status: vi.fn() },
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
          swapQuote: vi.fn(),
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
          swapQuote: vi.fn(),
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

const SOLANA_IX = {
  programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  keys: [{ pubkey: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", isSigner: true, isWritable: true }],
  data: Buffer.from([1]).toString("base64"),
};

const solana = (over: Partial<NonNullable<FundDeps["solana"]>> = {}) => ({
  lookups: { read: vi.fn().mockResolvedValue(new Map()) },
  blockhash: vi
    .fn()
    .mockResolvedValue({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1000n }),
  landed: vi.fn().mockResolvedValue(true),
  ...over,
});

const swapQuoted = () =>
  vi.fn().mockResolvedValue({
    requestId: "0xswap",
    instructions: [SOLANA_IX],
    lookupTables: [],
    inFormatted: "10.0",
    outRaw: "9990651",
    outFormatted: "9.990651",
    impactPct: "0.01",
    vmType: "svm",
  });

const swapHarness = (over: { chains?: readonly RelaySource[]; deps?: Partial<FundDeps> } = {}) => {
  const swapQuote = swapQuoted();
  const created = { id: "11111111-1111-4111-8111-111111111111" };
  const create = vi.fn().mockResolvedValue(created);
  const h = harness({
    chains: over.chains ?? [SOLANA],
    deps: {
      relay: {
        chains: vi.fn().mockResolvedValue(over.chains ?? [SOLANA]),
        depositAddressQuote: vi.fn(),
        swapQuote,
        status: vi.fn(),
      },
      store: store({ create }),
      solana: solana(),
      ...over.deps,
    },
  });
  return { ...h, swapQuote, create, intentId: created.id };
};

const postSwap = (app: Hono, body: unknown) =>
  app.request("/v1/money/fund/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("fundRoutes · swap", () => {
  const good = {
    chainId: 792703809,
    currency: "Es9vMFrz",
    amountRaw: "10000000",
    from: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  };

  it("quotes to the session's wallet, whatever the body says", async () => {
    const { app, swapQuote } = swapHarness();

    await postSwap(app, { ...good, recipient: "AttackerWallet" });

    expect(swapQuote.mock.calls[0]![0]).toMatchObject({
      recipient: "PrivyWallet111",
      user: good.from,
    });
  });

  it("returns a transaction and the intent that goes with it", async () => {
    const { app, intentId } = swapHarness();

    const body = (await (await postSwap(app, good)).json()) as Record<string, unknown>;

    expect(body["intentId"]).toBe(intentId);
    expect(typeof body["transaction"]).toBe("string");
    expect(body["out"]).toMatchObject({ amountFormatted: "9.990651", symbol: "USDC" });
  });

  it("records the intent with no deposit address", async () => {
    const { app, create } = swapHarness();

    await postSwap(app, good);

    const row = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({ relayRequestId: "0xswap", recipientAddress: "PrivyWallet111" });
    expect(row["depositAddress"]).toBeUndefined();
  });

  it("refuses a chain this server cannot compose for, naming the alternative", async () => {
    /* Relay answers an EVM origin with calldata and Bitcoin with a PSBT. */
    const { app, swapQuote } = swapHarness({ chains: [BASE] });

    const res = await postSwap(app, { ...good, chainId: 8453, currency: "0x0" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/deposit address/i);
    expect(swapQuote).not.toHaveBeenCalled();
  });

  it("refuses a malformed sender address", async () => {
    const { app } = swapHarness();
    expect((await postSwap(app, { ...good, from: "not a solana address at all!!" })).status).toBe(400);
  });

  it("refuses a zero or non-numeric amount", async () => {
    const { app } = swapHarness();
    expect((await postSwap(app, { ...good, amountRaw: "0" })).status).toBe(400);
    expect((await postSwap(app, { ...good, amountRaw: "ten" })).status).toBe(400);
  });

  it("refuses a lookup table it could not read rather than composing an oversized message", async () => {
    const { app } = swapHarness({
      deps: {
        relay: {
          chains: vi.fn().mockResolvedValue([SOLANA]),
          depositAddressQuote: vi.fn(),
          swapQuote: vi.fn().mockResolvedValue({
            requestId: "0xswap",
            instructions: [SOLANA_IX],
            lookupTables: ["SomeTableAddress1111111111111111111111111"],
            inFormatted: "10.0",
            outRaw: "1",
            outFormatted: "0.000001",
            impactPct: null,
            vmType: "svm",
          }),
          status: vi.fn(),
        },
        solana: solana({ lookups: { read: vi.fn().mockResolvedValue(new Map()) } }),
      },
    });

    expect((await postSwap(app, good)).status).toBe(503);
  });

  it("is unavailable when the chain port is not configured", async () => {
    const { app } = harness({ chains: [SOLANA] });
    expect((await postSwap(app, good)).status).toBe(503);
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({ chains: [SOLANA], deps: { solana: solana() } }, null);
    expect((await postSwap(app, good)).status).toBe(401);
  });
});

describe("fundRoutes · confirm", () => {
  const INTENT = { id: "11111111-1111-4111-8111-111111111111", userId: "user-1", status: "waiting" };
  const post = (app: Hono, body: unknown) =>
    app.request("/v1/money/fund/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const confirmHarness = (landed: boolean | null) => {
    const settleById = vi.fn().mockResolvedValue({ ...INTENT, status: landed ? "success" : "failure" });
    const h = harness({
      chains: [SOLANA],
      deps: {
        store: store({ byId: vi.fn().mockResolvedValue(INTENT), settleById }),
        solana: solana({ landed: vi.fn().mockResolvedValue(landed) }),
      },
    });
    return { ...h, settleById };
  };

  it("settles a landed transaction as success", async () => {
    const { app, settleById } = confirmHarness(true);

    const res = await post(app, { intentId: INTENT.id, signature: "s".repeat(88) });

    expect(await res.json()).toEqual({ status: "success" });
    expect(settleById.mock.calls[0]![2]).toMatchObject({ status: "success", outTxHash: "s".repeat(88) });
  });

  it("settles a failed transaction as failure, with no out hash", async () => {
    const { app, settleById } = confirmHarness(false);

    await post(app, { intentId: INTENT.id, signature: "s".repeat(88) });

    const patch = settleById.mock.calls[0]![2] as Record<string, unknown>;
    expect(patch["status"]).toBe("failure");
    expect(patch["outTxHash"]).toBeUndefined();
    expect(patch["failReason"]).toBe("TRANSACTION_FAILED");
  });

  it("answers retryable when the node has not seen it yet", async () => {
    const { app, settleById } = confirmHarness(null);

    const res = await post(app, { intentId: INTENT.id, signature: "s".repeat(88) });

    /* Not seen is a different answer from failed, and worth asking again. */
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/transaction_pending/);
    expect(settleById).not.toHaveBeenCalled();
  });

  it("refuses an intent that is not this user's", async () => {
    const { app } = harness({
      chains: [SOLANA],
      deps: { store: store({ byId: vi.fn().mockResolvedValue(null) }), solana: solana() },
    });

    expect((await post(app, { intentId: INTENT.id, signature: "s".repeat(88) })).status).toBe(404);
  });

  it("refuses a body that is not an intent id and a signature", async () => {
    const { app } = confirmHarness(true);
    expect((await post(app, { intentId: "nope", signature: "x" })).status).toBe(400);
  });
});
