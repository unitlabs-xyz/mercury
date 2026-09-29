import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { dnsAcceptsMail, pgWaitlist, waitlistRoutes } from "./waitlist.js";

const anyDomain = async () => true;

const post = (app: ReturnType<typeof waitlistRoutes>, body: unknown) =>
  app.request("/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("waitlist", () => {
  it("stores an email once, whatever its case, and answers the same both times", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));

    expect((await post(app, { email: "Ada@Example.com", name: "Ada", country: "India" })).status).toBe(200);
    expect((await post(app, { email: "ada@example.com", country: "Spain" })).status).toBe(200);

    const res = await app.request("/admin/waitlist", { headers: { authorization: "Bearer secret" } });
    const body = (await res.json()) as { count: number; entries: { email: string; country: string }[] };
    expect(body.count).toBe(1);
    expect(body.entries[0]).toMatchObject({ email: "ada@example.com", country: "India" });
  });

  it("refuses a bad email or a missing country", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));
    expect((await post(app, { email: "nope", country: "India" })).status).toBe(400);
    expect((await post(app, { email: "a@b.co" })).status).toBe(400);
  });

  it("hides the export without the token, and when none is configured", async () => {
    const db = await testDb();
    const guarded = waitlistRoutes(pgWaitlist(db, "secret", anyDomain));
    expect((await guarded.request("/admin/waitlist")).status).toBe(404);
    expect(
      (await guarded.request("/admin/waitlist", { headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(404);

    const open = waitlistRoutes(pgWaitlist(db, undefined, anyDomain));
    expect(
      (await open.request("/admin/waitlist", { headers: { authorization: "Bearer undefined" } })).status,
    ).toBe(404);
  });

  it("exports CSV", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));
    await post(app, { email: "a@b.co", name: 'Quote "Q"', country: "India" });
    const res = await app.request("/admin/waitlist?format=csv", {
      headers: { authorization: "Bearer secret" },
    });
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("email,name,country,created_at");
    expect(text).toContain('"Quote ""Q"""');
  });

  it("refuses a domain that cannot take mail, and stores nothing", async () => {
    const db = await testDb();
    const app = waitlistRoutes(pgWaitlist(db, "secret", async (d) => d !== "nowhere.invalid"));
    const res = await post(app, { email: "a@nowhere.invalid", country: "India" });
    expect(res.status).toBe(400);
    const list = await app.request("/admin/waitlist", { headers: { authorization: "Bearer secret" } });
    expect(((await list.json()) as { count: number }).count).toBe(0);
  });

  it("knows a reserved domain has no mail, and does not wait on DNS forever", async () => {
    expect(await dnsAcceptsMail("nowhere.invalid")).toBe(false);
    expect(await dnsAcceptsMail("example.com", 1)).toBe(true);
  });
});
