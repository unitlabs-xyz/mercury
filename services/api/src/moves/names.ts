/** A wallet as a move's feed rows name it. */
export interface NamedWallet {
  readonly label: string | null;
  readonly address: string;
  readonly isPrimary: boolean;
}

/** "your Mercury wallet", the name the person gave a linked wallet, or its short address. */
export const walletPhrase = (w: NamedWallet | undefined): string =>
  w === undefined
    ? "another of your wallets"
    : w.isPrimary
      ? "your Mercury wallet"
      : (w.label ?? `${w.address.slice(0, 4)}…${w.address.slice(-4)}`);

/**
 * What a move between two of a person's wallets says in each one's feed:
 * "Moved to your Mercury wallet" where it left, "Moved from Phantom main"
 * where it arrived. A move is neither money sent nor money added.
 */
export const moveTitles = (
  from: NamedWallet | undefined,
  to: NamedWallet | undefined,
): { readonly out: string; readonly in: string } => ({
  out: `Moved to ${walletPhrase(to)}`,
  in: `Moved from ${walletPhrase(from)}`,
});
