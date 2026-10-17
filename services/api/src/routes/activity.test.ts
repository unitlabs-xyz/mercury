import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  activityRoutes,
  decodeCursor,
  encodeCursor,
  type ActivityDeps,
  type ActivityRow,
} from "./activity.js";

const at = (iso: string): Date => new Date(iso);

const none: ActivityDeps["receipt"] = async () => null;

const row = (id: string, iso: string): ActivityRow => ({
  id,
  kind: "transfer_in",
  occurredAt: at(iso),
  title: "Received NVDAx",
  subtitle: "1 share, cost estimated at today's price",
  amountUsd: "200",
  txSignature: null,
  mint: null,
  logoUrl: null,
});

const appWith = (d: ActivityDeps) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", activityRoutes(d));
  return app;
};

interface Feed {
  items: { id: string; occurredAt: string }[];
  nextCursor: string | null;
}
const feedOf = async (res: Response) => (await res.json()) as Feed;
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string } };

describe("GET /v1/activity", () => {
  it("returns the feed newest first", async () => {
    const d: ActivityDeps = {
      receipt: none,
      read: async () => [row("b", "2026-09-24T12:00:00Z"), row("a", "2026-09-23T12:00:00Z")],
    };
    const body = await feedOf(await appWith(d).request("/v1/activity"));
    expect(body.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(body.items[0]!.occurredAt).toBe("2026-09-24T12:00:00.000Z");
  });

  it("hands back a cursor only when there is another page", async () => {
    const full: ActivityDeps = {
      receipt: none,
      read: async (_u, limit) =>
        Array.from({ length: limit }, (_, i) => row(String(i), "2026-09-24T12:00:00Z")),
    };
    const short: ActivityDeps = { receipt: none, read: async () => [row("a", "2026-09-24T12:00:00Z")] };
    expect((await feedOf(await appWith(full).request("/v1/activity?limit=2"))).nextCursor).not.toBeNull();
    expect((await feedOf(await appWith(short).request("/v1/activity?limit=2"))).nextCursor).toBeNull();
  });

  it("passes the decoded cursor down to the query", async () => {
    let seen: unknown = "unset";
    const d: ActivityDeps = {
      receipt: none,
      read: async (_u, _l, cursor) => {
        seen = cursor;
        return [];
      },
    };
    const cursor = encodeCursor({ occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" });
    await appWith(d).request(`/v1/activity?cursor=${encodeURIComponent(cursor)}`);
    expect(seen).toEqual({ occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" });
  });

  it("refuses a cursor it did not issue", async () => {
    const d: ActivityDeps = { receipt: none, read: async () => [] };
    const res = await appWith(d).request("/v1/activity?cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.code).toBe("validation_failed");
  });

  it("caps the page size, so one request cannot ask for the whole table", async () => {
    let seen = 0;
    const d: ActivityDeps = {
      receipt: none,
      read: async (_u, limit) => {
        seen = limit;
        return [];
      },
    };
    await appWith(d).request("/v1/activity?limit=5000");
    expect(seen).toBe(100);
  });

  it("ignores a limit that is not a number", async () => {
    let seen = 0;
    const d: ActivityDeps = {
      receipt: none,
      read: async (_u, limit) => {
        seen = limit;
        return [];
      },
    };
    await appWith(d).request("/v1/activity?limit=banana");
    expect(seen).toBe(25);
  });

  it("returns an empty feed for an account nothing has happened to", async () => {
    const body = await feedOf(await appWith({ read: async () => [], receipt: none }).request("/v1/activity"));
    expect(body).toEqual({ items: [], nextCursor: null });
  });
});

describe("cursors", () => {
  it("round-trips", () => {
    const point = { occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" };
    expect(decodeCursor(encodeCursor(point))).toEqual(point);
  });

  it("rejects rubbish rather than throwing", () => {
    expect(decodeCursor("nonsense")).toBeNull();
    expect(decodeCursor(Buffer.from("no-separator").toString("base64url"))).toBeNull();
  });
});

describe("GET /v1/activity/:id", () => {
  it("returns the row and the receipt behind it", async () => {
    let asked: unknown[] = [];
    const d: ActivityDeps = {
      read: async () => [],
      receipt: async (...args) => {
        asked = args;
        return {
          row: row("a", "2026-10-15T14:32:00Z"),
          detail: {
            type: "transfer",
            counterparty: "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W",
            accountSetupUsd: null,
          },
        };
      },
    };
    const res = await appWith(d).request("/v1/activity/abc");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { id: string; occurredAt: string }; detail: { type: string } };
    expect(body.item.id).toBe("a");
    expect(body.item.occurredAt).toBe("2026-10-15T14:32:00.000Z");
    expect(body.detail.type).toBe("transfer");
    // The caller's own account and wallet, never anything the request names.
    expect(asked).toEqual(["user-1", "WaLLeT", "abc"]);
  });

  /* Another account's row and no row at all are the same answer, so an id says nothing about anyone. */
  it("says not found for a row that is not this account's", async () => {
    const res = await appWith({ read: async () => [], receipt: none }).request("/v1/activity/abc");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.code).toBe("not_found");
  });
});
