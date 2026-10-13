import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { fundingIntents, users } from "../db/schema.js";
import { createFundingStore, type NewFundingIntent } from "./store.js";

const setup = async (privyUserId = "did:privy:funder") => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId }).returning();
  return { db, store: createFundingStore(db), userId: user!.id };
};

const intent = (userId: string, over: Partial<NewFundingIntent> = {}): NewFundingIntent => ({
  userId,
  relayRequestId: "0xreq",
  depositAddress: "0xdeposit",
  originChainId: 8453,
  originCurrency: "0x0000000000000000000000000000000000000000",
  recipientAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  quotedOutRaw: "24846825",
  ...over,
});

describe("createFundingStore", () => {
  it("writes an intent as waiting", async () => {
    const { store, userId } = await setup();

    const saved = await store.create(intent(userId));

    expect(saved).toMatchObject({ status: "waiting", inTxHash: null, outTxHash: null });
  });

  it("advances a waiting intent to success", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    const advanced = await store.advance("0xdeposit", {
      status: "success",
      inTxHash: "0xin",
      outTxHash: "0xout",
    });

    expect(advanced).toMatchObject({ status: "success", inTxHash: "0xin", outTxHash: "0xout" });
  });

  it("touches only the unclaimed row on a waiting heartbeat", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));
    await store.advance("0xdeposit", { status: "success", inTxHash: "0xin" });
    await store.create(intent(userId));

    const advanced = await store.advance("0xdeposit", { status: "depositing" });

    /* The claimed row is a settled deposit and must not be walked backwards. */
    expect(advanced?.inTxHash).toBeNull();
    const rows = await store.forUser(userId);
    expect(rows.find((r) => r.inTxHash === "0xin")?.status).toBe("success");
  });

  it("claims the waiting row for the first deposit and makes a new row for the second", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    await store.advance("0xdeposit", { status: "success", inTxHash: "0xfirst" });
    await store.advance("0xdeposit", { status: "success", inTxHash: "0xsecond" });

    const rows = await store.forUser(userId);
    expect(rows.map((r) => r.inTxHash).sort()).toEqual(["0xfirst", "0xsecond"]);
    /* The second deposit inherits the route and the user, which the webhook does not carry. */
    expect(rows.every((r) => r.userId === userId && r.originChainId === 8453)).toBe(true);
  });

  it("is idempotent for a redelivered webhook", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    await store.advance("0xdeposit", { status: "submitted", inTxHash: "0xin" });
    await store.advance("0xdeposit", { status: "success", inTxHash: "0xin" });
    await store.advance("0xdeposit", { status: "success", inTxHash: "0xin" });

    const rows = await store.forUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("success");
  });

  it("records the request id the fill actually landed under", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    /* Relay regenerates the quote on over- or underpayment, and the fill lands
       under a new id while the one we minted stays waiting forever. */
    await store.advance("0xdeposit", {
      status: "success",
      inTxHash: "0xin",
      relayRequestId: "0xregenerated",
    });

    const [row] = await store.forUser(userId);
    expect(row!.relayRequestId).toBe("0xregenerated");
  });

  it("records a failure reason", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    await store.advance("0xdeposit", {
      status: "refund",
      inTxHash: "0xin",
      failReason: "DOUBLE_SPEND",
    });

    const [row] = await store.forUser(userId);
    expect(row).toMatchObject({ status: "refund", failReason: "DOUBLE_SPEND" });
  });

  it("moves updatedAt when it advances", async () => {
    const { db, store, userId } = await setup();
    const saved = await store.create(intent(userId));
    await db
      .update(fundingIntents)
      .set({ updatedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(fundingIntents.id, saved.id));

    const advanced = await store.advance("0xdeposit", { status: "pending" });

    expect(advanced!.updatedAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime());
  });

  it("knows nothing about an address it never minted", async () => {
    const { store } = await setup();

    expect(await store.byDepositAddress("0xunknown")).toBeNull();
    expect(await store.advance("0xunknown", { status: "success", inTxHash: "0xin" })).toBeNull();
  });

  it("never returns another user's deposits", async () => {
    const { db, store, userId } = await setup();
    const [other] = await db.insert(users).values({ privyUserId: "did:privy:someone-else" }).returning();
    await store.create(intent(userId));
    await store.create(intent(other!.id, { depositAddress: "0xtheirs" }));

    const rows = await store.forUser(userId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.depositAddress).toBe("0xdeposit");
  });
});
