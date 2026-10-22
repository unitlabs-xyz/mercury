import { Hono } from "hono";
import { logger } from "../log/index.js";
import { z } from "zod";
import {
  address,
  createSolanaRpc,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isSolanaError,
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";
import { D, type Decimal } from "@mercury/core";
import { buildUsdcTransferTransaction } from "../relay/usdc-transfer.js";
import { buildSponsoredTransfer } from "../relay/transfer.js";
import { quoteTransferFee, type FeeQuoteDeps } from "../relay/quote.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import { decodeSponsored } from "../relay/decode.js";
import type { SponsoredBuilds } from "../relay/builds.js";
import type { RelaySigner } from "../relay/signer.js";
import { validateSponsored } from "../relay/validate.js";

export interface SendDeps {
  readonly rpcUrl: string;
  /** How long to wait for confirmation before answering "pending". */
  readonly confirmMs?: number;
  /**
   * Reads the recipient's balances and the SOL price, to price the rent a
   * sponsored transfer may owe.
   *
   * Absent, a sponsored transfer is composed and sent for nothing — the
   * relayer pays the rent and is not repaid. That is the safe direction to
   * degrade in: the transfer still works, and the only thing lost is our own
   * money, rather than a sender being charged a figure nobody could price.
   */
  readonly fees?: FeeQuoteDeps | undefined;
  /**
   * Sponsorship, or nothing. Absent, every transaction must still be fee-paid
   * by the caller's own wallet, which is the behaviour before any of this.
   *
   * The signer and the record of what we built travel together on purpose: a
   * key that will pay without a way to know what it is paying for is the one
   * combination that must not be configurable.
   */
  readonly relay?:
    | {
        readonly signer: RelaySigner;
        readonly builds: SponsoredBuilds;
        /** Which programs may be sponsored. Undefined allows any. */
        readonly allowedPrograms?: readonly string[] | undefined;
      }
    | undefined;
  /**
   * Told about each transaction the node takes, with the message it signs, for
   * bookkeeping that must not wait on the app to confirm: Earn's ledger. Every
   * transaction the app sends passes through here, so nothing is missed. It
   * runs before the transaction lands, so it waits for that itself, and the
   * answer to the person waits for none of it.
   */
  readonly accepted?: (messageBytes: Uint8Array, signature: string) => Promise<void>;
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
 * `@solana/kit` does not put the failure in the message.
 *
 * A preflight rejection arrives as `Solana error #-32002; Decode this error by
 * running \`npx @solana/errors decode -- -32002 '<base64>'\`` — and that base64
 * is a URL-encoded query string holding `accounts`, `fee`, `unitsConsumed` and,
 * the only part worth reading, `logs`. Unpacked here rather than left for the
 * operator to decode by hand, because the sentence a buyer needs is inside it.
 */
const KIT_CONTEXT = /decode\s+--\s+-?\d+\s+'([A-Za-z0-9+/=]+)'/;

const log = logger("send");

export const logsFrom = (raw: string): readonly string[] => {
  const encoded = KIT_CONTEXT.exec(raw)?.[1];
  if (encoded === undefined) return [];
  try {
    const logs = new URLSearchParams(Buffer.from(encoded, "base64").toString("utf8")).get("logs");
    return logs === null || logs === "null" || logs === "" ? [] : logs.split(",");
  } catch {
    // A context we cannot read is one more reason to fall through to the
    // general sentence, not a reason to fail reporting the failure.
    return [];
  }
};

/**
 * What to say, by what the chain said. Ordered: the first match wins, so the
 * specific causes sit above the general ones.
 */
const SENTENCES: readonly { readonly when: RegExp; readonly say: string }[] = [
  {
    when: /AccountNotFound|InsufficientFundsForFee|insufficient lamports/i,
    say: "the wallet has no SOL to pay the network fee. Add a little SOL (0.01 is plenty) and try again.",
  },
  {
    /* Token program error 1 is InsufficientFunds, and the System program says
       it in words. Either way the wallet is short of what it is spending. */
    when: /insufficient funds|custom program error: 0x1\b/i,
    say: "there was not enough in the wallet to cover this. Check your cash and try again.",
  },
  {
    when: /slippage|SlippageToleranceExceeded|0x1771/i,
    say: "the price moved further than the order allowed while it was being sent. Try again.",
  },
  {
    when: /BlockhashNotFound|blockhash not found/i,
    say: "the order took too long to reach the network. Try again.",
  },
];

/**
 * The program's own reason, in words someone can act on.
 *
 * Never the raw string. It used to be returned as a fallback, which was fine
 * while failures carried an Anchor sentence and became a wall of base64 the
 * moment the RPC client started packing its context — a buyer was shown four
 * hundred characters of encoded log in place of "you have no cash". Whatever
 * cannot be turned into a sentence is logged for us and summarised for them.
 */
export const reasonFrom = (raw: string): string => {
  const logs = logsFrom(raw);
  const haystack = [raw, ...logs].join("\n");

  for (const { when, say } of SENTENCES) if (when.test(haystack)) return say;

  // Anchor writes its own, already meant for a reader.
  const anchor = haystack.split("\n").find((l) => /Error Message:/.test(l));
  if (anchor !== undefined) return anchor.replace(/^.*Error Message:\s*/, "").trim();

  const logged = logs.find((l) => /Program log: Error: /.test(l));
  if (logged !== undefined) return logged.replace(/^.*Program log: Error:\s*/, "").trim();

  /* `err`, not `raw`: an Error under any other key serializes to `{}`,
     because its own properties are not enumerable. Only `err` goes through
     pino's serializer, which is where `errorLine` turns it into the one line
     this used to log. */
  log.error({ err: raw }, "preflight failed with no reason we could name");
  return "the network rejected this order and did not say why. Nothing has been charged.";
};

/** The transaction errors `SENTENCES` has words for, by the name it matches on. */
const TRANSACTION_ERRORS: Readonly<Record<number, string>> = {
  [SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND]: "AccountNotFound",
  [SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE]: "InsufficientFundsForFee",
  [SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND]: "BlockhashNotFound",
  [SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED]: "AlreadyProcessed",
};

/**
 * The whole of a send failure, as text `reasonFrom` can read.
 *
 * A preflight rejected before any program ran — an expired blockhash, a fee
 * payer with no account — has no logs. Its reason is the transaction error,
 * which kit hangs off the error as `cause` and leaves out of the message, so
 * reading only the message turned every one of them into "did not say why".
 */
export const failureText = (err: unknown): string => {
  const message = err instanceof Error ? err.message : "The network rejected the transaction.";
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (!isSolanaError(cause)) return message;
  const code = cause.context.__code;
  return `${message}\n${TRANSACTION_ERRORS[code] ?? `transaction error #${code}`}`;
};

const fail = (code: string, message: string) => ({ error: { code, message } });

const Body = z.object({ transaction: z.string().min(1) });
const QuoteBody = z.object({ to: z.string().min(1) });
const PrepareBody = z.object({
  amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/, "Enter a USDC amount with at most six decimals."),
  to: z.string().min(1),
});

const usdcBaseUnits = (amount: string): bigint => {
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
};

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

  /**
   * What the sender repays, which is the recipient's account rent or nothing.
   *
   * Nothing at all when no relayer is configured: the sender is paying their
   * own network costs in SOL on that path, so charging USDC as well would be
   * charging twice.
   */
  const rentOwed = async (destination: string): Promise<Decimal> =>
    deps.relay === undefined || deps.fees === undefined
      ? D(0)
      : (await quoteTransferFee(deps.fees, { destination })).usdc;

  /**
   * What a transfer to this recipient will cost, before an amount is typed.
   *
   * Separate from `prepare` because the answer decides what "Max" means, and
   * Max is pressed before anything has been built. It turns only on the
   * recipient — whether they already hold USDC — so it is cheap and stable
   * enough for a field to ask on every address it accepts.
   */
  app.post("/v1/money/send/quote", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = QuoteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Enter a recipient address."), 400);

    let destination;
    try {
      destination = address(parsed.data.to.trim());
    } catch {
      return c.json(fail("validation_failed", "Enter a valid Solana wallet address."), 400);
    }

    try {
      const feeUsdc = await rentOwed(destination);
      return c.json({ feeUsd: feeUsdc.toString(), sponsored: deps.relay !== undefined });
    } catch (err) {
      /*
       * A quote we cannot get is not a reason to block a transfer. Zero and
       * unsponsored is what the screen showed before any of this existed, and
       * `prepare` prices it again for real.
       */
      log.error({ err }, "could not quote the transfer fee");
      return c.json({ feeUsd: "0", sponsored: deps.relay !== undefined });
    }
  });

  app.post("/v1/money/send/prepare", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = PrepareBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(fail("validation_failed", "Enter a valid USDC amount and recipient."), 400);

    const amountRaw = usdcBaseUnits(parsed.data.amount);
    if (amountRaw === 0n || amountRaw > 0xffff_ffff_ffff_ffffn) {
      return c.json(fail("validation_failed", "Enter a valid USDC amount."), 400);
    }

    let destination;
    try {
      destination = address(parsed.data.to.trim());
    } catch {
      return c.json(fail("validation_failed", "Enter a valid Solana wallet address."), 400);
    }
    if (destination === wallet)
      return c.json(fail("validation_failed", "You cannot send to your own wallet."), 400);

    const relay = deps.relay;
    try {
      const [{ value: lifetime }, feeUsdc] = await Promise.all([
        rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
        rentOwed(destination),
      ]);

      /*
       * Sponsored when there is a relayer to pay. The sender signs a
       * transaction whose fee payer is ours and whose rent we put up, and
       * repays the rent in USDC inside the same message. Without a relayer
       * this is the wallet-paid transfer it has always been, which needs SOL.
       */
      const built =
        relay === undefined
          ? {
              wire: await buildUsdcTransferTransaction({
                owner: address(wallet),
                destination,
                amountRaw,
                ...lifetime,
              }),
              messageBytes: null,
            }
          : await buildSponsoredTransfer({
              owner: address(wallet),
              destination,
              amountRaw,
              relayer: address(relay.signer.address),
              feeUsdc,
              ...lifetime,
            });

      const { value: simulated } = await rpc
        .simulateTransaction(built.wire as Base64EncodedWireTransaction, {
          encoding: "base64",
          commitment: "confirmed",
          sigVerify: false,
        })
        .send();
      if (simulated.err !== null) {
        return c.json(
          fail(
            "send_unavailable",
            relay === undefined
              ? "This transfer cannot be sent. Check your USDC balance and SOL for network fees."
              : "This transfer cannot be sent. Check your USDC balance and try again.",
          ),
          422,
        );
      }

      /* Remembered only once it simulates, or the relayer will not co-sign it. */
      if (built.messageBytes !== null && relay !== undefined) relay.builds.remember(built.messageBytes);
      return c.json({ transaction: built.wire, feeUsd: feeUsdc.toString() });
    } catch (err) {
      log.error({ err }, "could not prepare USDC transfer");
      return c.json(fail("send_unavailable", "Could not prepare this transfer. Please try again."), 503);
    }
  });

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
    } else if (deps.relay !== undefined && decoded.tx.feePayer === deps.relay.signer.address) {
      /*
       * We are being asked to pay. The session proves who is calling; it does
       * not prove the transaction is theirs, so everything about the message
       * is checked against the wallet Privy signed for before the key is used.
       */
      const verdict = validateSponsored(decoded.tx, wallet, {
        relayer: deps.relay.signer.address,
        ...(deps.relay.allowedPrograms === undefined ? {} : { allowedPrograms: deps.relay.allowedPrograms }),
      });
      if (!verdict.ok) return c.json(fail(verdict.code, verdict.message), 403);

      /*
       * And it has to be a message we composed. Everything above judges what a
       * transaction says about itself; this is the only check that knows what
       * it should have said. The network fee is inside these bytes, so a buyer
       * who drops it, lowers it or redirects it fails here rather than being
       * caught by a decoder we would have had to write and keep right.
       */
      if (!deps.relay.builds.recognises(decoded.messageBytes)) {
        return c.json(fail("not_our_build", "This is not a transaction this server composed."), 403);
      }

      wire = await deps.relay.signer.cosign(wire);
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
      return c.json(fail("send_failed", reasonFrom(failureText(err))), 422);
    }
    void deps.accepted?.(decoded.messageBytes, signature).catch(() => undefined);

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
