import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import { tokenAccountAddresses } from "./accounts.js";

const ADDRESS = (i: number) => `Wa11et${String(i).padStart(38, "0")}`;
const ACCOUNT = (i: number, n: number) => `Acc0unt${i}${String(n).padStart(36, "0")}`;

const seed = async (count: number) => {
  const db = await testDb();
  for (let i = 0; i < count; i++) {
    const [user] = await db
      .insert(users)
      .values({ privyUserId: `did:privy:u${i}` })
      .returning();
    await db
      .insert(wallets)
      .values({ userId: user!.id, address: ADDRESS(i), kind: "privy_embedded", isPrimary: true });
  }
  return db;
};

/** A node that answers with two accounts per wallet, and records the overlap. */
const node = (failFor: string | null = null) => {
  let inFlight = 0;
  let peak = 0;
  const asked: string[] = [];
  return {
    peak: () => peak,
    asked,
    tokenAccounts: async (owner: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      asked.push(owner);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      if (owner === failFor) throw new Error("the node said no");
      const i = Number(owner.replace(/^Wa11et0*/, "") || "0");
      return [ACCOUNT(i, 1), ACCOUNT(i, 2)];
    },
  };
};

describe("tokenAccountAddresses", () => {
  it("names every account a wallet holds, under that wallet", async () => {
    const db = await seed(1);

    const watched = await tokenAccountAddresses(db, node());

    expect(watched).toEqual([
      { wallet: ADDRESS(0), address: ACCOUNT(0, 1) },
      { wallet: ADDRESS(0), address: ACCOUNT(0, 2) },
    ]);
  });

  it("covers every account on the books", async () => {
    const db = await seed(3);

    const watched = await tokenAccountAddresses(db, node());

    expect(watched).toHaveLength(6);
    expect(new Set(watched.map((w) => w.wallet)).size).toBe(3);
  });

  it("leaves a wallet that is not the account's primary one alone", async () => {
    const db = await seed(1);
    const [row] = await db.select().from(wallets);
    await db
      .insert(wallets)
      .values({ userId: row!.userId, address: ADDRESS(9), kind: "external", isPrimary: false });
    const n = node();

    await tokenAccountAddresses(db, n);

    expect(n.asked).toEqual([ADDRESS(0)]);
  });

  it("keeps the number in flight under a bound, so connections are not dropped", async () => {
    const db = await seed(40);
    const n = node();

    await tokenAccountAddresses(db, n);

    expect(n.peak()).toBeLessThanOrEqual(8);
    expect(n.peak()).toBeGreaterThan(1);
  });

  /*
   * One wallet it could not read must not take the others' subscriptions
   * down with it: a partial list looks to the watcher exactly like wallets
   * that no longer hold anything, and it would let go of them.
   */
  it("refuses to answer at all when a wallet could not be read", async () => {
    const db = await seed(4);

    await expect(tokenAccountAddresses(db, node(ADDRESS(2)))).rejects.toThrow("the node said no");
  });

  it("answers with nothing, and nothing awkward, for no wallets at all", async () => {
    const db = await seed(0);

    await expect(tokenAccountAddresses(db, node())).resolves.toEqual([]);
  });

  it("answers with nothing for a wallet holding nothing yet", async () => {
    const db = await seed(1);

    await expect(tokenAccountAddresses(db, { tokenAccounts: async () => [] })).resolves.toEqual([]);
  });
});
