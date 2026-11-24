import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  type Blockhash,
} from "@solana/kit";
import { D } from "@mercury/core";
import type { OwnedTokenAccount, TokenBalance } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { inMemoryBuilds } from "../relay/builds.js";
import { decodeSponsored } from "../relay/decode.js";
import { validateSponsored } from "../relay/validate.js";
import type { Acting } from "../wallets/acting.js";
import { actingAs, actingLinked } from "../wallets/testing.js";
import type { BuiltMove } from "../moves/sends.js";
import { moveRoutes, type MoveDeps } from "./move.js";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SOL = "So11111111111111111111111111111111111111112";
const STARTED = new Date("2026-11-20T10:00:00.000Z");

type Body = {
  transactions: { transaction: string; moved: { mint: string; amountRaw: string }[] }[];
  feeUsd: string;
  rentUsd: string;
  coveredByMercury: boolean;
  error: { code: string; message: string };
  mint?: string;
};

/** A person with a Mercury wallet and a linked Phantom, both real keys, and a relayer that is one too. */
const world = async (
  over: { owned?: OwnedTokenAccount[]; mercuryHolds?: string[]; solPrice?: string } = {},
) => {
  const [phantom, mercury, relayer, nvdaAccount, usdcAccount] = await Promise.all(
    Array.from({ length: 5 }, () => generateKeyPairSigner()),
  );
  const owned = over.owned ?? [
    {
      address: nvdaAccount!.address,
      mint: NVDAX,
      programId: TOKEN_2022,
      rawAmount: 150_000_000n,
      decimals: 8,
    },
    { address: usdcAccount!.address, mint: USDC, programId: TOKEN, rawAmount: 20_000_000n, decimals: 6 },
  ];
  const builds = inMemoryBuilds();
  const remembered: { bytes: Uint8Array; move: BuiltMove }[] = [];
  const prices = {
    pricesFor: async () => new Map([[SOL, { usdPricePerToken: D(over.solPrice ?? "200") }]]),
  } as unknown as PriceBoard;
  const deps: MoveDeps = {
    chain: {
      tokenBalances: async () =>
        (over.mercuryHolds ?? []).map(
          (mint) => ({ mint, rawAmount: 1n, decimals: 6 }) as unknown as TokenBalance,
        ),
      rentExemption: async (bytes) => BigInt(128 + bytes) * 6_960n,
    },
    history: { ownedTokenAccounts: async () => owned },
    prices,
    usdcMint: USDC,
    listed: async () =>
      new Map([
        [USDC, { symbol: "USDC", ticker: null, name: "US dollars" }],
        [NVDAX, { symbol: "NVDAx", ticker: "NVDA", name: "Nvidia" }],
      ]),
    mercuryWalletId: async () => "w-mercury",
    latestBlockhash: async () => ({
      blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" as Blockhash,
      lastValidBlockHeight: 100n,
    }),
    relay: { relayer: relayer!.address, builds },
    sends: { remember: (bytes, move) => remembered.push({ bytes, move }) },
    now: () => STARTED,
  };
  const PHANTOM = actingLinked(phantom!.address, { id: "w-phantom", label: "Phantom" });
  const MERCURY = actingAs(mercury!.address, { id: "w-mercury" });
  return {
    phantom: phantom!,
    mercury: mercury!,
    relayer: relayer!,
    builds,
    remembered,
    deps,
    PHANTOM,
    MERCURY,
  };
};

type World = Awaited<ReturnType<typeof world>>;

const appWith = (
  w: World,
  deps: MoveDeps = w.deps,
  acting: Acting = { all: false, wallets: [w.PHANTOM] },
) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: w.mercury.address });
    c.set("acting", acting);
    await next();
  });
  app.route("/", moveRoutes(deps));
  return app;
};

const prepare = async (app: Hono, body: unknown = {}) => {
  const res = await app.request("/v1/move/prepare", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return { status: res.status, body: (await res.json()) as Body };
};

describe("GET /v1/move/tokens", () => {
  const list = async (app: Hono) => {
    const res = await app.request("/v1/move/tokens");
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("lists what the linked wallet can move, named, with a token in two accounts added up", async () => {
    const w = await world({
      owned: [
        { address: "a1", mint: NVDAX, programId: TOKEN_2022, rawAmount: 100_000_000n, decimals: 8 },
        { address: "a2", mint: NVDAX, programId: TOKEN_2022, rawAmount: 50_000_000n, decimals: 8 },
        { address: "a3", mint: USDC, programId: TOKEN, rawAmount: 20_000_000n, decimals: 6 },
        { address: "a4", mint: "Bonk", programId: TOKEN, rawAmount: 9n, decimals: 5 },
        { address: "a5", mint: USDC, programId: TOKEN, rawAmount: 0n, decimals: 6 },
      ],
    });
    expect(await list(appWith(w))).toEqual({
      status: 200,
      body: {
        available: true,
        tokens: [
          {
            mint: NVDAX,
            symbol: "NVDAx",
            ticker: "NVDA",
            name: "Nvidia",
            decimals: 8,
            amountRaw: "150000000",
            amount: "1.5",
          },
          {
            mint: USDC,
            symbol: "USDC",
            ticker: null,
            name: "US dollars",
            decimals: 6,
            amountRaw: "20000000",
            amount: "20",
          },
        ],
      },
    });
  });

  it("says moving isn't available without a relayer, rather than offering it", async () => {
    const w = await world();
    const { relay: _relay, ...unsponsored } = w.deps;
    expect((await list(appWith(w, unsponsored))).body).toEqual({ available: false, tokens: [] });
  });

  it("is only for a linked wallet", async () => {
    const w = await world();
    const { status } = await list(appWith(w, w.deps, { all: false, wallets: [w.MERCURY] }));
    expect(status).toBe(400);
  });
});

describe("POST /v1/move/prepare", () => {
  it("builds the move for the linked wallet to sign, which the relayer will then co-sign", async () => {
    const w = await world();
    const { status, body } = await prepare(appWith(w));
    expect(status).toBe(200);
    expect(body.transactions).toHaveLength(1);
    for (const t of body.transactions) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(t.transaction));
      // Remembered, so the relayer recognises it; the relayer signs nothing it did not build.
      expect(w.builds.recognises(tx.messageBytes as unknown as Uint8Array)).toBe(true);
      const signed = getBase64EncodedWireTransaction(await partiallySignTransaction([w.phantom.keyPair], tx));
      const d = decodeSponsored(signed);
      if (!d.ok) throw new Error(d.message);
      expect(validateSponsored(d.tx, w.phantom.address, { relayer: w.relayer.address })).toEqual({
        ok: true,
      });
    }
  });

  it("says what it costs: the rent of the Mercury wallet's new accounts, taken from the USDC moving", async () => {
    // Rent (128 + 179) and (128 + 165) bytes at 6,960 lamports, $200 a SOL: $0.4273 + $0.4079, charged as $0.84.
    const w = await world();
    const { body } = await prepare(appWith(w));
    expect(body.rentUsd).toBe("0.84");
    expect(body.feeUsd).toBe("0.84");
    expect(body.coveredByMercury).toBe(false);
    expect(body.transactions[0]!.moved).toEqual([
      { mint: NVDAX, amountRaw: "150000000" },
      { mint: USDC, amountRaw: "19160000" },
    ]);
  });

  it("has Mercury cover the rent when no USDC moves, and says so", async () => {
    const w = await world();
    const { body } = await prepare(appWith(w), { tokens: [{ mint: NVDAX, amountRaw: "50000000" }] });
    expect(body.feeUsd).toBe("0");
    expect(body.rentUsd).toBe("0.43");
    expect(body.coveredByMercury).toBe(true);
    expect(body.transactions[0]!.moved).toEqual([{ mint: NVDAX, amountRaw: "50000000" }]);
  });

  it("costs nothing when the Mercury wallet already has every account", async () => {
    const w = await world({ mercuryHolds: [USDC, NVDAX] });
    const { body } = await prepare(appWith(w));
    expect([body.feeUsd, body.rentUsd, body.coveredByMercury]).toEqual(["0", "0", false]);
  });

  it("remembers each transaction as a move from the linked wallet into the Mercury one, to record when it lands", async () => {
    const w = await world();
    await prepare(appWith(w));
    expect(w.remembered.map((r) => r.move)).toEqual([
      {
        userId: "user-1",
        fromWalletId: "w-phantom",
        toWalletId: "w-mercury",
        startedAt: STARTED,
        moved: [
          { mint: NVDAX, amountRaw: 150_000_000n },
          { mint: USDC, amountRaw: 19_160_000n },
        ],
      },
    ]);
  });

  it("refuses to move from the Mercury wallet into itself", async () => {
    const w = await world();
    const { status, body } = await prepare(appWith(w, w.deps, { all: false, wallets: [w.MERCURY] }));
    expect([status, body.error.code]).toEqual([400, "wallet_mercury"]);
    expect(w.remembered).toEqual([]);
  });

  it("refuses a token the wallet doesn't hold, or more than it holds, naming it", async () => {
    const w = await world();
    const app = appWith(w);
    const missing = await prepare(app, { tokens: [{ mint: "Other", amountRaw: "1" }] });
    expect([missing.status, missing.body.error.code, missing.body.mint]).toEqual([400, "not_held", "Other"]);
    const tooMuch = await prepare(app, { tokens: [{ mint: NVDAX, amountRaw: "150000001" }] });
    expect([tooMuch.status, tooMuch.body.error.code]).toEqual([400, "too_much"]);
  });

  it("says when there is nothing to move", async () => {
    const w = await world({ owned: [] });
    const { status, body } = await prepare(appWith(w));
    expect([status, body.error.code]).toEqual([400, "nothing_to_move"]);
  });

  it("refuses an amount that isn't a whole number of the smallest unit", async () => {
    const w = await world();
    const { status, body } = await prepare(appWith(w), { tokens: [{ mint: NVDAX, amountRaw: "1.5" }] });
    expect([status, body.error.code]).toEqual([400, "bad_request"]);
  });

  it("isn't offered without a relayer to pay for it", async () => {
    const w = await world();
    const { relay: _relay, ...unsponsored } = w.deps;
    const { status, body } = await prepare(appWith(w, unsponsored));
    expect([status, body.error.code]).toEqual([503, "move_unavailable"]);
  });

  it("waits for the Mercury wallet when it is still being made", async () => {
    const w = await world();
    const { status, body } = await prepare(appWith(w, { ...w.deps, mercuryWalletId: async () => null }));
    expect([status, body.error.code]).toEqual([409, "wallet_pending"]);
  });
});
