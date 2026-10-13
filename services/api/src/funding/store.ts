import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { fundingIntents, type FundingIntent } from "../db/schema.js";
import type { RelayStatus } from "./relay.js";

export interface NewFundingIntent {
  readonly userId: string;
  readonly relayRequestId: string;
  readonly depositAddress: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  readonly recipientAddress: string;
  readonly quotedOutRaw: string | null;
}

export interface FundingAdvance {
  readonly status: RelayStatus;
  readonly inTxHash?: string | undefined;
  readonly outTxHash?: string | undefined;
  readonly failReason?: string | undefined;
  readonly relayRequestId?: string | undefined;
}

export interface FundingStore {
  create(row: NewFundingIntent): Promise<FundingIntent>;
  byDepositAddress(address: string): Promise<FundingIntent | null>;
  advance(address: string, patch: FundingAdvance): Promise<FundingIntent | null>;
  forUser(userId: string): Promise<readonly FundingIntent[]>;
}

export const createFundingStore = (db: Db): FundingStore => {
  const byDepositAddress = async (address: string): Promise<FundingIntent | null> => {
    const [row] = await db
      .select()
      .from(fundingIntents)
      .where(eq(fundingIntents.depositAddress, address))
      .orderBy(desc(fundingIntents.createdAt))
      .limit(1);
    return row ?? null;
  };

  return {
    async create(row) {
      const [saved] = await db
        .insert(fundingIntents)
        .values({ ...row })
        .returning();
      if (saved === undefined) throw new Error("funding intent was not written");
      return saved;
    },

    byDepositAddress,

    /**
     * Move a deposit forward, by address and origin transaction.
     *
     * Three cases, each one statement rather than a read followed by a write,
     * because two webhook deliveries can arrive at once.
     *
     * The unclaimed row — `in_tx_hash is null` — is the one we minted and
     * nobody has deposited against yet. The first delivery carrying a
     * transaction claims it. A later delivery naming the same transaction
     * updates that same row, because the unique index on
     * `(deposit_address, in_tx_hash)` makes it the same row. A delivery naming
     * a *different* transaction is a second deposit to a reusable open
     * address, and gets a row of its own copied from the first.
     *
     * A delivery with no transaction at all is a `waiting` heartbeat, and
     * touches only the unclaimed row — advancing a claimed one would walk a
     * settled deposit backwards.
     */
    async advance(address, patch) {
      const set = {
        status: patch.status,
        updatedAt: new Date(),
        ...(patch.inTxHash === undefined ? {} : { inTxHash: patch.inTxHash }),
        ...(patch.outTxHash === undefined ? {} : { outTxHash: patch.outTxHash }),
        ...(patch.failReason === undefined ? {} : { failReason: patch.failReason }),
        ...(patch.relayRequestId === undefined ? {} : { relayRequestId: patch.relayRequestId }),
      };

      const claimUnclaimed = async (): Promise<FundingIntent | undefined> => {
        const [row] = await db
          .update(fundingIntents)
          .set(set)
          .where(and(eq(fundingIntents.depositAddress, address), isNull(fundingIntents.inTxHash)))
          .returning();
        return row;
      };

      if (patch.inTxHash === undefined) return (await claimUnclaimed()) ?? null;

      const claimed = await claimUnclaimed();
      if (claimed !== undefined) return claimed;

      const [existing] = await db
        .update(fundingIntents)
        .set(set)
        .where(and(eq(fundingIntents.depositAddress, address), eq(fundingIntents.inTxHash, patch.inTxHash)))
        .returning();
      if (existing !== undefined) return existing;

      /*
       * A second deposit to a reusable address. Copied from the most recent row
       * for it, because the webhook carries neither the user nor the route.
       */
      const previous = await byDepositAddress(address);
      if (previous === null) return null;
      const [made] = await db
        .insert(fundingIntents)
        .values({
          userId: previous.userId,
          relayRequestId: patch.relayRequestId ?? previous.relayRequestId,
          depositAddress: address,
          originChainId: previous.originChainId,
          originCurrency: previous.originCurrency,
          recipientAddress: previous.recipientAddress,
          /* Not the first deposit's figure: that was quoted for a different amount. */
          quotedOutRaw: null,
          ...set,
        })
        .onConflictDoNothing({
          target: [fundingIntents.depositAddress, fundingIntents.inTxHash],
        })
        .returning();
      return made ?? (await byDepositAddress(address));
    },

    async forUser(userId) {
      return db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.userId, userId))
        .orderBy(desc(fundingIntents.createdAt));
    },
  };
};
