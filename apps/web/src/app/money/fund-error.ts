/**
 * What to say when a deposit does not go through.
 *
 * `error.message` alone is not enough, and the empty red box it produced is
 * the reason this exists: viem wraps a wallet's rejection in an error whose
 * `message` can be blank and whose readable text is on `shortMessage`, so
 * rendering `.message` straight out gave an alert with nothing in it. An
 * empty alert is worse than a wrong one — it says something broke and
 * refuses to say what.
 */

/** Everything a thrown value might carry that is worth reading. */
interface ErrorLike {
  readonly message?: unknown;
  readonly shortMessage?: unknown;
  readonly details?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
  readonly cause?: unknown;
}

const asErrorLike = (err: unknown): ErrorLike =>
  typeof err === "object" && err !== null ? (err as ErrorLike) : {};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * EIP-1193's code for "the person said no", plus the phrasings wallets use
 * when they do not send it.
 *
 * Rabby, MetaMask and Phantom all word this differently and not all of them
 * set the code once the error has been through a library or two, so the
 * phrase check is not redundant with the code check.
 */
const REJECTED = /user rejected|user denied|rejected the request|declined|cancell?ed/i;

/*
 * How far down a `cause` chain to look.
 *
 * Bounded rather than followed to the end, because an error whose `cause` is
 * itself is a stack overflow and a blank screen — strictly worse than the
 * empty alert this file was written to fix. Real wallet errors nest two or
 * three deep.
 */
const MAX_CAUSE_DEPTH = 5;

export const isRejection = (err: unknown, depth = 0): boolean => {
  if (depth > MAX_CAUSE_DEPTH) return false;
  const e = asErrorLike(err);
  if (e.code === 4001) return true;
  if (text(e.name) === "UserRejectedRequestError") return true;
  const anywhere = [e.shortMessage, e.message, e.details].map(text).filter((s) => s !== null);
  if (anywhere.some((s) => REJECTED.test(s))) return true;
  /* Wallet errors nest: viem's wrapper carries the provider's original on
     `cause`, and that is often where the code survives. */
  return e.cause === undefined || e.cause === null ? false : isRejection(e.cause, depth + 1);
};

/** Longer than this and it stops being one sentence in a sheet on a phone. */
const MAX_LENGTH = 180;

/** The one sentence shown when a deposit fails. Never empty. */
export const fundErrorCopy = (err: unknown): { readonly message: string; readonly rejected: boolean } => {
  if (isRejection(err)) {
    return { message: "You cancelled the signature in your wallet. Nothing was sent.", rejected: true };
  }

  const e = asErrorLike(err);
  /* `shortMessage` before `message`: viem's `message` is the whole annotated
     report — request body, docs link and all — and `shortMessage` is the one
     line of it written for a person. */
  const best =
    text(e.shortMessage) ??
    text(e.message) ??
    text(e.details) ??
    (e.cause === undefined || e.cause === null ? null : text(asErrorLike(e.cause).shortMessage)) ??
    null;

  if (best === null) {
    return { message: "That deposit could not be completed. Please try again.", rejected: false };
  }

  /*
   * Clipped, because viem's own "short" message still runs to several lines on
   * a reverted simulation, and this renders in a sheet on a phone. The whole
   * thing is on the console for anyone debugging.
   */
  const clipped = best.length > MAX_LENGTH ? `${best.slice(0, MAX_LENGTH - 1)}…` : best;
  return { message: clipped, rejected: false };
};
