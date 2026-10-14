import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users } from "../db/schema.js";
import { createFundingStore } from "./store.js";
import { enrichDepositActivity, reconcileFundingDeposits } from "./enrich.js";

const FILL = "5".repeat(88);
const REQUEST = "0xreq";

const setup = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:funder" }).returning();
  const store = createFundingStore(db);
  const intent = await store.create({
    userId: user!.id,
    relayRequestId: "0xreq",
    originChainId: 728126428,
    originCurrency: "TR7NHq",
    originChainName: "tron",
    originCurrencySymbol: "USDT",
    recipientAddress: "PrivyWallet111",
    quotedOutRaw: "9990000",
  });
  return { db, store, userId: user!.id, intent };
};

/** What wallet-events writes when it sees the USDC land. */
const generic = (userId: string) => ({
  userId,
  kind: "transfer_in" as const,
  title: "Added cash",
  amountUsd: "9.99",
  txSignature: FILL,
  mint: USDC_MINT,
});

const feed = (db: Awaited<ReturnType<typeof testDb>>, userId: string) =>
  db.select().from(activities).where(eq(activities.userId, userId));

describe("enrichDepositActivity", () => {
  it("names the origin on the row wallet-events already wrote", async () => {
    const { db, store, userId } = await setup();
    await db.insert(activities).values(generic(userId));
    const advanced = await store.settle(REQUEST, {
      status: "success",
      inTxHash: "0xin",
      outTxHash: FILL,
    });

    expect(await enrichDepositActivity(db, advanced!)).toBe(true);

    const [row] = await feed(db, userId);
    expect(row).toMatchObject({ subtitle: "USDT from tron", refTable: "funding_intent" });
  });

  it("leaves the amount and the kind alone", async () => {
    const { db, store, userId } = await setup();
    await db.insert(activities).values(generic(userId));
    const advanced = await store.settle(REQUEST, {
      status: "success",
      inTxHash: "0xin",
      outTxHash: FILL,
    });

    await enrichDepositActivity(db, advanced!);

    const [row] = await feed(db, userId);
    /* wallet-events read the amount off the chain; that is the fact. And
       portfolio/queries.ts reads `kind` for the flow sign, so changing it
       would move the performance line. */
    expect(row!.amountUsd).toBe("9.990000000000000000");
    expect(row!.kind).toBe("transfer_in");
  });

  it("writes nothing when wallet-events has not seen the fill yet", async () => {
    const { db, store, userId } = await setup();
    const advanced = await store.settle(REQUEST, {
      status: "success",
      inTxHash: "0xin",
      outTxHash: FILL,
    });

    /* Never an insert. The delivered amount is only knowable from the chain,
       and inserting the indicative quote would put a made-up number into the
       performance line, which reads transfer_in as money in. */
    expect(await enrichDepositActivity(db, advanced!)).toBe(false);
    expect(await feed(db, userId)).toHaveLength(0);
  });

  it("does nothing twice", async () => {
    const { db, store, userId } = await setup();
    await db.insert(activities).values(generic(userId));
    const advanced = await store.settle(REQUEST, {
      status: "success",
      inTxHash: "0xin",
      outTxHash: FILL,
    });

    await enrichDepositActivity(db, advanced!);
    await enrichDepositActivity(db, advanced!);

    const rows = await feed(db, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subtitle).toBe("USDT from tron");
  });

  it("leaves a row that is no longer generic alone", async () => {
    const { db, store, userId } = await setup();
    await db
      .insert(activities)
      .values({ ...generic(userId), kind: "buy", title: "Bought NVDA", subtitle: "something better" });
    const advanced = await store.settle(REQUEST, {
      status: "success",
      inTxHash: "0xin",
      outTxHash: FILL,
    });

    expect(await enrichDepositActivity(db, advanced!)).toBe(false);

    const [row] = await feed(db, userId);
    expect(row!.subtitle).toBe("something better");
  });

  it("does nothing for a deposit with no fill transaction", async () => {
    const { db, store, userId } = await setup();
    await db.insert(activities).values(generic(userId));
    const advanced = await store.settle(REQUEST, { status: "pending", inTxHash: "0xin" });

    expect(await enrichDepositActivity(db, advanced!)).toBe(false);
  });
});

describe("reconcileFundingDeposits", () => {
  it("enriches every landed deposit whose feed row has arrived since", async () => {
    const { db, store, userId } = await setup();
    await store.settle(REQUEST, { status: "success", inTxHash: "0xin", outTxHash: FILL });
    /* The order the real system runs in: the webhook lands first, wallet-events
       writes the generic row on its next pass, and this closes the gap. */
    await db.insert(activities).values(generic(userId));

    expect(await reconcileFundingDeposits(db)).toBe(1);

    const [row] = await feed(db, userId);
    expect(row!.subtitle).toBe("USDT from tron");
  });

  it("is free to run when there is nothing to do", async () => {
    const { db } = await setup();
    expect(await reconcileFundingDeposits(db)).toBe(0);
    expect(await reconcileFundingDeposits(db)).toBe(0);
  });

  it("ignores a deposit that has not landed", async () => {
    const { db, store, userId } = await setup();
    await store.settle(REQUEST, { status: "pending", inTxHash: "0xin" });
    await db.insert(activities).values(generic(userId));

    expect(await reconcileFundingDeposits(db)).toBe(0);
  });
});
