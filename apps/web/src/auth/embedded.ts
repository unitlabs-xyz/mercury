import { useWallets } from "@privy-io/react-auth/solana";

/** Only what picking reads, so the pure half needs no Privy class to test. */
interface Pickable {
  readonly standardWallet: unknown;
}

/**
 * Privy's own Solana wallet, which marks itself and is the only one that does.
 *
 * This check used to carry weight it should not have. Privy's `useWallets()`
 * returned the account wallet and every connected funding wallet in one list,
 * so telling them apart meant sniffing a getter off a prototype — and
 * `embeddedOf` failing closed meant a second wallet claiming to be Privy's
 * could take account signing offline.
 *
 * Funding wallets come from AppKit now and never appear in this list, so there
 * is nothing left to confuse the account with. The check stays because the
 * list is still Privy's and still plural in principle, but it is no longer the
 * only thing standing between two kinds of wallet. See
 * docs/adr/0014-relay-funding.md.
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
