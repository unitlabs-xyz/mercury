/**
 * One answer per wallet, kept for `ttlMs`: for a read that walks the chain and
 * changes slowly, such as a wallet's baskets made outside Mercury. A failure
 * is not kept, so the next look tries again. Memory, in one process, as the
 * API is.
 */
export const remembered = <W extends { readonly walletId: string }, T>(
  ttlMs: number,
  load: (wallet: W) => Promise<T>,
  now: () => number = Date.now,
): ((wallet: W) => Promise<T>) => {
  const kept = new Map<string, { at: number; value: Promise<T> }>();
  return (wallet) => {
    const hit = kept.get(wallet.walletId);
    if (hit !== undefined && now() - hit.at < ttlMs) return hit.value;
    const value = load(wallet);
    value.catch(() => kept.delete(wallet.walletId));
    kept.set(wallet.walletId, { at: now(), value });
    return value;
  };
};
