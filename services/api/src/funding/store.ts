import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { fundingIntents, type FundingIntent } from "../db/schema.js";
import type { RelayStatus } from "./relay.js";

export interface NewFundingIntent {
  readonly userId: string;
  readonly relayRequestId: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  /** As named to the user, so the feed can describe the deposit later. */
  readonly originChainName: string;
  readonly originCurrencySymbol: string;
  readonly recipientAddress: string;
  readonly quotedOutRaw: string | null;
  /** Mercury's fee in the quote, in dollars, as Relay reported it. Null when none was charged. */
  readonly mercuryFeeUsd?: string | null;
}

export interface FundingSettlement {
  readonly status: RelayStatus;
  readonly inTxHash?: string | undefined;
  readonly outTxHash?: string | undefined;
  readonly failReason?: string | undefined;
}

/**
 * Statuses a deposit can still move on from.
 *
 * `submitted` is in the list because Relay walks through it on the way to a
 * fill, and because a client reporting twice must not be an error. `success`,
 * `failure` and `refund` are not: those are Relay's final word and nothing
 * reopens them.
 */
const OPEN: readonly RelayStatus[] = ["waiting", "depositing", "pending", "submitted"];

export interface FundingStore {
  create(row: NewFundingIntent): Promise<FundingIntent>;
  byId(userId: string, id: string): Promise<FundingIntent | null>;
  forUser(userId: string): Promise<readonly FundingIntent[]>;
  /**
   * What the browser reports after running a quote: the hashes, and nothing
   * about whether it worked.
   *
   * Deliberately cannot set a terminal status. The hash a client holds proves
   * a transaction landed somewhere, not that it was this deposit — and on an
   * EVM origin it proves only the first of two legs. A tracking table a client
   * can write `success` into is not tracking.
   */
  markSubmitted(
    userId: string,
    id: string,
    hashes: { readonly inTxHash?: string | undefined; readonly outTxHash?: string | undefined },
  ): Promise<FundingIntent | null>;
  byRequestId(requestId: string): Promise<FundingIntent | null>;
  /**
   * Relay's verdict. The only writer of a terminal status.
   *
   * Not scoped by user: the caller is Relay, which has no session, and the
   * request id is one we minted and handed to nobody else.
   */
  settle(requestId: string, patch: FundingSettlement): Promise<FundingIntent | null>;
  /** Deposits Relay has not settled, oldest attention first, for the poller. */
  unsettled(olderThan: Date, limit: number): Promise<readonly FundingIntent[]>;
}

export const createFundingStore = (db: Db): FundingStore => ({
  async create(row) {
    const [saved] = await db
      .insert(fundingIntents)
      .values({ ...row })
      .returning();
    if (saved === undefined) throw new Error("funding intent was not written");
    return saved;
  },

  async byId(userId, id) {
    const [row] = await db
      .select()
      .from(fundingIntents)
      .where(and(eq(fundingIntents.id, id), eq(fundingIntents.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async forUser(userId) {
    return db
      .select()
      .from(fundingIntents)
      .where(eq(fundingIntents.userId, userId))
      .orderBy(desc(fundingIntents.createdAt));
  },

  async markSubmitted(userId, id, hashes) {
    const [row] = await db
      .update(fundingIntents)
      .set({
        status: "submitted",
        updatedAt: new Date(),
        ...(hashes.inTxHash === undefined ? {} : { inTxHash: hashes.inTxHash }),
        ...(hashes.outTxHash === undefined ? {} : { outTxHash: hashes.outTxHash }),
      })
      /* Scoped by user, because the id arrives in a request body; and scoped
         to an open status, so a late report cannot walk a settled deposit
         backwards. */
      .where(
        and(
          eq(fundingIntents.id, id),
          eq(fundingIntents.userId, userId),
          inArray(fundingIntents.status, [...OPEN]),
        ),
      )
      .returning();
    return row ?? null;
  },

  async byRequestId(requestId) {
    const [row] = await db
      .select()
      .from(fundingIntents)
      .where(eq(fundingIntents.relayRequestId, requestId))
      .limit(1);
    return row ?? null;
  },

  async settle(requestId, patch) {
    const [row] = await db
      .update(fundingIntents)
      .set({
        status: patch.status,
        updatedAt: new Date(),
        ...(patch.inTxHash === undefined ? {} : { inTxHash: patch.inTxHash }),
        ...(patch.outTxHash === undefined ? {} : { outTxHash: patch.outTxHash }),
        ...(patch.failReason === undefined ? {} : { failReason: patch.failReason }),
      })
      .where(eq(fundingIntents.relayRequestId, requestId))
      .returning();
    return row ?? null;
  },

  async unsettled(olderThan, limit) {
    return db
      .select()
      .from(fundingIntents)
      .where(and(inArray(fundingIntents.status, [...OPEN]), lt(fundingIntents.updatedAt, olderThan)))
      .orderBy(fundingIntents.updatedAt)
      .limit(limit);
  },
});
