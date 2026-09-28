import type { ChainHistory, SignatureRef } from "@mercury/chain";

/** What the node will return in one call. Its own maximum. */
const PAGE = 100;

export interface StreamWalk {
  /** Oldest first, failures removed. */
  readonly signatures: readonly SignatureRef[];
  /** Where to move the cursor, once the writes commit. Null on an empty address. */
  readonly newestSignature: string | null;
}

export interface WalkOptions {
  /**
   * Walk the address's full history instead of baselining on first sight.
   *
   * First-sighting is right for a wallet's own address: a Privy wallet has no
   * history to lose, and an external one's years of it are out of scope per
   * ADR 0003. A token account the job itself just discovered is neither —
   * its history is bounded and minutes old by construction, so baselining it
   * would drop the very deposit that funded it.
   */
  readonly backfill?: boolean;
}

/**
 * Every signature on one address since `cursor`, or its whole history when
 * `backfill` is set and there is no cursor yet.
 *
 * The paging loop is the whole point. `getSignaturesForAddress` returns at most
 * `limit` signatures, newest first, so if more than a page has happened since
 * the cursor the older ones are simply absent from the response. Advancing the
 * cursor to the newest of that page would step over them and lose them
 * permanently. Paging back with `before` until a short page arrives is what
 * makes the walk gap-free, which is the property the whole design rests on.
 *
 * Oldest-first out, because a crash part way through a pass should leave the
 * cursor behind and replay a little, rather than leave a hole.
 */
export async function walkStream(
  history: ChainHistory,
  address: string,
  cursor: string | null,
  options: WalkOptions = {},
): Promise<StreamWalk> {
  if (cursor === null && options.backfill !== true) {
    // First sight: note where we are and emit nothing.
    const page = await history.signatures(address, { limit: 1 });
    return { signatures: [], newestSignature: page[0]?.signature ?? null };
  }

  const collected: SignatureRef[] = [];
  let before: string | undefined;

  for (;;) {
    const page = await history.signatures(address, {
      limit: PAGE,
      ...(cursor === null ? {} : { until: cursor }),
      ...(before === undefined ? {} : { before }),
    });
    collected.push(...page);
    if (page.length < PAGE) break;
    const oldest = page[page.length - 1];
    if (oldest === undefined) break;
    before = oldest.signature;
  }

  return {
    // The cursor advances past a failure too. It moved nothing, and leaving the
    // cursor behind it would retry it on every pass forever.
    newestSignature: collected[0]?.signature ?? null,
    signatures: collected.filter((s) => !s.failed).reverse(),
  };
}
