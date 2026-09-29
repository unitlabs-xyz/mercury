import { Hono } from "hono";
import { z } from "zod";
import {
  createSolanaRpc,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface SendDeps {
  readonly rpcUrl: string;
  /** How long to wait for confirmation before answering "pending". */
  readonly confirmMs?: number;
}

/**
 * The program's own reason, in words someone can act on.
 *
 * Preflight rejections arrive as a wall of JSON with the useful sentence
 * buried in the logs. This used to live in a dry-run branch, where it was only
 * ever read by whoever was testing; it belongs on the path real orders take.
 */
const reasonFrom = (raw: string): string => {
  if (raw.includes("AccountNotFound") || raw.includes("InsufficientFundsForFee")) {
    return "the wallet has no SOL to pay the network fee. Add a little SOL (0.01 is plenty) and try again.";
  }
  const line = raw.split("\n").find((l) => /Error Message:/.test(l));
  return line === undefined ? raw : line.replace(/^.*Error Message:\s*/, "");
};

const fail = (code: string, message: string) => ({ error: { code, message } });

const Body = z.object({ transaction: z.string().min(1) });

/**
 * Broadcasts a transaction the user's wallet has already signed, and waits for
 * it to confirm. The browser never needs an RPC endpoint of its own, so a paid
 * RPC key never ships to it.
 *
 * There is one mode and it sends. A dry run used to sit in front of this,
 * which meant every screen downstream carried a second set of copy for a state
 * that only ever happened to us — and a way for a build to look like it worked
 * without anything leaving the machine.
 *
 * It relays only transactions whose fee payer is the caller's own wallet, from
 * the identity token Privy signed. Anything else would make this an open relay
 * on our RPC quota. It cannot change what was signed: a signature covers every
 * byte of the message.
 */
export function sendRoutes(deps: SendDeps): Hono {
  const app = new Hono();
  const rpc = createSolanaRpc(deps.rpcUrl);
  const confirmMs = deps.confirmMs ?? 45_000;

  app.post("/v1/transactions/send", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    let payer: string;
    let signature: string;
    try {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(parsed.data.transaction));
      const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
      payer = message.staticAccounts[0] ?? "";
      const sig = tx.signatures[payer as keyof typeof tx.signatures];
      if (!sig) throw new Error("unsigned");
      signature = getBase58Decoder().decode(sig);
    } catch {
      return c.json(fail("validation_failed", "Not a signed Solana transaction."), 400);
    }
    if (payer !== wallet)
      return c.json(fail("forbidden", "The fee payer is not this account's wallet."), 403);

    try {
      await rpc
        .sendTransaction(parsed.data.transaction as Base64EncodedWireTransaction, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          maxRetries: 3n,
        })
        .send();
    } catch (err) {
      // Preflight failures carry the program's own reason; pass it on rather than a generic 500.
      const message = err instanceof Error ? err.message : "The network rejected the transaction.";
      return c.json(fail("send_failed", reasonFrom(message)), 422);
    }

    const deadline = Date.now() + confirmMs;
    while (Date.now() < deadline) {
      const { value } = await rpc.getSignatureStatuses([signature as Signature]).send();
      const status = value[0];
      if (status?.err) return c.json({ signature, status: "failed", error: JSON.stringify(status.err) }, 422);
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        return c.json({ signature, status: "confirmed" });
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return c.json({ signature, status: "pending" }, 202);
  });

  return app;
}
