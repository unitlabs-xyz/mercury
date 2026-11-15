import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { users, walletStreams, wallets } from "../db/schema.js";
import { streamAddresses } from "./streams.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const USDC_ACCOUNT = "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQfuzkt";

const seed = async (addresses: readonly string[]) => {
  const db = await testDb();
  for (const [i, address] of addresses.entries()) {
    const [user] = await db
      .insert(users)
      .values({ privyUserId: `did:privy:u${i}` })
      .returning();
    await db.insert(wallets).values({ userId: user!.id, address, kind: "privy_embedded" });
  }
  return db;
};

const streamFor = async (db: Awaited<ReturnType<typeof testDb>>, wallet: string, address: string) => {
  const [row] = await db.select().from(wallets).where(eq(wallets.address, wallet));
  await db.insert(walletStreams).values({ walletId: row!.id, address });
};

describe("streamAddresses", () => {
  it("watches a wallet's own address before it has any stream at all", async () => {
    const db = await seed([WALLET]);

    await expect(streamAddresses(db)).resolves.toEqual([{ wallet: WALLET, address: WALLET }]);
  });

  it("watches every stream a wallet has, under that wallet", async () => {
    const db = await seed([WALLET]);
    await streamFor(db, WALLET, WALLET);
    await streamFor(db, WALLET, USDC_ACCOUNT);

    const watched = await streamAddresses(db);

    expect(watched).toHaveLength(2);
    expect(watched.map((w) => w.address).sort()).toEqual([USDC_ACCOUNT, WALLET].sort());
    expect(watched.every((w) => w.wallet === WALLET)).toBe(true);
  });

  it("names an address once, however many ways it is reached", async () => {
    const db = await seed([WALLET]);
    await streamFor(db, WALLET, WALLET);

    await expect(streamAddresses(db)).resolves.toEqual([{ wallet: WALLET, address: WALLET }]);
  });

  it("covers every account on the books", async () => {
    const db = await seed([WALLET, OTHER]);
    await streamFor(db, OTHER, USDC_ACCOUNT);

    const watched = await streamAddresses(db);

    expect(watched.map((w) => w.address).sort()).toEqual([OTHER, USDC_ACCOUNT, WALLET].sort());
    expect(watched.find((w) => w.address === USDC_ACCOUNT)!.wallet).toBe(OTHER);
  });

  it("leaves out a wallet that is not the account's primary one", async () => {
    const db = await seed([WALLET]);
    const [row] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(wallets).values({
      userId: row!.userId,
      address: OTHER,
      kind: "external",
      isPrimary: false,
    });

    await expect(streamAddresses(db)).resolves.toEqual([{ wallet: WALLET, address: WALLET }]);
  });
});
