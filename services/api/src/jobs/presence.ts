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

/**
 * Which wallets a frequent job reads this pass: a wallet whose owner is here,
 * on every pass; anyone else's once per `idleMs`. A deposit from an exchange
 * while its owner is away shows within a minute; one they are watching, within
 * the job's own interval.
 */
export const cadence = (opts: {
  readonly here: Pick<Presence, "here">;
  readonly idleMs?: number;
  readonly now?: () => number;
}) => {
  const idleMs = opts.idleMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const lastRead = new Map<string, number>();
  return {
    due: (wallet: string) =>
      opts.here.here(wallet) || now() - (lastRead.get(wallet) ?? Number.NEGATIVE_INFINITY) >= idleMs,
    read: (wallet: string) => void lastRead.set(wallet, now()),
  };
};
