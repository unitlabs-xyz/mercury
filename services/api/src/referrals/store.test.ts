import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { createReferralStore } from "./store.js";
import { seedUser, seedWaitlist } from "./testing.js";

describe("codeFor", () => {
  it("makes a code once and keeps it", async () => {
    const db = await testDb();
    const ada = await seedUser(db, 1);
    const store = createReferralStore(db);
    const first = await store.codeFor(ada.id);
    expect(first).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    expect(await store.codeFor(ada.id)).toBe(first);
  });

  /* Their founding card's link said ?ref=<slug>; it should still mean them. */
  it("gives a waitlist member their card's slug, whatever case Privy sends the email in", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 12 });
    const ada = await seedUser(db, 1, { email: "Ada@Example.com" });
    expect(await createReferralStore(db).codeFor(ada.id)).toBe("3kQ9xZ1bTq7w");
  });

  it("gives two people two codes", async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const [a, b] = [await seedUser(db, 1), await seedUser(db, 2)];
    expect(await store.codeFor(a.id)).not.toBe(await store.codeFor(b.id));
  });
});

describe("isFounding", () => {
  it("is the first 500 on the waitlist", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 500 });
    await seedWaitlist(db, { email: "bo@example.com", slug: "Zz9xZ1bTq7wQ", position: 501 });
    const store = createReferralStore(db);
    expect(await store.isFounding((await seedUser(db, 1, { email: "ada@example.com" })).id)).toBe(true);
    expect(await store.isFounding((await seedUser(db, 2, { email: "bo@example.com" })).id)).toBe(false);
    expect(await store.isFounding((await seedUser(db, 3)).id)).toBe(false);
  });
});
