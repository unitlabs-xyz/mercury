import type { ChainHistory, SignatureRef } from "@mercury/chain";

/** What the node will return in one call. Its own maximum. */
const PAGE = 100;

/**
 * Pages to walk back before giving up. 5,000 signatures.
 *
 * `until` is only honoured if the cursor is actually found before the limit.
 * A cursor that has aged out of the node's address index is simply never
 * found, and the loop then pages back through the address's entire history —
 * still finite, so this is a cost problem rather than a spin, but one pass
 * has no business reading one address's whole history serially while every
 * other wallet waits behind it.
 */
const MAX_PAGES = 50;

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
  /**
   * What to call this stream if the page cap throws. Never the address
   * itself: the error is logged by the caller's caller next to a `userId`
   * (see sync.ts), and an address in a log is a person's holdings in a log.
   */
  readonly label?: string;
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
 * Oldest-first out. Not for crash safety — the caller's insert is one
 * statement inside one transaction, so a crash mid-pass rolls the whole
 * thing back rather than leaving a hole — but so a stream's history is
 * processed in the order it actually happened.
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
  let pages = 0;

  for (;;) {
    const page = await history.signatures(address, {
      limit: PAGE,
      ...(cursor === null ? {} : { until: cursor }),
      ...(before === undefined ? {} : { before }),
    });
    collected.push(...page);
    pages += 1;
    if (page.length < PAGE) break;
    if (pages === MAX_PAGES) {
      throw new Error(
        `walkStream: ${options.label ?? "a stream"} did not converge within ${MAX_PAGES} pages ` +
          `(${MAX_PAGES * PAGE} signatures) — the cursor may have aged out of the node's index`,
      );
    }
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
