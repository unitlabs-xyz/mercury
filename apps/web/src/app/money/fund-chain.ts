/**
 * The decisions behind "add cash from another chain", with no React in them.
 *
 * Searching and filtering used to live here, over a list of 56 tokens the
 * server had read out of Relay's `/chains`. Both moved to the server, which
 * searches Relay's whole index instead — see services/api/src/routes/fund.ts.
 * What is left is what a deposit's state means and how long it takes, which
 * differ by chain in a way the copy has to say out loud.
 */

/** A chain we take deposits from, as the server reports it. One filter chip. */
export interface FundChain {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly iconUrl: string | null;
}

/** Relay's own vocabulary. Stored and displayed rather than mapped to ours. */
export type FundStatus =
  "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund";

const SETTLED: readonly string[] = ["success", "failure", "refund"];

/** Whether anything is still moving, which is what decides whether to poll. */
export const anyInFlight = (statuses: readonly string[]): boolean =>
  statuses.some((s) => !SETTLED.includes(s));

/**
 * What to say about a deposit, by what Relay says about it.
 *
 * `waiting` is the common one and the one most worth getting right: nothing has
 * arrived, which is not a problem and must not read as one.
 */
export const statusCopy = (status: string): { readonly label: string; readonly done: boolean } => {
  switch (status) {
    case "waiting":
      return { label: "Waiting for your transfer", done: false };
    case "depositing":
    case "pending":
      return { label: "Received, converting", done: false };
    case "submitted":
      return { label: "Almost there", done: false };
    case "success":
      return { label: "Added to your balance", done: true };
    case "failure":
      return { label: "Could not be completed", done: true };
    case "refund":
      return { label: "Returned to sender", done: true };
    default:
      /* An unknown status is Relay's to add, not ours to guess at. */
      return { label: "In progress", done: false };
  }
};

/**
 * How long to tell somebody it will take, which is not the same number on
 * every chain.
 *
 * Bitcoin waits for block confirmations — ten minutes to an hour, and two
 * blocks above a high-value threshold. Everything else measured on 13 October
 * came back in about a second once the deposit landed. Saying "about a minute"
 * for Bitcoin would have somebody refreshing a screen for forty minutes
 * convinced their money was gone.
 */
export const timingCopy = (vmType: string): string =>
  vmType === "bvm"
    ? "Bitcoin deposits wait for block confirmations, so this usually takes 10 to 60 minutes."
    : "This usually takes about a minute once your transfer lands.";
