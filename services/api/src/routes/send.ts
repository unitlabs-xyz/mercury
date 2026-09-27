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
  /** "simulate" is a dry run: the signed transaction is simulated and never sent. */
  readonly mode?: "broadcast" | "simulate";
  /** How long to wait for confirmation before answering "pending". */
  readonly confirmMs?: number;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const Body = z.object({ transaction: z.string().min(1) });

/**
 * Broadcasts a transaction the user's wallet has already signed, and waits for
 * it to confirm. The browser never needs an RPC endpoint of its own, so a paid
 * RPC key never ships to it.
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

    if (deps.mode === "simulate") {
      // A dry run: the real signed transaction, run against mainnet, never sent.
      // Signatures are checked too, so a wrongly signed transaction fails here as it would live.
      const sim = await rpc
        .simulateTransaction(parsed.data.transaction as Base64EncodedWireTransaction, {
          encoding: "base64",
          sigVerify: true,
          commitment: "confirmed",
        })
        .send();
      const logs = (sim.value.logs ?? [])
        .filter((l) => /Error|failed|Instruction:|success/.test(l))
        .slice(-12);
      const units = sim.value.unitsConsumed?.toString() ?? null;
      if (sim.value.err !== null) {
        const raw = JSON.stringify(sim.value.err, (_, v: unknown) =>
          typeof v === "bigint" ? v.toString() : v,
        );
        // The program's own last error line names the failing check; the raw code is the fallback.
        const reason = raw.includes("AccountNotFound")
          ? "the wallet has no SOL to pay the network fee. Add a little SOL (0.01 is plenty) and try again."
          : ([...logs].reverse().find((l) => /Error Message:|Error:/.test(l)) ?? raw);
        return c.json(
          {
            ...fail("simulation_failed", `Dry run failed: ${reason}`),
            signature,
            logs,
            unitsConsumed: units,
          },
          422,
        );
      }
      // A dry run: the real signed transaction, run against mainnet, never sent.
      return c.json({ signature, status: "simulated", ok: true, unitsConsumed: units, logs });
    }

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
      return c.json(fail("send_failed", message), 422);
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
