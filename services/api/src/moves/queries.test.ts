import { describe, expect, it } from "vitest";
import { mercuryWallet, testDb } from "../db/testing.js";
import { instruments, tokens, users, wallets } from "../db/schema.js";
import { mercuryWalletIdOf, movableMints } from "./queries.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("movableMints", () => {
  it("is every stock Mercury lists, named by its ticker, and USDC", async () => {
    const db = await testDb();
    const [nvda] = await db
      .insert(instruments)
      .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
      .returning();
    await db.insert(tokens).values([
      { instrumentId: nvda!.id, mint: "NVDAx-mint", symbol: "NVDAx", issuer: "backed", decimals: 8 },
      { instrumentId: nvda!.id, mint: "NVDAon-mint", symbol: "NVDAon", issuer: "ondo", decimals: 9 },
    ]);
    expect(Object.fromEntries(await movableMints(db, USDC))).toEqual({
      [USDC]: { symbol: "USDC", ticker: null, name: "US dollars", decimals: 6 },
      "NVDAx-mint": { symbol: "NVDAx", ticker: "NVDA", name: "Nvidia", decimals: 8 },
      "NVDAon-mint": { symbol: "NVDAon", ticker: "NVDA", name: "Nvidia", decimals: 9 },
    });
  });
});

describe("mercuryWalletIdOf", () => {
  it("is the person's Mercury wallet, never a linked one, and null before Privy makes it", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:q" }).returning();
    expect(await mercuryWalletIdOf(db, user!.id)).toBeNull();
    await db
      .insert(wallets)
      .values({ userId: user!.id, address: "Linked", kind: "external", isPrimary: false });
    expect(await mercuryWalletIdOf(db, user!.id)).toBeNull();
    const id = await mercuryWallet(db, user!.id);
    expect(await mercuryWalletIdOf(db, user!.id)).toBe(id);
  });
});
