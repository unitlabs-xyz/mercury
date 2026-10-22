import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
  AccountRole,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
} from "@solana/kit";
import { sendRoutes } from "./send.js";
import type { SendDeps } from "./send.js";
import { inMemoryBuilds } from "../relay/builds.js";
import { getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { D } from "@mercury/core";
import { USDC_MINT } from "@mercury/chain";

const lifetime = { blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 1n };

/** A transaction that does nothing, fee-paid and optionally signed by `payer`. */
const txFrom = async (sign: boolean) => {
  const payer = await generateKeyPairSigner();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions([], m),
  );
  const tx = sign ? await signTransactionMessageWithSigners(message) : compileTransaction(message);
  return { wallet: payer.address as string, wire: getBase64EncodedWireTransaction(tx) };
};

// No request reaches the network in these tests: every one is refused before sending.
const app = (walletAddress: string | null, relay?: SendDeps["relay"]) => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  a.route("/", sendRoutes({ rpcUrl: "http://127.0.0.1:1", ...(relay ? { relay } : {}) }));
  return a;
};

const post = (walletAddress: string | null, transaction: string, relay?: SendDeps["relay"]) =>
  app(walletAddress, relay).request("/v1/transactions/send", {
    method: "POST",
    body: JSON.stringify({ transaction }),
    headers: { "content-type": "application/json" },
  });

/**
 * A sponsored transaction: the relayer pays, the buyer is a required signer,
 * and only the buyer has signed. This is the state one reaches the route in.
 */
const sponsored = async (opts: { buyerSigns: boolean }) => {
  const relayer = await generateKeyPairSigner();
  const buyer = await generateKeyPairSigner();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(relayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          {
            programAddress: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as never,
            accounts: [{ address: buyer.address, role: AccountRole.READONLY_SIGNER }],
            data: new Uint8Array([1]),
          },
        ],
        m,
      ),
  );
  const compiled = compileTransaction(message);
  const tx = opts.buyerSigns ? await partiallySignTransaction([buyer.keyPair], compiled) : compiled;
  return {
    relayerAddress: relayer.address as string,
    buyer: buyer.address as string,
    wire: getBase64EncodedWireTransaction(tx),
  };
};

/**
 * A relayer that records whether its key was used, without needing a real one.
 *
 * `remember` takes the wire the server would have handed the buyer, because
 * the route co-signs only messages it composed.
 */
const fakeRelay = (address: string, remember?: string) => {
  const builds = inMemoryBuilds();
  if (remember !== undefined) {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(remember));
    builds.remember(tx.messageBytes as unknown as Uint8Array);
  }
  const signer = {
    address,
    used: false,
    cosign: async (b64: string) => {
      signer.used = true;
      return b64;
    },
  };
  return {
    signer,
    builds,
    get used() {
      return signer.used;
    },
  };
};

describe("POST /v1/transactions/send", () => {
  it("refuses a transaction whose fee payer is someone else's wallet", async () => {
    const { wire } = await txFrom(true);
    const other = await generateKeyPairSigner();
    const res = await post(other.address, wire);
    expect(res.status).toBe(403);
  });

  it("refuses a transaction nobody signed", async () => {
    const { wallet, wire } = await txFrom(false);
    const res = await post(wallet, wire);
    expect(res.status).toBe(400);
  });

  it("refuses bytes that are not a transaction", async () => {
    const res = await post("WaLLeT", "bm90IGEgdHJhbnNhY3Rpb24=");
    expect(res.status).toBe(400);
  });

  it("needs a wallet on the session", async () => {
    const { wire } = await txFrom(true);
    const res = await post(null, wire);
    expect(res.status).toBe(401);
  });

  /*
   * Sponsorship. The relayer pays, so everything is checked against the wallet
   * Privy signed for before the key is touched.
   */
  it("co-signs a sponsored transaction the buyer has signed", async () => {
    const { relayerAddress, buyer, wire } = await sponsored({ buyerSigns: true });
    const relay = fakeRelay(relayerAddress, wire);
    // Reaches the network and fails there, which is past every check.
    const res = await post(buyer, wire, relay);
    expect(relay.used).toBe(true);
    expect(res.status).not.toBe(403);
  });

  /*
   * The case a valid session cannot catch on its own: a real account, and
   * somebody else's transaction. Without this, anyone with a Privy login
   * could have the relayer pay for a stranger's swap.
   */
  it("refuses to pay for a transaction that is not the caller's, and does not touch the key", async () => {
    const { relayerAddress, wire } = await sponsored({ buyerSigns: true });
    const stranger = (await generateKeyPairSigner()).address as string;
    const relay = fakeRelay(relayerAddress, wire);
    const res = await post(stranger, wire, relay);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_your_transaction");
    expect(relay.used).toBe(false);
  });

  it("will not sign before the buyer has", async () => {
    const { relayerAddress, buyer, wire } = await sponsored({ buyerSigns: false });
    const relay = fakeRelay(relayerAddress, wire);
    const res = await post(buyer, wire, relay);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_signed");
    expect(relay.used).toBe(false);
  });

  /* No relayer configured is the shipped default, and must stay a refusal. */
  it("refuses a sponsored transaction when no relayer is configured", async () => {
    const { buyer, wire } = await sponsored({ buyerSigns: true });
    const res = await post(buyer, wire);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("forbidden");
  });

  /*
   * The check that makes the network charge unforgeable. A transaction the
   * buyer built themselves is refused however well-formed it is, because the
   * fee lives in bytes this server did not produce.
   */
  it("refuses a sponsored transaction it did not compose, and does not touch the key", async () => {
    const { relayerAddress, buyer, wire } = await sponsored({ buyerSigns: true });
    const relay = fakeRelay(relayerAddress); // remembers nothing
    const res = await post(buyer, wire, relay);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_our_build");
    expect(relay.used).toBe(false);
  });
});

describe("POST /v1/money/send/prepare", () => {
  const prepare = (walletAddress: string | null, amount: string, to: string) =>
    app(walletAddress).request("/v1/money/send/prepare", {
      method: "POST",
      body: JSON.stringify({ amount, to }),
      headers: { "content-type": "application/json" },
    });

  it("requires an authenticated wallet", async () => {
    expect((await prepare(null, "20", "11111111111111111111111111111111")).status).toBe(401);
  });

  it("rejects over-precise and zero USDC amounts before touching RPC", async () => {
    expect((await prepare("wallet", "1.0000001", "11111111111111111111111111111111")).status).toBe(400);
    expect((await prepare("wallet", "0", "11111111111111111111111111111111")).status).toBe(400);
  });

  it("rejects invalid and self destinations before touching RPC", async () => {
    const wallet = (await txFrom(false)).wallet;
    expect((await prepare(wallet, "1", "not-a-solana-address")).status).toBe(400);
    expect((await prepare(wallet, "1", wallet)).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */

const RELAYER_ADDRESS = "Xs7ZdzSHLU9GLSSPoSZuMkQ8GHjNKz1F8gUQRA2ZfZ7";
const RECIPIENT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const SOL_MINT = "So11111111111111111111111111111111111111112";

/** A relayer that would co-sign, which is all the quote route reads of it. */
const stubRelay = (): SendDeps["relay"] => ({
  signer: { address: RELAYER_ADDRESS, cosign: async (wire: string) => wire },
  builds: inMemoryBuilds(),
});

const feeDeps = (recipientHoldsUsdc: boolean, solUsd: string | null) =>
  ({
    chain: {
      tokenBalances: async () =>
        recipientHoldsUsdc ? [{ mint: USDC_MINT, rawAmount: 1n, decimals: 6 }] : [],
      mintConfig: async () => null,
    },
    prices: {
      pricesFor: async () =>
        new Map(
          solUsd === null
            ? []
            : [
                [
                  SOL_MINT,
                  {
                    mint: SOL_MINT,
                    usdPricePerToken: D(solUsd),
                    pricePerShare: null,
                    changePct24h: null,
                    liquidityUsd: D(0),
                    multiplier: D(1),
                    observedAt: new Date(),
                  },
                ],
              ],
        ),
    },
  }) as unknown as NonNullable<SendDeps["fees"]>;

const quote = (opts: {
  wallet?: string | null;
  to?: string;
  sponsored?: boolean;
  recipientHoldsUsdc?: boolean;
  solUsd?: string | null;
}) => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", {
      userId: "user-1",
      privyUserId: "did:privy:1",
      walletAddress: opts.wallet === undefined ? "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" : opts.wallet,
    });
    await next();
  });
  a.route(
    "/",
    sendRoutes({
      rpcUrl: "http://127.0.0.1:1",
      fees: feeDeps(opts.recipientHoldsUsdc ?? false, opts.solUsd === undefined ? "119.39" : opts.solUsd),
      ...(opts.sponsored === false ? {} : { relay: stubRelay() }),
    }),
  );
  return a.request("/v1/money/send/quote", {
    method: "POST",
    body: JSON.stringify({ to: opts.to ?? RECIPIENT }),
    headers: { "content-type": "application/json" },
  });
};

describe("POST /v1/money/send/quote", () => {
  it("charges the rent when the recipient has never held USDC", async () => {
    const res = await quote({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ feeUsd: "0.18", sponsored: true });
  });

  it("charges nothing when the recipient already holds USDC, which is the ordinary case", async () => {
    const res = await quote({ recipientHoldsUsdc: true });
    expect(await res.json()).toEqual({ feeUsd: "0", sponsored: true });
  });

  /*
   * Without a relayer the sender is paying their own network costs in SOL, so
   * charging USDC on top would be charging twice. `sponsored: false` is what
   * tells the screen it cannot promise to cover the fee.
   */
  it("charges nothing and claims nothing when no relayer is configured", async () => {
    const res = await quote({ sponsored: false });
    expect(await res.json()).toEqual({ feeUsd: "0", sponsored: false });
  });

  it("charges nothing when SOL has no price, rather than guessing one", async () => {
    const res = await quote({ solUsd: null });
    expect(await res.json()).toEqual({ feeUsd: "0", sponsored: true });
  });

  it("refuses an address that is not on Solana", async () => {
    const res = await quote({ to: "not-an-address" });
    expect(res.status).toBe(400);
  });

  it("refuses a session with no wallet", async () => {
    const res = await quote({ wallet: null });
    expect(res.status).toBe(401);
  });
});

/**
 * A Solana node that takes every transaction and reports it confirmed at once,
 * for the one path these tests otherwise never reach: after the send.
 */
const acceptingNode = async () => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { id, method } = JSON.parse(body) as { id: number; method: string };
      const result =
        method === "sendTransaction"
          ? "sig"
          : {
              context: { slot: 1 },
              value: [{ slot: 1, confirmations: null, err: null, confirmationStatus: "confirmed" }],
            };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

describe("POST /v1/transactions/send, once the node takes it", () => {
  it("tells `accepted` which message went out, under the signature it went out as", async () => {
    const node = await acceptingNode();
    try {
      const { wallet, wire } = await txFrom(true);
      const told: [number[], string][] = [];
      const a = new Hono();
      a.use("*", async (c, next) => {
        c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: wallet });
        await next();
      });
      a.route(
        "/",
        sendRoutes({
          rpcUrl: node.url,
          accepted: async (bytes, signature) => {
            told.push([[...bytes], signature]);
          },
        }),
      );
      const res = await a.request("/v1/transactions/send", {
        method: "POST",
        body: JSON.stringify({ transaction: wire }),
        headers: { "content-type": "application/json" },
      });
      const { signature } = (await res.json()) as { signature: string };
      const message = getTransactionDecoder().decode(getBase64Encoder().encode(wire)).messageBytes;
      expect(told).toEqual([[[...(message as unknown as Uint8Array)], signature]]);
    } finally {
      node.close();
    }
  });
});
