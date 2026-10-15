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
  /* Where a provider keeps the real reason: MetaMask sends
     `{ code: -32603, message: "Internal JSON-RPC error.", data: { message:
     "insufficient funds for gas * price + value" } }`, and some wallets nest
     the whole thing again under `error`. */
  readonly data?: unknown;
  readonly error?: unknown;
}

/*
 * A thrown string is a message, not a nothing.
 *
 * The Relay SDK throws bare strings — `Unable to find chain: Chain id 8453`,
 * `Step item is missing data` — and plain objects straight off the wire. An
 * `err as Error` reader sees no `.message` on any of them and falls back to
 * "please try again", which is how the most informative error in the system
 * became the least informative sentence on the screen.
 */
const asErrorLike = (err: unknown): ErrorLike => {
  if (typeof err === "string") return { message: err };
  return typeof err === "object" && err !== null ? (err as ErrorLike) : {};
};

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

/**
 * Every readable line on an error and everywhere it nests — `cause`, and the
 * `data` and `error` a wallet hangs its real reason on — nearest first.
 */
const allText = (err: unknown, depth = 0): string[] => {
  if (depth > MAX_CAUSE_DEPTH || err === undefined || err === null) return [];
  if (typeof err === "string") return text(err) === null ? [] : [err.trim()];
  if (typeof err !== "object") return [];
  const e = asErrorLike(err);
  const here = [e.shortMessage, e.details, e.message].map(text).filter((s): s is string => s !== null);
  return [
    ...here,
    ...allText(e.cause, depth + 1),
    ...allText(e.data, depth + 1),
    ...allText(e.error, depth + 1),
  ];
};

/** Longer than this and it stops being one short line in a sheet on a phone. */
const MAX_LENGTH = 90;

/** The one sentence shown when a deposit fails. Never empty. */
export const fundErrorCopy = (err: unknown): { readonly message: string; readonly rejected: boolean } => {
  if (isRejection(err)) {
    return { message: "Cancelled in your wallet. Nothing was sent.", rejected: true };
  }

  /*
   * The SDK's own terse strings, said in words.
   *
   * "Transaction Reverted" is what it throws when a receipt comes back with
   * `status: 'reverted'` — accurate, and no use to somebody holding a phone.
   * A revert on this path is nearly always one of two things, and naming both
   * is more useful than naming neither: not enough of the token to cover what
   * was typed, or not enough of the chain's native coin for the fee.
   */
  const bare = text(asErrorLike(err).message) ?? (typeof err === "string" ? err : null);
  if (bare !== null && /transaction reverted/i.test(bare)) {
    return {
      message: "Rejected by the network, likely low balance or gas. Nothing was sent.",
      rejected: false,
    };
  }

  /*
   * The wallet's own reason, wherever it sits.
   *
   * A wallet that refuses a transaction for a reason it does not classify —
   * MetaMask's "Internal JSON-RPC error", most often — reaches us as viem's
   * InternalRpcError, whose one-line summary is "An internal error was
   * received." and says nothing. The reason ("insufficient funds for gas *
   * price + value") is in `details`, or a cause or two down. So the whole
   * chain is read for the few reasons worth naming before falling back.
   */
  const said = allText(err).join(" \n ");
  if (/insufficient funds|gas required exceeds allowance|exceeds the balance of the account/i.test(said)) {
    return {
      message: "Not enough gas for the network fee.",
      rejected: false,
    };
  }
  if (/transfer amount exceeds balance|exceeds balance|insufficient balance/i.test(said)) {
    return {
      message: "Not enough of this token in your wallet.",
      rejected: false,
    };
  }
  if (/does not match (the )?(target|expected) chain|chain mismatch|current chain id/i.test(said)) {
    return {
      message: "Your wallet switched networks. Try again.",
      rejected: false,
    };
  }
  /*
   * A confirmation that ran out of blocks, not a transaction that failed.
   *
   * By the time this reaches a person the chain has already been asked
   * whether the deposit landed — see the catch around `execute` in
   * api/fund-swap.ts — so this sentence only ever follows a signature that
   * could not be found or could not be checked. It says the one true thing in
   * that case, and the transaction link beside it says the rest.
   */
  if (/blockheight exceeded|block height exceeded|transactionexpired/i.test(said)) {
    return {
      message: "We couldn't confirm this in time. Check the transaction before sending again.",
      rejected: false,
    };
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

  /* An unclassified wallet failure: said plainly, instead of viem's sentence
     about an internal error. The wallet's own words are on the console. */
  if (best !== null && /internal (json-rpc )?error/i.test(best)) {
    return {
      message: "Your wallet couldn't send it. Try again.",
      rejected: false,
    };
  }

  if (best === null) {
    return { message: "Couldn't complete the deposit. Try again.", rejected: false };
  }

  /*
   * Clipped, because viem's own "short" message still runs to several lines on
   * a reverted simulation, and this renders in a sheet on a phone. The whole
   * thing is on the console for anyone debugging.
   */
  const clipped = best.length > MAX_LENGTH ? `${best.slice(0, MAX_LENGTH - 1)}…` : best;
  return { message: clipped, rejected: false };
};

/**
 * Everything the error said, joined, for a developer reading the screen in
 * a dev build. Never shown in production: it is the wallet's raw wording.
 */
export const fundErrorDetail = (err: unknown): string => {
  const lines = [...new Set(allText(err))];
  const joined = lines.join(" · ");
  return joined.length > 400 ? `${joined.slice(0, 399)}…` : joined;
};
