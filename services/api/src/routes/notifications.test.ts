import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { notificationRoutes, type NotificationDeps } from "./notifications.js";
import type { InboxItem } from "../notify/inbox-queries.js";

const ID = "6f1c9a52-6a1d-4b55-9d0e-1e2a3b4c5d6e";

const item: InboxItem = {
  id: ID,
  kind: "money_in",
  createdAt: new Date("2026-10-27T11:00:00Z"),
  readAt: null,
  activity: {
    id: "a1",
    kind: "transfer_in",
    occurredAt: new Date("2026-10-27T10:59:00Z"),
    title: "Added cash",
    subtitle: "From Tron · USDT",
    amountUsd: "250.000000000000000000",
    txSignature: "sig",
    mint: null,
    logoUrl: null,
  },
};

const stub = (over: Partial<NotificationDeps> = {}): NotificationDeps => ({
  list: async () => ({ items: [item], unread: 1 }),
  unread: async () => 1,
  read: async () => true,
  readAll: async () => 1,
  ...over,
});

const appWith = (d: NotificationDeps) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", notificationRoutes(d));
  return app;
};

const post = (body?: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("GET /v1/notifications", () => {
  it("returns the items on the wire, and the unread count", async () => {
    const res = await appWith(stub()).request("/v1/notifications");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; createdAt: string; readAt: string | null; activity: { title: string } }[];
      unread: number;
    };
    expect(body.unread).toBe(1);
    expect(body.items[0]!.createdAt).toBe("2026-10-27T11:00:00.000Z");
    expect(body.items[0]!.readAt).toBeNull();
    expect(body.items[0]!.activity.title).toBe("Added cash");
  });
});

describe("GET /v1/notifications/unread", () => {
  it("returns the count for the caller", async () => {
    let asked = "";
    const res = await appWith(stub({ unread: async (u) => ((asked = u), 7) })).request(
      "/v1/notifications/unread",
    );
    expect(await res.json()).toEqual({ unread: 7 });
    expect(asked).toBe("user-1");
  });
});

describe("POST /v1/notifications/:id/read", () => {
  it("answers 204 when it was the caller's", async () => {
    const res = await appWith(stub()).request(`/v1/notifications/${ID}/read`, post());
    expect(res.status).toBe(204);
  });

  it("answers 404 when it was not", async () => {
    const res = await appWith(stub({ read: async () => false })).request(
      `/v1/notifications/${ID}/read`,
      post(),
    );
    expect(res.status).toBe(404);
  });

  /* Postgres throws on a malformed uuid; that is a 404, not a 500. */
  it("answers 404 for an id that is not a uuid, without asking the database", async () => {
    let asked = false;
    const res = await appWith(stub({ read: async () => ((asked = true), true) })).request(
      "/v1/notifications/not-an-id/read",
      post(),
    );
    expect(res.status).toBe(404);
    expect(asked).toBe(false);
  });
});

describe("POST /v1/notifications/read-all", () => {
  it("passes upTo down as a date and answers 204", async () => {
    let seen: Date | null = null;
    const res = await appWith(stub({ readAll: async (_u, upTo) => ((seen = upTo), 1) })).request(
      "/v1/notifications/read-all",
      post({ upTo: "2026-10-27T11:00:00.000Z" }),
    );
    expect(res.status).toBe(204);
    expect(seen).toEqual(new Date("2026-10-27T11:00:00.000Z"));
  });

  it("refuses a missing or unreadable upTo", async () => {
    for (const body of [{}, { upTo: "yesterday" }, undefined]) {
      const res = await appWith(stub()).request("/v1/notifications/read-all", post(body));
      expect(res.status).toBe(400);
    }
  });
});
