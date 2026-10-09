/**
 * Sending USDC: prepare on the server, sign in the wallet, relay.
 *
 * Shared by both clients for the one rule worth having once: after the signed
 * transfer leaves, a lost response or a server error could still mean it was
 * broadcast, so the failure is reported as uncertain — check before sending
 * again — never as a plain failure that invites a second transfer.
 */
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
