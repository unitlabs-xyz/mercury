/**
 * The decisions behind "add cash from another chain", with no React in them.
 *
 * The panel offers every chain Relay supports — 61 of them, 154 tokens — so
 * the list is searched rather than read, and what the search does is worth
 * being sure of. The rest is what a deposit's state means and how long it
 * takes, which differ by chain in a way the copy has to say out loud.
 */

export interface FundCurrency {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly decimals: number;
}

export interface FundSource {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly currencies: readonly FundCurrency[];
}

/** One row in the list: a token on a chain. */
export interface FundOption {
  readonly chainId: number;
  readonly chainName: string;
  readonly vmType: string;
  readonly currency: FundCurrency;
}

export const optionsOf = (sources: readonly FundSource[]): readonly FundOption[] =>
  sources.flatMap((s) =>
    s.currencies.map((currency) => ({
      chainId: s.chainId,
      chainName: s.name,
      vmType: s.vmType,
      currency,
    })),
  );

/**
 * The handful somebody is most likely to want, in the order they are likely to
 * want them, and only when they are actually on offer.
 *
 * A list of sixty-one is a worse list than a list of six, and the answer is not
 * to shorten what we accept — somebody holding the sixty-first thing should not
 * be told we cannot take their money. So everything stays searchable and this
 * decides what leads.
 */
const LEADS: readonly { readonly chainId: number; readonly symbol: string }[] = [
  { chainId: 792703809, symbol: "USDT" },
  { chainId: 792703809, symbol: "SOL" },
  { chainId: 8453, symbol: "ETH" },
  { chainId: 8453, symbol: "USDC" },
  { chainId: 1, symbol: "USDC" },
  { chainId: 728126428, symbol: "USDT" },
  { chainId: 8253038, symbol: "BTC" },
];

export const leadOptions = (options: readonly FundOption[]): readonly FundOption[] =>
  LEADS.flatMap((lead) => {
    const found = options.find((o) => o.chainId === lead.chainId && o.currency.symbol === lead.symbol);
    return found === undefined ? [] : [found];
  });

/**
 * Case-insensitive, and across both names a person might type.
 *
 * Somebody looking for USDT on Tron types either word, and a search that only
 * matched the token would make the chain unfindable — which on a list this
 * long is the same as not supporting it.
 */
export const matchOptions = (options: readonly FundOption[], query: string): readonly FundOption[] => {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return options;
  return options.filter(
    (o) =>
      o.chainName.toLowerCase().includes(q) ||
      o.currency.symbol.toLowerCase().includes(q) ||
      o.currency.name.toLowerCase().includes(q),
  );
};

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
