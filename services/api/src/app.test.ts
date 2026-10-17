import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalance } from "@mercury/chain";
import { createApp } from "./app.js";
import { testDb } from "./db/testing.js";
import { memoryOrderStore } from "./orders/memory.js";
import { inMemoryBuilds } from "./relay/builds.js";
import type { AuthDeps } from "./auth/middleware.js";
import type { Deps, ReadDeps } from "./deps.js";

const WALLET = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const SOL = "So11111111111111111111111111111111111111112";
const XSC9 = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

/** A dollar a share, so the dollars and the shares in a test are told apart by size. */
const FAIR = 100;

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

/*
 * The one RPC call a build makes that nothing else stands in for: a recent
 * blockhash. Answered locally, so the transaction is really composed and the
 * charge inside it can be read back.
 */
let rpcUrl = "";
const rpc = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk: Buffer) => (body += chunk.toString()));
  req.on("end", () => {
    const { id } = JSON.parse(body) as { id: unknown };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          context: { slot: 1 },
          value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100 },
        },
      }),
    );
  });
});
beforeAll(async () => {
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  rpcUrl = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => rpc.close(() => resolve())));

/** The USDC the built transaction moves to the relayer, in base units: the SPL transfer's amount. */
const chargedIn = (wire: string): bigint => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const m = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const transfer = m.instructions.find((i) => m.staticAccounts[i.programAddressIndex] === TOKEN_PROGRAM);
  const data = transfer?.data ?? new Uint8Array();
  expect(data[0]).toBe(3);
  let n = 0n;
  for (let i = data.length - 1; i >= 1; i--) n = (n << 8n) | BigInt(data[i] ?? 0);
  return n;
};

const held = (mint: string, whole: string, decimals: number): TokenBalance => ({
  mint,
  rawAmount: BigInt(D(whole).mul(D(10).pow(decimals)).toFixed(0)),
  decimals,
});

/**
 * The whole app, over a real in-process Postgres, with every adapter answering
 * from a literal — and recording what it was asked. The recordings are the
 * point: which mint the fee was quoted against, and how many times the order
 * was priced, are the two things that differ by side and the two that nothing
 * below the route can observe.
 */
const harness = async (
  over: { balances?: TokenBalance[]; sponsored?: boolean; tradingFeeBps?: number; referredAt?: Date } = {},
) => {
  const db = await testDb();
  const priced: string[] = [];
  /* What each quote was for, in the units the side trades: dollars on a buy. */
  const amounts: string[] = [];

  const market = {
    registry: {
      wrappersFor: async () => [{ mint: XSC9, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
      byMint: async () => null,
    },
    reference: {
      priceFor: async () => ({
        pricePerShare: D(FAIR),
        observedAt: new Date(),
        pendingDividendNet: D(0),
      }),
    },
    sessions: { current: async () => ({ status: "open", isOpen: true, nextOpenAt: null }) },
    multipliers: {
      multiplierFor: async () => D(1),
      multipliersFor: async (mints: readonly string[]) => new Map(mints.map((m) => [m, D(1)])),
      isPaused: async () => false,
    },
    quotes: {
      quote: async (req: { side: string; amount: { toFixed(): string } }) => {
        priced.push(req.side);
        amounts.push(req.amount.toFixed());
        const amount = D(req.amount.toFixed());
        return {
          inAmount: amount,
          outAmount: req.side === "buy" ? amount.div(FAIR) : amount.mul(FAIR),
          minOutAmount: (req.side === "buy" ? amount.div(FAIR) : amount.mul(FAIR)).mul(D("0.995")),
          priceImpact: D("0.0001"),
          routeLabels: ["Raydium"],
          quoteId: "q:1",
          expiresAt: new Date(Date.now() + 20_000),
          raw: {},
        };
      },
      /* A swap with nothing in it: the charge beside it is what these tests read. */
      buildSwapInstructions: async () => ({
        computeBudget: [],
        setup: [],
        swap: { programId: JUPITER, accounts: [], data: "" },
        cleanup: null,
        lookupTables: [],
      }),
    },
    chain: {
      tokenBalances: async (_owner: string) => over.balances ?? [held(XSC9, "10", 8)],
    },
    prices: {
      pricesFor: async () =>
        new Map([
          [
            SOL,
            {
              mint: SOL,
              usdPricePerToken: D("119.39"),
              pricePerShare: null,
              changePct24h: null,
              liquidityUsd: D(0),
              multiplier: D(1),
              observedAt: new Date(),
            },
          ],
        ]),
    },
  } as unknown as Deps;

  const read = {
    tradingFeeBps: over.tradingFeeBps ?? 50,
    orders: memoryOrderStore(),
    send: {
      rpcUrl,
      ...(over.sponsored === false
        ? {}
        : {
            relay: {
              signer: {
                address: "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ",
                cosign: async (b: string) => b,
              },
              builds: inMemoryBuilds(),
            },
          }),
    },
    instruments: {},
    portfolio: {},
    money: {},
    activity: {},
    fills: {},
    borrow: {},
    ...(over.referredAt === undefined
      ? {}
      : { referrals: { store: { referredAt: async () => over.referredAt ?? null } } }),
  } as unknown as ReadDeps;

  const auth = {
    db,
    verifier: { verify: async () => ({ privyUserId: "did:privy:1" }) },
    directory: { read: async () => ({ privyUserId: "did:privy:1", solanaAddress: WALLET }) },
  } as unknown as AuthDeps;

  const app = createApp(() => market, auth, read);
  const headers = {
    authorization: "Bearer access",
    "x-privy-identity-token": "identity",
    "content-type": "application/json",
  };
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  const get = (path: string) => app.request(path, { headers });

  return { post, get, priced, amounts };
};

describe("POST /v1/quote, selling", () => {
  it("reports proceeds rather than investable", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { investable: string | null; proceeds: string | null };
    expect(body.investable).toBeNull();
    expect(body.proceeds).not.toBeNull();
  });

  it("takes the fee out of the proceeds, not out of the shares", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { proceeds: string; fee: { usdc: string } };
    // Five shares at $100 gross; what lands is that less the charge.
    expect(D(body.proceeds).add(D(body.fee.usdc)).toFixed(2)).toBe("500.00");
  });

  /*
   * The fee's own value is the tell, and the only one visible from outside.
   * These balances hold the stock and no USDC, so rent is owed on the USDC
   * account and the charge is $0.18. Had the fee been quoted against the stock
   * — which is held — it would have come back $0.01, the signature alone.
   */
  it("quotes the fee against USDC, which the seller may have no account for", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { fee: { network: string } };
    expect(body.fee.network).toBe("0.18");
  });

  it("charges only the signature once that USDC account exists", async () => {
    const { post } = await harness({ balances: [held(XSC9, "10", 8), held(USDC_MINT, "1", 6)] });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { fee: { network: string } };
    expect(body.fee.network).toBe("0.01");
  });

  /*
   * On what the shares fetch, not on what lands: five shares at $100 is $500
   * gross, so 0.5% of it is $2.50, and the $0.18 network cost comes off too.
   */
  it("charges Mercury's fee on what the shares fetch, and takes it from the proceeds", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as {
      proceeds: string;
      fee: { usdc: string; network: string; mercury: string; mercuryBps: number };
    };
    expect(body.fee).toMatchObject({ network: "0.18", mercury: "2.5", mercuryBps: 50, usdc: "2.68" });
    expect(body.proceeds).toBe("497.32");
  });

  it("prices once, where a buy prices twice", async () => {
    const { post, priced } = await harness();
    await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    expect(priced).toEqual(["sell"]);
  });

  it("refuses a sell from a wallet holding none of the stock", async () => {
    const { post } = await harness({ balances: [] });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { decision: { kind: string; detail?: string } };
    expect(body.decision.kind).toBe("refuse");
    expect(body.decision.detail).toContain("do not hold this stock");
  });
});

describe("POST /v1/quote, buying", () => {
  it("still reports investable, and no proceeds", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as { investable: string | null; proceeds: string | null };
    expect(body.investable).not.toBeNull();
    expect(body.proceeds).toBeNull();
  });

  it("still prices twice, to quote the swap for what is left after the charge", async () => {
    const { post, priced } = await harness();
    await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    expect(priced).toEqual(["buy", "buy"]);
  });

  /*
   * The deck's confirm screen, to the cent: $500 of Nvidia, $2.50 to Mercury,
   * $0.01 to the network — this wallet already holds the stock, so no rent —
   * and $497.49 of it buys shares.
   */
  it("takes Mercury's fee out of the amount, beside the network cost", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as {
      investable: string;
      fee: { usdc: string; network: string; mercury: string; mercuryBps: number };
    };
    expect(body.fee).toMatchObject({ network: "0.01", mercury: "2.5", mercuryBps: 50, usdc: "2.51" });
    expect(body.investable).toBe("497.49");
  });

  /* Quoting the gross would put a share count on screen that the fill cannot deliver. */
  it("quotes the swap for what is left after both fees", async () => {
    const { post, amounts } = await harness();
    await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    expect(amounts.at(-1)).toBe("497.49");
  });

  it("charges the rate the deployment is configured with", async () => {
    const { post } = await harness({ tradingFeeBps: 35 });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as { fee: { mercury: string; mercuryBps: number } };
    expect(body.fee).toMatchObject({ mercury: "1.75", mercuryBps: 35 });
  });
});

describe("POST /v1/orders", () => {
  const create = async (body: unknown) => {
    const h = await harness();
    const { orderId } = (await (await h.post("/v1/orders", body)).json()) as { orderId: string };
    return (await (await h.get(`/v1/orders/${orderId}`)).json()) as {
      max: boolean;
      usdAmount: string;
    };
  };

  /*
   * Execute re-prices from the row. A max sell whose row forgot it was one
   * would re-quote in dollars and leave behind exactly the dust that max
   * exists to sweep.
   */
  it("keeps max on the row", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500", max: true })).max).toBe(true);
  });

  it("defaults max to false when it is not asked for", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500" })).max).toBe(false);
  });

  /* In dollars, not the shares the decision reports, for the same reason. */
  it("keeps the dollars that were asked for", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500" })).usdAmount).toBe("500");
  });
});

describe("GET /f/:slug", () => {
  /*
   * The waitlist is gone, but its share links are still in people's posts on
   * X. Each one sends a reader on to the site rather than to an error page.
   */
  it("sends a founding card's old share link on to the site, with the card's code", async () => {
    const { get } = await harness();
    const res = await get("/f/3kQ9xZ1bTq7w");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://trymercury.xyz/?ref=3kQ9xZ1bTq7w");
  });

  it("sends anything that is not a code on to the site bare", async () => {
    const { get } = await harness();
    const res = await get("/f/x");
    expect(res.headers.get("location")).toBe("https://trymercury.xyz");
  });
});

describe("POST /v1/orders/:id/execute", () => {
  const execute = async (h: Awaited<ReturnType<typeof harness>>, body: unknown) => {
    const { orderId } = (await (await h.post("/v1/orders", body)).json()) as { orderId: string };
    return h.post(`/v1/orders/${orderId}/execute`, {});
  };

  /*
   * Without a relayer there is no transfer to carry Mercury's fee, so the
   * trade would fill for nothing. Decided on 15 October 2026: refuse instead.
   */
  it("refuses to build a trade when there is no relayer to carry the fee", async () => {
    const h = await harness({ sponsored: false });
    const res = await execute(h, { ticker: "NVDA", side: "buy", amount: "500" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("upstream_unavailable");
  });

  /* $2.50 to Mercury and $0.01 to the network, one transfer: 2,510,000 USDC base units. */
  it("charges a buyer both fees in the one transfer it builds", async () => {
    const h = await harness();
    const res = await execute(h, { ticker: "NVDA", side: "buy", amount: "500" });
    expect(res.status).toBe(200);
    const { transactions } = (await res.json()) as { transactions: string[] };
    expect(chargedIn(transactions[0]!)).toBe(2_510_000n);
  });

  /* The relayer's account mixes revenue with repaid gas; the order row is what tells them apart. */
  it("records Mercury's fee on the order it builds", async () => {
    const h = await harness();
    const { orderId } = (await (
      await h.post("/v1/orders", { ticker: "NVDA", side: "buy", amount: "500" })
    ).json()) as { orderId: string };
    await h.post(`/v1/orders/${orderId}/execute`, {});
    const order = (await (await h.get(`/v1/orders/${orderId}`)).json()) as { mercuryFeeUsd: string | null };
    expect(order.mercuryFeeUsd).toBe("2.5");
  });

  it("swaps what is left of a buy after both fees", async () => {
    const h = await harness();
    await execute(h, { ticker: "NVDA", side: "buy", amount: "500" });
    expect(h.amounts.at(-1)).toBe("497.49");
  });

  /* $500 of shares sold: $2.50 to Mercury, and $0.18 because this seller has no USDC account yet. */
  it("charges a seller both fees out of the proceeds", async () => {
    const h = await harness();
    const res = await execute(h, { ticker: "NVDA", side: "sell", amount: "500" });
    expect(res.status).toBe(200);
    const { transactions } = (await res.json()) as { transactions: string[] };
    expect(chargedIn(transactions[0]!)).toBe(2_680_000n);
  });

  /*
   * Thirty cents of shares at a 50% rate owes $0.15 to Mercury and $0.18 to the
   * network. The network cost alone fits; both do not, and a transfer of
   * dollars the swap never produced fails and takes the swap down with it.
   */
  it("refuses a sell whose proceeds cannot cover both fees", async () => {
    const h = await harness({ tradingFeeBps: 5_000 });
    const res = await execute(h, { ticker: "NVDA", side: "sell", amount: "0.30" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("$0.33");
  });
});

/*
 * A quarter off 0.5% is 0.375%. On $500 that is $1.875, floored to the cent
 * like every Mercury fee: $1.87.
 */
describe("an invited friend's fee", () => {
  const DAY = 86_400_000;

  it("quotes a quarter off for their first 90 days, and says so", async () => {
    const { post } = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as {
      fee: {
        mercury: string;
        mercuryBps: number;
        network: string;
        discount?: { pct: number; until: string };
      };
    };
    expect(body.fee).toMatchObject({
      mercury: "1.87",
      mercuryBps: 37.5,
      network: "0.01",
      discount: { pct: 25 },
    });
  });

  it("quotes the full rate once the 90 days are up", async () => {
    const { post } = await harness({ referredAt: new Date(Date.now() - 91 * DAY) });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as { fee: { mercury: string; discount?: unknown } };
    expect(body.fee.mercury).toBe("2.5");
    expect(body.fee.discount).toBeUndefined();
  });

  it("records the discounted fee on the order it executes", async () => {
    const h = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const { orderId } = (await (
      await h.post("/v1/orders", { ticker: "NVDA", side: "buy", amount: "500" })
    ).json()) as { orderId: string };
    await h.post(`/v1/orders/${orderId}/execute`, {});
    const order = (await (await h.get(`/v1/orders/${orderId}`)).json()) as { mercuryFeeUsd: string | null };
    expect(order.mercuryFeeUsd).toBe("1.87");
  });

  /*
   * Five shares at $100 is $500 gross, the same figure the full-rate sell above
   * is charged on: 0.375% of it is $1.875, floored to $1.87. The network cost is
   * the $0.18 of a seller with no USDC account yet, and the discount does not
   * touch it.
   */
  it("quotes a sale a quarter off too, on the proceeds, with the network fee unchanged", async () => {
    const { post } = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as {
      proceeds: string;
      fee: {
        usdc: string;
        mercury: string;
        mercuryBps: number;
        network: string;
        discount?: { pct: number; until: string };
      };
    };
    expect(body.fee).toMatchObject({
      mercury: "1.87",
      mercuryBps: 37.5,
      network: "0.18",
      usdc: "2.05",
      discount: { pct: 25 },
    });
    expect(body.proceeds).toBe("497.95");
  });

  it("records the discounted fee on the sell order it executes", async () => {
    const h = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const { orderId } = (await (
      await h.post("/v1/orders", { ticker: "NVDA", side: "sell", amount: "500" })
    ).json()) as { orderId: string };
    const res = await h.post(`/v1/orders/${orderId}/execute`, {});
    expect(res.status).toBe(200);
    const order = (await (await h.get(`/v1/orders/${orderId}`)).json()) as { mercuryFeeUsd: string | null };
    expect(order.mercuryFeeUsd).toBe("1.87");
  });
});
