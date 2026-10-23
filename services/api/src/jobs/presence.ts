/**
 * Who is using the app right now, by wallet.
 *
 * Fed by the auth middleware on every signed-in request. What it is for: a
 * job that has to be quick for the person watching (a deposit landing while
 * they look) does not have to be quick for everyone else, and reading
 * everyone every two seconds is what the RPC plan refused.
 *
 * Memory, and one process, like the build record: a restart forgets who is
 * here, and their next request tells it again.
 */
export interface Presence {
  seen(wallet: string): void;
  here(wallet: string): boolean;
}

export const presence = (
  opts: { readonly windowMs?: number; readonly now?: () => number } = {},
): Presence => {
  const windowMs = opts.windowMs ?? 2 * 60_000;
  const now = opts.now ?? Date.now;
  const last = new Map<string, number>();
  return {
    seen(wallet) {
      const at = now();
      last.set(wallet, at);
      // Bounded by who has been here lately, not by everyone who ever was.
      if (last.size > 1_000) for (const [w, t] of last) if (at - t >= windowMs) last.delete(w);
    },
    here(wallet) {
      const at = last.get(wallet);
      return at !== undefined && now() - at < windowMs;
    },
  };
};

/** A wallet's own spot in a window of `ms`: the same every time, spread across wallets. */
const spot = (wallet: string, ms: number) => {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  return h % ms;
};

/**
 * Which wallets a frequent job reads this pass: a wallet whose owner is here,
 * on every pass; anyone else's once per `idleMs`. A deposit from an exchange
 * while its owner is away shows within a minute; one they are watching, within
 * the job's own interval.
 *
 * A wallet not read yet is first due at its own spot in the first idle window,
 * not at once. At boot every wallet is unread, and reading all seventeen on
 * the first pass is what the node refused (22 October 2026).
 */
export const cadence = (opts: {
  readonly here: Pick<Presence, "here">;
  readonly idleMs?: number;
  readonly now?: () => number;
  /** Where in the first window a wallet is first due. A stable hash of the address when left out. */
  readonly spread?: (wallet: string) => number;
}) => {
  const idleMs = opts.idleMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const spotOf = opts.spread ?? ((wallet: string) => spot(wallet, idleMs));
  const startedAt = now();
  const lastRead = new Map<string, number>();
  return {
    due: (wallet: string) => {
      if (opts.here.here(wallet)) return true;
      const last = lastRead.get(wallet);
      return last === undefined ? now() - startedAt >= spotOf(wallet) : now() - last >= idleMs;
    },
    read: (wallet: string) => void lastRead.set(wallet, now()),
    spotOf,
  };
};
