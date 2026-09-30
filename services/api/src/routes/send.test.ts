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
