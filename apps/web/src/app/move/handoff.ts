import type { OutsideBasket } from "../../api/move";

/** How the person chose to bring a basket in: its shares as they are, or sold to USDC to reinvest here. */
export type HandoffChoice = "shares" | "usdc";

/** What the card asks for next, for one basket, from what the chain shows. */
export type NextStep =
  /** Nothing has arrived yet: withdraw it on Glider, the way chosen. */
  | { readonly kind: "withdraw" }
  /** Shares arrived in the linked wallet: move them to the Mercury wallet. */
  | { readonly kind: "move-shares" }
  /** USDC arrived: move it to the Mercury wallet, then invest it in a Mercury basket. */
  | { readonly kind: "move-usdc"; readonly invest: { readonly slug: string; readonly name: string } | null };

/**
 * The next step for a basket, read from what has landed rather than from what
 * was chosen: a person who chose shares but withdrew USDC is guided for the
 * USDC they have. Shares win when both arrived, since they move with the USDC.
 */
export const nextStep = (b: Pick<OutsideBasket, "arrived" | "similar">): NextStep => {
  const landed = b.arrived?.holdings ?? [];
  if (landed.length === 0) return { kind: "withdraw" };
  if (landed.some((h) => h.ticker !== null)) return { kind: "move-shares" };
  return {
    kind: "move-usdc",
    invest: b.similar === null ? null : { slug: b.similar.slug, name: b.similar.name },
  };
};

/**
 * The steps to bring a basket in, the way chosen, for a wallet called
 * `wallet`. Glider's own app decides what a withdrawal offers, and it can't be
 * checked from here, so the steps say "if it asks" rather than promise a
 * screen: whichever way the money comes back, `nextStep` follows what arrived.
 */
export const handoffSteps = (
  choice: HandoffChoice,
  wallet: string,
  similar: OutsideBasket["similar"],
): readonly string[] =>
  choice === "shares"
    ? [
        `Open Glider and withdraw the basket to ${wallet}.`,
        "If it asks how, choose to receive the shares themselves. Nothing is sold.",
        "Move them to your Mercury wallet here, in one approval.",
      ]
    : [
        `Open Glider and withdraw the basket to ${wallet}, as USDC if it offers that.`,
        "Move the USDC to your Mercury wallet here, in one approval.",
        similar === null
          ? "Invest it in a Mercury basket, rebalanced for you every day."
          : `Invest it in ${similar.name}, which holds the most of the same, rebalanced for you every day.`,
      ];

/** Under the USDC steps: what happens if Glider hands back the shares instead. */
export const SHARES_INSTEAD_NOTE =
  "If Glider hands back the shares instead, this card will offer to move them here, where you can keep or sell them.";

/** Said beside the USDC choice, so keeping the shares is plainly the one that sells nothing. */
export const USDC_COST_NOTE =
  "Selling and buying again pays spreads twice, and the money is out of the market until the first daily rebalance.";

/** Remembered per basket in this browser: a convenience, and the card works without it. */
const key = (address: string) => `mercury.handoff.${address}`;
type Store = Pick<Storage, "getItem" | "setItem">;

export const chosenHandoff = (address: string, store: Store | null): HandoffChoice => {
  try {
    return store?.getItem(key(address)) === "usdc" ? "usdc" : "shares";
  } catch {
    return "shares";
  }
};

export const rememberHandoff = (address: string, choice: HandoffChoice, store: Store | null): void => {
  try {
    store?.setItem(key(address), choice);
  } catch {
    // Not kept: the card starts on shares next time, which is the safe default.
  }
};
