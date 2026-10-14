/**
 * The decisions behind "add cash from another chain", with no React in them.
 *
 * Most of what was here has gone, in two moves worth recording. Searching and
 * filtering went to the server, which searches Relay's whole token index
 * rather than the 56 names `/chains` happened to carry — see
 * services/api/src/routes/fund.ts. Then the in-progress deposit list went too,
 * taking `statusCopy` and `anyInFlight` with it: a panel for starting a
 * deposit is not the place to keep a history of them.
 *
 * What is left is how long to say it takes, which is not the same answer on
 * every chain and has to be said out loud.
 */

/** A chain we take deposits from, as the server reports it. One filter chip. */
export interface FundChain {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly iconUrl: string | null;
}

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
