import { describe, expect, it } from "vitest";
import { memoryOrderStore } from "./memory.js";

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

  it("says null for an id that was never issued", async () => {
    expect(await memoryOrderStore().byId("user-1", "nope")).toBeNull();
  });
});
