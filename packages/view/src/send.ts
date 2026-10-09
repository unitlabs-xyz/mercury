import { D } from "@mercury/core";

/**
 * Sending USDC: prepare on the server, sign in the wallet, relay.
 *
 * Shared by both clients for the one rule worth having once: after the signed
 * transfer leaves, a lost response or a server error could still mean it was
 * broadcast, so the failure is reported as uncertain — check before sending
 * again — never as a plain failure that invites a second transfer.
 */
/**
 * What a transfer to a given recipient will cost the sender.
 *
 * Two separate facts, and the screen needs both. `sponsored` says whether a
 * relayer is paying the network at all — false is the old world, where the
 * wallet needs SOL and we cannot say otherwise. `feeUsd` is the rent for
 * opening the recipient's USDC account, which only they can owe and only the
 * first time anyone sends them dollars.
 */
export interface SendQuote {
  /** In USDC. "0" when nothing is owed, which is the ordinary case. */
  readonly feeUsd: string;
  readonly sponsored: boolean;
}

/** What to assume before a quote arrives, or when one cannot be had. */
export const NO_SEND_QUOTE: SendQuote = { feeUsd: "0", sponsored: false };

/**
 * The most of a balance that can actually leave.
 *
 * Max has to subtract the charge or it fails by construction: a sender holding
 * exactly $20 cannot send $20 and repay $0.22 out of the same $20. Subtracting
 * is what makes "Max" mean "all of it", which is the only thing it can
 * usefully mean.
 */
export const maxSendable = (balanceUsd: string | number | null | undefined, quote: SendQuote): string => {
  const most = D(balanceUsd ?? 0).sub(D(quote.feeUsd));
  return most.gt(0) ? most.toString() : "0";
};

export interface SendIntent {
  readonly amount: string;
  readonly to: string;
}

export interface SendReceipt {
  readonly signature: string;
  readonly status: "confirmed" | "pending";
}

export class SendSubmissionUncertain extends Error {
  constructor() {
    super("Submission could not be confirmed. Check your wallet activity before trying another transfer.");
    this.name = "SendSubmissionUncertain";
  }
}

export interface SendIo {
  prepare: (intent: SendIntent) => Promise<string>;
  sign: (transaction: string) => Promise<string>;
  submit: (signedTransaction: string) => Promise<SendReceipt>;
}

/* Each client has its own ApiError class; both carry the HTTP status. */
const httpStatus = (e: unknown) =>
  typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number"
    ? (e as { status: number }).status
    : null;

export async function sendUsdc(io: SendIo, intent: SendIntent): Promise<SendReceipt> {
  const transaction = await io.prepare(intent);
  const signed = await io.sign(transaction);
  try {
    const receipt = await io.submit(signed);
    if (receipt.status === "confirmed" || receipt.status === "pending") return receipt;
    throw new Error("The transfer failed on chain.");
  } catch (error) {
    // A 4xx is a definite rejection. A lost response or server error could
    // happen after broadcast, so never invite a new transfer automatically.
    const status = httpStatus(error);
    if (status !== null && status < 500) throw error;
    throw new SendSubmissionUncertain();
  }
}
