import { useStandardWallets, useWallets } from "@privy-io/react-auth/solana";

/** Only what picking reads, so the pure half needs no Privy class to test. */
interface Pickable {
  readonly standardWallet: unknown;
}

/**
 * Privy's own Solana wallet, which marks itself and is the only one that does.
 *
 * `isPrivyWallet` is a getter on `PrivyStandardWallet`, so `in` finds it on the
 * prototype; an injected wallet implements the Wallet Standard and has no such
 * property. A hostile extension could of course assert it — but one with page
 * access has shorter paths than this, including rewriting the transaction
 * between build and display, and ADR 0012 already accepts silent signing. This
 * is proportionate, not airtight, and it is written down as such.
 */
const claimsPrivy = (wallet: unknown): boolean =>
  typeof wallet === "object" &&
  wallet !== null &&
  "isPrivyWallet" in wallet &&
  (wallet as { readonly isPrivyWallet: unknown }).isPrivyWallet === true;

/**
 * The embedded wallet out of everything connected, or nothing.
 *
 * `useWallets()` returns connected wallets, and until external wallets could be
 * connected there was only ever one, so the whole app read `wallets[0]`. That
 * was correct by configuration rather than by construction: the moment a
 * funding wallet can connect, `[0]` is whichever connected first, and six
 * signing paths would hand it transactions built for the embedded wallet as
 * both fee payer and authority.
 *
 * It fails closed. No match, or more than one claim, returns `undefined`, which
 * every caller turns into `walletReady: false` — "Waiting for wallet…" and no
 * signature. A blocked signature is recoverable; a signature by the wrong key
 * is not.
 */
export const embeddedOf = <T extends Pickable>(wallets: readonly T[]): T | undefined => {
  const ours = wallets.filter((w) => claimsPrivy(w.standardWallet));
  return ours.length === 1 ? ours[0] : undefined;
};

/**
 * What every signing path and every per-account query key should ask for.
 *
 * Replaces `useWallets().wallets[0]`. Deliberately exposes no list: there is one
 * wallet that is the account, and a caller that wants a different one wants
 * something this hook should not help it do by accident.
 */
export const useEmbeddedWallet = () => {
  const { wallets, ready } = useWallets();
  const wallet = embeddedOf(wallets);
  return { wallet, address: wallet?.address, ready };
};

/**
 * Everything connected that is not the account: wallets somebody attached to
 * fund with.
 *
 * The same filter read the other way, and deliberately the same file — "which
 * wallet is this" is one question, and answering half of it somewhere else is
 * how the two drift back together.
 */
export const fundingOf = <T extends Pickable>(wallets: readonly T[]): readonly T[] =>
  wallets.filter((w) => !claimsPrivy(w.standardWallet));

/**
 * The attached funding wallet, if there is one.
 *
 * One at a time: a second is a choice nobody asked to make, and the first is
 * the one they just connected.
 */
export const useFundingWallet = () => {
  const { wallets, ready } = useWallets();
  const wallet = fundingOf(wallets)[0];
  return { wallet, address: wallet?.address, ready };
};

/**
 * Whether this browser has a wallet somebody could fund from at all.
 *
 * Add cash hides the method when it does not. A row that opens a panel saying
 * "install Phantom" is a choice that cannot be taken, and the file it sits in
 * already makes that argument about its own greyed-out rows: a disabled
 * control invites the click that does nothing.
 *
 * These are the wallets present, not connected — Privy's own is among them,
 * and it is not something anybody funds from.
 */
export const useFundingWalletAvailable = (): boolean => {
  const { wallets } = useStandardWallets();
  return wallets.some((w) => !claimsPrivy(w));
};
