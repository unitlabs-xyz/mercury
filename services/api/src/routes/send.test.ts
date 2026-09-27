import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
} from "@solana/kit";
import { sendRoutes } from "./send.js";

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
const app = (walletAddress: string | null) => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  a.route("/", sendRoutes({ rpcUrl: "http://127.0.0.1:1" }));
  return a;
};

const post = (walletAddress: string | null, transaction: string) =>
  app(walletAddress).request("/v1/transactions/send", {
    method: "POST",
    body: JSON.stringify({ transaction }),
    headers: { "content-type": "application/json" },
  });

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
});
