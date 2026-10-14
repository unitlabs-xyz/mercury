import type { RelayClient, RelayStatus } from "./relay.js";
import type { FundingStore } from "./store.js";

/**
 * Ask Relay about deposits it has not told us about.
 *
 * The webhook is the fast path and this is the same authority over a different
 * transport. Relay settles a deposit either way — what differs is whether they
 * push or we pull — so there is one source of truth and two ways of hearing
 * it. Without this, a webhook that was never enabled, or one delivery that got
 * lost, would leave somebody's deposit reading `submitted` for ever with their
 * money already spent.
 *
 * Only rows nothing has touched for a while, so this never races the webhook
 * over a deposit that is merely in flight: a cross-chain fill takes about a
 * second, and Bitcoin — the one case that takes an hour — is not offered.
 */

const TERMINAL: readonly RelayStatus[] = ["success", "failure", "refund"];

export interface PollDeps {
  readonly store: FundingStore;
  readonly relay: RelayClient;
  /** How long a deposit may sit untouched before we go and ask. */
  readonly staleMs?: number;
  /** A ceiling per pass, so a backlog cannot turn into a long request storm. */
  readonly limit?: number;
  readonly now?: () => number;
}

export interface PollSummary {
  readonly asked: number;
  readonly settled: number;
  readonly failed: number;
}

export const pollUnsettledDeposits = async (deps: PollDeps): Promise<PollSummary> => {
  const now = (deps.now ?? Date.now)();
  const open = await deps.store.unsettled(new Date(now - (deps.staleMs ?? 90_000)), deps.limit ?? 25);

  let settled = 0;
  let failed = 0;
  for (const intent of open) {
    try {
      const status = await deps.relay.status(intent.relayRequestId);
      /*
       * Only a terminal answer is worth writing. Relay reporting `pending`
       * again tells us nothing the row does not already say, and writing it
       * would move `updatedAt` and so push the row out of the next pass's
       * window — the one place this could quietly stop working.
       */
      if (status === null || !TERMINAL.includes(status)) continue;
      await deps.store.settle(intent.relayRequestId, { status });
      settled += 1;
    } catch (error: unknown) {
      /* One deposit we could not ask about is not a failed pass. The next one
         tries again, because nothing moved. */
      failed += 1;
      console.error(`funding-poll: could not read status for user ${intent.userId}`, error);
    }
  }

  return { asked: open.length, settled, failed };
};
