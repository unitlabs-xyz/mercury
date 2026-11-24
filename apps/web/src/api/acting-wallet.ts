import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountWallets, walletName, WALLETS_KEY, type AccountWallet } from "./wallets";
import {
  ALL_WALLETS,
  chosenWallet,
  setChosenWallet,
  subscribeChoice,
  type WalletChoice,
} from "./wallet-choice";

export { ALL_WALLETS, WALLET_HEADER, type WalletChoice } from "./wallet-choice";

/** What a choice means against the wallets the account has now. */
export type Acting =
  | { readonly kind: "mercury"; readonly wallet: AccountWallet | null }
  | { readonly kind: "linked"; readonly wallet: AccountWallet }
  | { readonly kind: "all" };

/**
 * A choice read against the account's wallets. A wallet that is no longer
 * there (unlinked here or on another device) falls back to the Mercury wallet,
 * as does every choice while the list is still loading: the server answers a
 * stale id with a 403, and the Mercury wallet is never wrong to show.
 */
export const resolveChoice = (
  chosen: WalletChoice,
  wallets: readonly AccountWallet[] | undefined,
): { readonly acting: Acting; readonly stale: boolean } => {
  const mercury = wallets?.find((w) => w.isPrimary) ?? null;
  if (chosen === null || wallets === undefined)
    return { acting: { kind: "mercury", wallet: mercury }, stale: false };
  const linked = wallets.filter((w) => !w.isPrimary);
  if (chosen === ALL_WALLETS) {
    // With nothing linked, every wallet is the Mercury wallet.
    return linked.length === 0
      ? { acting: { kind: "mercury", wallet: mercury }, stale: true }
      : { acting: { kind: "all" }, stale: false };
  }
  if (chosen === mercury?.id) return { acting: { kind: "mercury", wallet: mercury }, stale: false };
  const one = linked.find((w) => w.id === chosen);
  return one === undefined
    ? { acting: { kind: "mercury", wallet: mercury }, stale: true }
    : { acting: { kind: "linked", wallet: one }, stale: false };
};

/** What the switcher says for the wallet being shown. */
export const actingLabel = (acting: Acting): string =>
  acting.kind === "all" ? "All wallets" : acting.kind === "linked" ? walletName(acting.wallet) : "Mercury";

/** Whether the chosen wallet can act: the Mercury wallet or a linked one, never every wallet at once. */
export const canAct = (acting: Acting): boolean => acting.kind !== "all";

/**
 * What an action is, for whether the chosen wallet can take it. A linked
 * wallet trades, borrows, repays, runs baskets, uses Earn and sends,
 * approving each in its own pop-up. A loan is one wallet's own position, so
 * every wallet at once asks whose loan is meant rather than offering a switch.
 */
export type BlockedAction = "action" | "loan";

/** What to say where an action would be, when the chosen wallet cannot take it; null when it can. */
export const actionBlockedCopy = (acting: Acting, what: BlockedAction = "action"): string | null => {
  if (acting.kind !== "all") return null;
  return what === "loan"
    ? "A loan belongs to one wallet. Choose whose loan this is."
    : "Choose a wallet to do this from. All wallets is for looking.";
};

/**
 * Whether a query is a read for the chosen wallet, and so is dropped when
 * another is chosen. The wallet list and the summary are the same for any
 * choice, and so is anything read for every wallet at once by name
 * (`["api", "portfolio", "all", ...]`): it sends its own header.
 */
export const readsForChoice = (key: readonly unknown[]): boolean =>
  key[0] === "api" && key[1] !== WALLETS_KEY[1] && key[1] !== "summary" && key[2] !== ALL_WALLETS;

/** What connecting a linked wallet needs, loaded only when one is chosen. */
type Connector = { connectLinked(address: string, name: string): Promise<void> };

/**
 * When somebody explicitly chooses a linked wallet, ask it to connect then:
 * its own dialog opens now rather than in the middle of their first trade,
 * and the connection is kept after. The Mercury wallet and every wallet at
 * once connect nothing, so a linked wallet's dialog is only ever seen by
 * someone who chose that wallet.
 *
 * Nothing waits on it and nothing fails with it: closing the dialog still
 * shows the wallet, which needs no connection to be looked at, and signing
 * asks again. AppKit is loaded only here, as the bundle rule requires.
 */
export const connectWhenChosen = async (
  next: WalletChoice,
  wallets: readonly AccountWallet[],
  load: () => Promise<Connector> = () => import("../wallet/linkedSigner"),
): Promise<void> => {
  if (next === null || next === ALL_WALLETS) return;
  const wallet = wallets.find((w) => w.id === next && !w.isPrimary);
  if (wallet === undefined) return;
  try {
    await (await load()).connectLinked(wallet.address, walletName(wallet));
  } catch {
    // Declined, or another wallet connected: said when it is asked to sign.
  }
};

/** The chosen wallet, resolved, and a way to choose another. */
export const useActingWallet = () => {
  const chosen = useSyncExternalStore(subscribeChoice, chosenWallet, chosenWallet);
  const account = useAccountWallets();
  const qc = useQueryClient();
  const { acting, stale } = resolveChoice(chosen, account.data?.wallets);

  // A wallet unlinked elsewhere stops being chosen here, once the list says so.
  useEffect(() => {
    if (stale) setChosenWallet(null);
  }, [stale]);

  const choose = (next: WalletChoice) => {
    if (next === chosen) return;
    setChosenWallet(next);
    /*
     * Every account read was for the wallet chosen before. Cancelled first, so
     * an answer still on its way for the old wallet is not filed under the new
     * one, then reset, so nothing shows the old wallet's figures while the new
     * ones load. What reads the same for any choice is left alone.
     */
    const forChoice = { predicate: (q: { queryKey: readonly unknown[] }) => readsForChoice(q.queryKey) };
    void qc.cancelQueries(forChoice).then(() => qc.resetQueries(forChoice));
    // Chosen on purpose: a linked wallet asks to connect now, once.
    void connectWhenChosen(next, account.data?.wallets ?? []);
  };

  const wallets = account.data?.wallets ?? [];
  return { acting, choose, wallets, linked: wallets.filter((w) => !w.isPrimary) };
};
