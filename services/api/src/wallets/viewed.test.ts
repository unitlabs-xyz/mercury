import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import { VIEWED_EVERY_MS, viewedRecorder } from "./viewed.js";

const T0 = new Date("2026-11-21T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const world = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:v" }).returning();
  await mercuryWallet(db, user!.id, "Mercury");
  await db.insert(wallets).values([
    { userId: user!.id, address: "Phantom", kind: "external", isPrimary: false },
    { userId: user!.id, address: "Gone", kind: "external", isPrimary: false, unlinkedAt: T0 },
  ]);
  const viewedAt = async (address: string) =>
    (await db.select().from(wallets).where(eq(wallets.address, address)))[0]!.lastViewedAt;
  return { db, viewedAt };
};

describe("viewedRecorder", () => {
  it("records when a linked wallet was looked at", async () => {
    const { db, viewedAt } = await world();
    await viewedRecorder(db, { now: () => T0 })("Phantom");
    expect(await viewedAt("Phantom")).toEqual(T0);
  });

  it("moves it at most once an hour, however often it is reported", async () => {
    const { db, viewedAt } = await world();
    let now = T0;
    const seen = viewedRecorder(db, { now: () => now });
    await seen("Phantom");
    now = at(VIEWED_EVERY_MS - 1);
    await seen("Phantom");
    expect(await viewedAt("Phantom")).toEqual(T0);
    now = at(VIEWED_EVERY_MS);
    await seen("Phantom");
    expect(await viewedAt("Phantom")).toEqual(now);
  });

  it("holds to the hour across processes, each with its own memory", async () => {
    const { db, viewedAt } = await world();
    await viewedRecorder(db, { now: () => T0 })("Phantom");
    await viewedRecorder(db, { now: () => at(60_000) })("Phantom");
    expect(await viewedAt("Phantom")).toEqual(T0);
  });

  it("leaves the Mercury wallet and an unlinked wallet alone", async () => {
    const { db, viewedAt } = await world();
    const seen = viewedRecorder(db, { now: () => T0 });
    await seen("Mercury");
    await seen("Gone");
    expect(await viewedAt("Mercury")).toBeNull();
    expect(await viewedAt("Gone")).toBeNull();
  });

  it("records a wallet linked again within the hour it was last seen unlinked", async () => {
    const { db, viewedAt } = await world();
    let now = T0;
    const seen = viewedRecorder(db, { now: () => now });
    // Seen while unlinked (mid-unlink, say): nothing written, and nothing remembered.
    await seen("Gone");
    await db.update(wallets).set({ unlinkedAt: null }).where(eq(wallets.address, "Gone"));
    now = at(60_000);
    await seen("Gone");
    expect(await viewedAt("Gone")).toEqual(now);
  });

  it("remembers nothing when the write failed, so the next viewing writes it", async () => {
    const { db, viewedAt } = await world();
    let failing = true;
    const flaky = new Proxy(db, {
      get: (target, key, receiver) =>
        key === "update" && failing
          ? () => {
              throw new Error("database busy");
            }
          : Reflect.get(target, key, receiver),
    });
    let now = T0;
    const seen = viewedRecorder(flaky, { now: () => now });
    await expect(seen("Phantom")).rejects.toThrow("database busy");
    failing = false;
    now = at(60_000);
    await seen("Phantom");
    expect(await viewedAt("Phantom")).toEqual(now);
  });
});
