import type { OutsideBasket } from "../../api/move";

/** What the card asks for next, for one basket, from what the chain shows. */
export type NextStep =
  /** Nothing has arrived yet: withdraw it on Glider. */
  | { readonly kind: "withdraw" }
  /** Shares arrived in the linked wallet: move them to the Mercury wallet. */
  | { readonly kind: "move-shares" }
  /** USDC arrived: move it to the Mercury wallet, then invest it in a Mercury basket. */
  | { readonly kind: "move-usdc"; readonly invest: { readonly slug: string; readonly name: string } | null };

/**
 * The next step for a basket, read from what has landed: shares or USDC,
 * whichever Glider's app paid out. Shares win when both arrived, since the
 * move takes the USDC with them.
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
 * The steps to bring a basket in, for a wallet called `wallet`: only what
 * Mercury can stand behind. Glider's API answers only the app that enrolled a
 * basket, so the withdrawal is the deposit app's to make, and what that app
 * offers (shares or USDC) can't be checked from here: the card sends the
 * person back to it, promises none of its screens, and then follows whatever
 * arrives.
 */
export const handoffSteps = (wallet: string): readonly string[] => [
  `Open the app you put this basket in (Glider, or another app built on it) and withdraw it to ${wallet}.`,
  `When it lands in ${wallet}, this card offers the next step: move it to your Mercury wallet in one approval.`,
];
