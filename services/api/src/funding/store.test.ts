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
  originChainId: 8453,
  originCurrency: "0x0000000000000000000000000000000000000000",
  originChainName: "base",
  originCurrencySymbol: "ETH",
  recipientAddress: "PrivyWallet111",
  quotedOutRaw: "24846825",
  ...over,
});

describe("createFundingStore", () => {
  it("writes an intent as waiting", async () => {
    const { store, userId } = await setup();

    const saved = await store.create(intent(userId));

    expect(saved).toMatchObject({ status: "waiting", inTxHash: null, outTxHash: null });
  });

  /* Relay holds the fee as one balance; this row is what says which deposit each part came from. */
  it("keeps Mercury's fee on the deposit it was charged on", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId, { mercuryFeeUsd: "0.070814" }));
    expect(Number((await store.byId(userId, saved.id))!.mercuryFeeUsd)).toBe(0.070814);
  });

  it("records no fee on a deposit that was charged none", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));
    expect(saved.mercuryFeeUsd).toBeNull();
  });

  it("reads one back by id, and only the owner's", async () => {
    const { db, store, userId } = await setup();
    const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
    const saved = await store.create(intent(userId));

    expect((await store.byId(userId, saved.id))?.id).toBe(saved.id);
    expect(await store.byId(other!.id, saved.id)).toBeNull();
  });

  it("never returns another user's deposits", async () => {
    const { db, store, userId } = await setup();
    const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
    await store.create(intent(userId));
    await store.create(intent(other!.id, { relayRequestId: "0xtheirs" }));

    const rows = await store.forUser(userId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.relayRequestId).toBe("0xreq");
  });
});

describe("createFundingStore · markSubmitted, which is only a report", () => {
  it("moves a waiting deposit to submitted and records the hashes", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));

    const marked = await store.markSubmitted(userId, saved.id, {
      inTxHash: "0xorigin",
      outTxHash: "0xdestination",
    });

    expect(marked).toMatchObject({
      status: "submitted",
      inTxHash: "0xorigin",
      outTxHash: "0xdestination",
    });
  });

  it("cannot reopen a deposit Relay has already settled", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));
    await store.settle("0xreq", { status: "success", outTxHash: "0xfill" });

    /* A late or repeated report must not walk a finished deposit backwards. */
    expect(await store.markSubmitted(userId, saved.id, { inTxHash: "0xorigin" })).toBeNull();
    expect((await store.byId(userId, saved.id))?.status).toBe("success");
  });

  it.each(["failure", "refund"] as const)("cannot reopen a %s either", async (status) => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));
    await store.settle("0xreq", { status });

    expect(await store.markSubmitted(userId, saved.id, { inTxHash: "0x1" })).toBeNull();
  });

  it("will not touch another user's deposit", async () => {
    const { db, store, userId } = await setup();
    const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
    const saved = await store.create(intent(userId));

    /* The id arrives in a request body; scoping by user is what makes that safe. */
    expect(await store.markSubmitted(other!.id, saved.id, { inTxHash: "0x1" })).toBeNull();
    expect((await store.byId(userId, saved.id))?.status).toBe("waiting");
  });

  it("is idempotent, because a client may report twice", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));

    await store.markSubmitted(userId, saved.id, { inTxHash: "0x1" });
    await store.markSubmitted(userId, saved.id, { inTxHash: "0x1" });

    expect(await store.forUser(userId)).toHaveLength(1);
  });

  it("has no way to write a terminal status, by construction", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));

    await store.markSubmitted(userId, saved.id, { inTxHash: "0x1", outTxHash: "0x2" });

    /*
     * The whole point. The hash a client holds proves a transaction landed
     * somewhere, not that it was this deposit — and on an EVM origin it proves
     * only the first of two legs. Only Relay's signed webhook settles.
     */
    expect((await store.byId(userId, saved.id))?.status).toBe("submitted");
  });
});

describe("createFundingStore · settle, which is Relay's word", () => {
  it("writes the terminal status and the fill", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    const settled = await store.settle("0xreq", {
      status: "success",
      inTxHash: "0xorigin",
      outTxHash: "0xfill",
    });

    expect(settled).toMatchObject({ status: "success", outTxHash: "0xfill" });
  });

  it("records a refund and its reason", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    const settled = await store.settle("0xreq", { status: "refund", failReason: "DOUBLE_SPEND" });

    expect(settled).toMatchObject({ status: "refund", failReason: "DOUBLE_SPEND" });
  });

  it("is idempotent for a redelivered webhook", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    await store.settle("0xreq", { status: "success", outTxHash: "0xfill" });
    await store.settle("0xreq", { status: "success", outTxHash: "0xfill" });

    const rows = await store.forUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("success");
  });

  it("knows nothing about a request id it never minted", async () => {
    const { store } = await setup();

    expect(await store.byRequestId("0xnever")).toBeNull();
    expect(await store.settle("0xnever", { status: "success" })).toBeNull();
  });

  it("finds a row by the id Relay quoted", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    expect((await store.byRequestId("0xreq"))?.userId).toBe(userId);
  });
});

describe("createFundingStore · unsettled, for the poller", () => {
  const future = () => new Date(Date.now() + 60_000);

  it("returns deposits Relay has not settled", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    const open = await store.unsettled(future(), 10);

    expect(open.map((r) => r.relayRequestId)).toEqual(["0xreq"]);
  });

  it("leaves settled deposits alone", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));
    await store.settle("0xreq", { status: "success" });

    expect(await store.unsettled(future(), 10)).toEqual([]);
  });

  it("includes a submitted deposit, which is the case it exists for", async () => {
    const { store, userId } = await setup();
    const saved = await store.create(intent(userId));
    await store.markSubmitted(userId, saved.id, { inTxHash: "0x1" });

    /* The browser said it executed; Relay has not confirmed. That gap is
       exactly what the poller closes when a webhook never arrives. */
    expect(await store.unsettled(future(), 10)).toHaveLength(1);
  });

  it("ignores anything touched more recently than the cutoff", async () => {
    const { store, userId } = await setup();
    await store.create(intent(userId));

    expect(await store.unsettled(new Date(Date.now() - 60_000), 10)).toEqual([]);
  });

  it("honours its limit, oldest attention first", async () => {
    const { db, store, userId } = await setup();
    for (const id of ["0xa", "0xb", "0xc"]) await store.create(intent(userId, { relayRequestId: id }));
    await db
      .update(fundingIntents)
      .set({ updatedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(fundingIntents.relayRequestId, "0xb"));

    const open = await store.unsettled(future(), 1);

    expect(open.map((r) => r.relayRequestId)).toEqual(["0xb"]);
  });
});
