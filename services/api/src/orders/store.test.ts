import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { instruments, users } from "../db/schema.js";
import { memoryOrderStore } from "./memory.js";
import { pgOrderStore, type OrderStore, type Repricing } from "./store.js";

const base = {
  userId: "user-1",
  ticker: "NVDA",
  side: "buy" as const,
  usdAmount: "100",
  decision: { kind: "execute" },
  chosenMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  referencePrice: "200",
  premiumPct: "0.001",
  status: "pending" as const,
};

describe("OrderStore contract", () => {
  it("gives every order its own id", async () => {
    const store = memoryOrderStore();
    const a = await store.create(base);
    const b = await store.create(base);
    expect(a.id).not.toBe(b.id);
  });

  it("keeps the decision exactly as it was handed over", async () => {
    const store = memoryOrderStore();
    const decision = { kind: "refuse", reason: "impact_too_high", candidates: [{ mint: "Xsc9" }] };
    const saved = await store.create({ ...base, decision });
    expect((await store.byId("user-1", saved.id))!.decision).toEqual(decision);
  });

  it("will not hand one user another user's order", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    expect(await store.byId("user-2", saved.id)).toBeNull();
  });

  it("moves an order's status", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    await store.setStatus("user-1", saved.id, "executing");
    expect((await store.byId("user-1", saved.id))!.status).toBe("executing");
  });

  it("replaces the decision when an order is re-priced, so the row holds what was acted on", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    const acted = { kind: "execute", best: { mint: "Xso", pricePerShare: "223.10" } };

    await store.reprice("user-1", saved.id, {
      decision: acted,
      chosenMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
      referencePrice: "223",
      premiumPct: "0.0004",
      status: "executing",
    });

    const after = (await store.byId("user-1", saved.id))!;
    expect(after.decision).toEqual(acted);
    expect(after.status).toBe("executing");
  });

  it("will not let one user re-price another user's order", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    await store.reprice("user-2", saved.id, {
      decision: { kind: "refuse" },
      chosenMint: null,
      referencePrice: null,
      premiumPct: null,
      status: "refused",
    });
    expect((await store.byId("user-1", saved.id))!.status).toBe("pending");
  });

  it("says null for an id that was never issued", async () => {
    expect(await memoryOrderStore().byId("user-1", "nope")).toBeNull();
  });
});

/*
 * Mercury's fee, kept apart from the total the relayer took.
 *
 * Both land in the relayer's one USDC account, so the chain alone cannot say
 * which dollars were revenue and which repaid gas. The build knows, and the
 * row is where it says so — for both stores, because the routes are tested
 * against one and run against the other.
 */
const building: Repricing = {
  decision: { kind: "execute" },
  chosenMint: null,
  referencePrice: null,
  premiumPct: null,
  status: "executing",
  mercuryFeeUsd: "2.5",
};

const pgStore = async (): Promise<{ store: OrderStore; userId: string }> => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:test" }).returning();
  await db.insert(instruments).values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" });
  return { store: pgOrderStore(db), userId: user!.id };
};

describe.each([
  ["memory", async () => ({ store: memoryOrderStore(), userId: "user-1" })],
  ["postgres", pgStore],
] as const)("Mercury's fee on the %s order store", (_name, make) => {
  it("has none on an order that was never built", async () => {
    const { store, userId } = await make();
    const saved = await store.create({ ...base, userId, chosenMint: null });
    expect((await store.byId(userId, saved.id))!.mercuryFeeUsd).toBeNull();
  });

  it("keeps the fee the build charged", async () => {
    const { store, userId } = await make();
    const saved = await store.create({ ...base, userId, chosenMint: null });
    await store.reprice(userId, saved.id, building);
    expect(D((await store.byId(userId, saved.id))!.mercuryFeeUsd!).toString()).toBe("2.5");
  });
});
