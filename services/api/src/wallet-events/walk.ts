import type { ChainHistory, SignatureRef } from "@mercury/chain";

/** What the node will return in one call. Its own maximum. */
const PAGE = 100;

export interface StreamWalk {
  /** Oldest first, failures removed. */
  readonly signatures: readonly SignatureRef[];
  /** Where to move the cursor, once the writes commit. Null on an empty address. */
  readonly newestSignature: string | null;
}

/**
 * Every signature on one address since `cursor`.
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
): Promise<StreamWalk> {
  if (cursor === null) {
    // First sight: note where we are and emit nothing. A wallet Privy created
    // during sign-up has no history to lose, and an external wallet with years
    // of it is out of scope in v1 per ADR 0003.
    const page = await history.signatures(address, { limit: 1 });
    return { signatures: [], newestSignature: page[0]?.signature ?? null };
  }

  const collected: SignatureRef[] = [];
  let before: string | undefined;

  for (;;) {
    const page = await history.signatures(address, {
      limit: PAGE,
      until: cursor,
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
