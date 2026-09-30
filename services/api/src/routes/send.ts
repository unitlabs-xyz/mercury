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
import { decodeSponsored } from "../relay/decode.js";
import type { RelaySigner } from "../relay/signer.js";
import { validateSponsored } from "../relay/validate.js";

export interface SendDeps {
  readonly rpcUrl: string;
  /** How long to wait for confirmation before answering "pending". */
  readonly confirmMs?: number;
  /**
   * Who pays when the buyer does not. Absent, every transaction must still be
   * fee-paid by the caller's own wallet, which is the behaviour before any of
   * this existed.
   */
  readonly relay?: RelaySigner | undefined;
  /** Which programs may be sponsored. Undefined allows any. */
  readonly allowedPrograms?: readonly string[] | undefined;
}

/** The transaction id is the fee payer's signature, which is the first one. */
const feePayerSignature = (wire: string): string | null => {
  try {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const payer = message.staticAccounts[0];
    if (payer === undefined) return null;
    const sig = tx.signatures[payer as keyof typeof tx.signatures];
    return sig ? getBase58Decoder().decode(sig) : null;
  } catch {
    return null;
  }
};

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

    const decoded = decodeSponsored(parsed.data.transaction);
    if (!decoded.ok) return c.json(fail("validation_failed", "Not a signed Solana transaction."), 400);

    let wire = parsed.data.transaction;

    if (decoded.tx.feePayer === wallet) {
      // The buyer pays their own way. Unchanged, and still the path taken when
      // no relayer is configured.
      if (!decoded.tx.signedBy.includes(wallet)) {
        return c.json(fail("validation_failed", "Not a signed Solana transaction."), 400);
      }
    } else if (deps.relay !== undefined && decoded.tx.feePayer === deps.relay.address) {
      /*
       * We are being asked to pay. The session proves who is calling; it does
       * not prove the transaction is theirs, so everything about the message
       * is checked against the wallet Privy signed for before the key is used.
       */
      const verdict = validateSponsored(decoded.tx, wallet, {
        relayer: deps.relay.address,
        ...(deps.allowedPrograms === undefined ? {} : { allowedPrograms: deps.allowedPrograms }),
      });
      if (!verdict.ok) return c.json(fail(verdict.code, verdict.message), 403);
      wire = await deps.relay.cosign(wire);
    } else {
      return c.json(fail("forbidden", "The fee payer is not this account's wallet."), 403);
    }

    const signature = feePayerSignature(wire);
    if (signature === null) {
      return c.json(fail("validation_failed", "Not a signed Solana transaction."), 400);
    }

    try {
      await rpc
        .sendTransaction(wire as Base64EncodedWireTransaction, {
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
