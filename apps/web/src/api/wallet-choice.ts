/**
 * Which wallet the app is showing: the Mercury wallet, one linked wallet, or
 * every wallet at once.
 *
 * Sent to the server on every request as `X-Mercury-Wallet`, so one choice
 * picks the wallet for every read: there is no query parameter to keep in step
 * with it. Remembered per browser, because it is how somebody left the app
 * rather than anything about their account.
 */
import { WALLET_PARAM, walletFromSearch } from "@mercury/view";

export { ALL_WALLETS, WALLET_HEADER } from "@mercury/view";

/** Null is the Mercury wallet, which is what the server reads with no header. */
export type WalletChoice = string | null;

const KEY = "mercury.wallet";

/*
 * Storage can be missing or refuse (a private window, blocked site data), and
 * the choice is a convenience: without it the app shows the Mercury wallet,
 * which is what it showed before there was a choice.
 */
const load = (): WalletChoice => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null || raw.length === 0 ? null : raw;
  } catch {
    return null;
  }
};

let choice: WalletChoice = load();
const listeners = new Set<() => void>();

/** The choice now, for `apiFetch`, which is not a component. */
export const chosenWallet = (): WalletChoice => choice;

export const setChosenWallet = (next: WalletChoice) => {
  if (next === choice) return;
  choice = next;
  try {
    if (next === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Kept for this tab only.
  }
  for (const l of listeners) l();
};

export const subscribeChoice = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Opened from the phone's "Manage on web" (`?wallet=<id>`): choose the wallet
 * the link names, then take the parameter out of the address, so a reload or
 * a copied link does not choose it again. Run once, before the first render.
 *
 * The id is only a choice: a wallet that is not on the account resolves to
 * the Mercury wallet as any stale choice does, and the server refuses it with
 * a 403 regardless.
 */
export const adoptWalletFromUrl = (
  location: Pick<Location, "search" | "pathname" | "hash">,
  history: Pick<History, "replaceState" | "state">,
) => {
  const id = walletFromSearch(location.search);
  if (id === null) return;
  setChosenWallet(id);
  const rest = new URLSearchParams(location.search);
  rest.delete(WALLET_PARAM);
  const query = rest.toString();
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${query === "" ? "" : `?${query}`}${location.hash}`,
  );
};
