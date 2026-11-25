import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { mercuryWallet, testDb } from "../db/testing.js";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import {
  ALL_WALLETS,
  WALLET_HEADER,
  actingOne,
  actingWallet,
  followedWallets,
  mercuryWalletOnly,
  oneWalletOnly,
  oneWalletToAct,
  writerOf,
  type Acting,
} from "./acting.js";

const person = async (db: Db, privyUserId: string) => {
  const [user] = await db.insert(users).values({ privyUserId }).returning();
  const mercury = await mercuryWallet(db, user!.id, `Mercury-${privyUserId}`);
  return { userId: user!.id, mercury };
};

/** A linked wallet as linking leaves it, unlinked if `unlinkedAt` is given. */
const linkedWallet = async (
  db: Db,
  userId: string,
  address: string,
  opts: { linkedAt: Date; label?: string; unlinkedAt?: Date },
) => {
  const [row] = await db
    .insert(wallets)
    .values({
      userId,
      address,
      kind: "external",
      isPrimary: false,
      label: opts.label ?? null,
      linkedAt: opts.linkedAt,
      unlinkedAt: opts.unlinkedAt ?? null,
    })
    .returning({ id: wallets.id });
  return row!.id;
};

interface Seen {
  seen: string[];
  viewed: string[];
}

/** The middleware behind a stand-in for `requireAuth`, answering with what it set. */
const appFor = (db: Db, userId: string, seen: Seen = { seen: [], viewed: [] }) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId, privyUserId: "did:privy:x", walletAddress: null });
    await next();
  });
  app.use("*", actingWallet({ db, onSeen: (a) => seen.seen.push(a), onViewed: (a) => seen.viewed.push(a) }));
  app.get("/read", (c) => c.json({ acting: c.get("acting"), one: actingOne(c) }));
  app.get("/detail", oneWalletOnly(), (c) => c.json({ ok: true }));
  app.use("/act", mercuryWalletOnly());
  app.get("/act", (c) => c.json({ read: true }));
  app.post("/act", (c) => c.json({ acted: actingOne(c)?.address ?? null }));
  app.use("/act/*", mercuryWalletOnly());
  app.post("/act/:slug/preview", (c) => c.json({ previewed: true }));
  return app;
};

const read = async (app: Hono, header?: string) => {
  const res = await app.request(
    "/read",
    header === undefined ? {} : { headers: { [WALLET_HEADER]: header } },
  );
  return {
    status: res.status,
    body: (await res.json()) as { acting: Acting; one: unknown } & { error?: { code: string } },
  };
};

describe("followedWallets", () => {
  it("lists the Mercury wallet first, then linked wallets in the order they were linked, and no unlinked one", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    await linkedWallet(db, userId, "Second", { linkedAt: new Date("2026-11-20T00:00:00Z") });
    await linkedWallet(db, userId, "First", { linkedAt: new Date("2026-11-10T00:00:00Z"), label: "Phantom" });
    await linkedWallet(db, userId, "Gone", {
      linkedAt: new Date("2026-11-01T00:00:00Z"),
      unlinkedAt: new Date("2026-11-02T00:00:00Z"),
    });

    const list = await followedWallets(db, userId);
    expect(list.map((w) => w.address)).toEqual(["Mercury-did:privy:a", "First", "Second"]);
    expect(list[0]).toMatchObject({ kind: "privy_embedded", isPrimary: true, label: null });
    expect(list[1]).toMatchObject({ kind: "external", isPrimary: false, label: "Phantom" });
  });

  it("is empty for someone whose Mercury wallet is still being made", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:new" }).returning();
    expect(await followedWallets(db, user!.id)).toEqual([]);
  });
});

describe("actingWallet", () => {
  let db: Db;
  let userId: string;
  let linkedId: string;
  let goneId: string;
  let theirsId: string;

  beforeEach(async () => {
    db = await testDb();
    ({ userId } = await person(db, "did:privy:a"));
    linkedId = await linkedWallet(db, userId, "Linked", { linkedAt: new Date("2026-11-10T00:00:00Z") });
    goneId = await linkedWallet(db, userId, "Gone", {
      linkedAt: new Date("2026-11-01T00:00:00Z"),
      unlinkedAt: new Date("2026-11-02T00:00:00Z"),
    });
    const other = await person(db, "did:privy:b");
    theirsId = await linkedWallet(db, other.userId, "Theirs", { linkedAt: new Date("2026-11-10T00:00:00Z") });
  });

  it("is the Mercury wallet when no wallet is named, as every iOS request and older web client sends", async () => {
    const { status, body } = await read(appFor(db, userId));
    expect(status).toBe(200);
    expect(body.acting.all).toBe(false);
    expect(body.acting.wallets.map((w) => w.address)).toEqual(["Mercury-did:privy:a"]);
    expect(body.one).toMatchObject({ address: "Mercury-did:privy:a", isPrimary: true });
  });

  it("treats an empty header as no header", async () => {
    const { body } = await read(appFor(db, userId), "  ");
    expect(body.acting.wallets.map((w) => w.address)).toEqual(["Mercury-did:privy:a"]);
  });

  it("is the named wallet when it is one of the caller's followed wallets", async () => {
    const { status, body } = await read(appFor(db, userId), linkedId);
    expect(status).toBe(200);
    expect(body.acting).toMatchObject({
      all: false,
      wallets: [{ id: linkedId, address: "Linked", isPrimary: false }],
    });
    expect(body.one).toMatchObject({ id: linkedId });
  });

  it("is every followed wallet for `all`, and no one wallet", async () => {
    const { status, body } = await read(appFor(db, userId), ALL_WALLETS);
    expect(status).toBe(200);
    expect(body.acting.all).toBe(true);
    expect(body.acting.wallets.map((w) => w.address)).toEqual(["Mercury-did:privy:a", "Linked"]);
    expect(body.one).toBeNull();
  });

  it.each([
    ["someone else's wallet", () => theirsId],
    ["an unlinked wallet", () => goneId],
    ["a wallet that does not exist", () => "6f1c9b8e-0000-4000-8000-000000000000"],
    ["something that is not an id", () => "'; drop table wallet; --"],
  ])("refuses %s with the same 403", async (_, id) => {
    const { status, body } = await read(appFor(db, userId), id());
    expect(status).toBe(403);
    expect(body.error).toMatchObject({ code: "wallet_forbidden" });
  });

  it("is empty, and not an error, while the Mercury wallet is being made", async () => {
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:new" }).returning();
    const { status, body } = await read(appFor(db, user!.id));
    expect(status).toBe(200);
    expect(body.acting.wallets).toEqual([]);
    expect(body.one).toBeNull();
  });

  it("reports each linked wallet being read as seen and viewed, and never the Mercury wallet", async () => {
    const seen: Seen = { seen: [], viewed: [] };
    const app = appFor(db, userId, seen);
    await read(app);
    expect(seen).toEqual({ seen: [], viewed: [] });
    await read(app, linkedId);
    expect(seen).toEqual({ seen: ["Linked"], viewed: ["Linked"] });
    await read(app, ALL_WALLETS);
    expect(seen).toEqual({ seen: ["Linked", "Linked"], viewed: ["Linked", "Linked"] });
  });

  it("reports nothing for a refused wallet", async () => {
    const seen: Seen = { seen: [], viewed: [] };
    await read(appFor(db, userId, seen), goneId);
    expect(seen).toEqual({ seen: [], viewed: [] });
  });
});

describe("oneWalletOnly", () => {
  it("answers 400 to `all`, and passes one wallet", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const app = appFor(db, userId);
    const all = await app.request("/detail", { headers: { [WALLET_HEADER]: ALL_WALLETS } });
    expect(all.status).toBe(400);
    expect(await all.json()).toMatchObject({ error: { code: "wallet_all" } });
    expect((await app.request("/detail")).status).toBe(200);
  });
});

describe("mercuryWalletOnly", () => {
  let db: Db;
  let userId: string;
  let linkedId: string;

  beforeEach(async () => {
    db = await testDb();
    ({ userId } = await person(db, "did:privy:a"));
    linkedId = await linkedWallet(db, userId, "Linked", { linkedAt: new Date("2026-11-10T00:00:00Z") });
  });

  it("acts for the Mercury wallet, named or not", async () => {
    const app = appFor(db, userId);
    const [mercury] = await followedWallets(db, userId);
    for (const headers of [{}, { [WALLET_HEADER]: mercury!.id }]) {
      const res = await app.request("/act", { method: "POST", headers });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ acted: "Mercury-did:privy:a" });
    }
  });

  it("refuses to act for every wallet at once with a 400", async () => {
    const res = await appFor(db, userId).request("/act", {
      method: "POST",
      headers: { [WALLET_HEADER]: ALL_WALLETS },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "wallet_all" } });
  });

  it("refuses to act for a linked wallet with a 409, rather than acting for the Mercury wallet instead", async () => {
    const res = await appFor(db, userId).request("/act", {
      method: "POST",
      headers: { [WALLET_HEADER]: linkedId },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "wallet_read_only" } });
  });

  it("lets a read under the same path through, whichever wallet is chosen", async () => {
    const app = appFor(db, userId);
    for (const header of [linkedId, ALL_WALLETS]) {
      const res = await app.request("/act", { headers: { [WALLET_HEADER]: header } });
      expect(res.status).toBe(200);
    }
  });

  it("lets a dry-run preview through for every wallet, linked or all, since it acts for none", async () => {
    const app = appFor(db, userId);
    for (const header of [linkedId, ALL_WALLETS]) {
      const res = await app.request("/act/gold/preview", {
        method: "POST",
        headers: { [WALLET_HEADER]: header },
      });
      expect(res.status).toBe(200);
    }
  });

  it("leaves an account with no wallet yet to the route, which already answers that", async () => {
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:new" }).returning();
    const res = await appFor(db, user!.id).request("/act", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ acted: null });
  });
});

describe("oneWalletToAct and writerOf", () => {
  let db: Db;
  let userId: string;
  let linkedId: string;

  /** The session's own address is what Privy signed; the Mercury wallet's row says something else, to tell them apart. */
  const appOf = (signed: string | null) => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("identity", { userId, privyUserId: "did:privy:x", walletAddress: signed });
      await next();
    });
    app.use("*", actingWallet({ db }));
    app.use("/act", oneWalletToAct());
    app.get("/act", (c) => c.json({ read: true }));
    app.post("/act", (c) => c.json({ writer: writerOf(c) }));
    return app;
  };
  const act = (app: Hono, header?: string) =>
    app.request("/act", {
      method: "POST",
      ...(header === undefined ? {} : { headers: { [WALLET_HEADER]: header } }),
    });

  beforeEach(async () => {
    db = await testDb();
    ({ userId } = await person(db, "did:privy:a"));
    linkedId = await linkedWallet(db, userId, "Linked", { linkedAt: new Date("2026-11-10T00:00:00Z") });
  });

  it("acts for the Mercury wallet at the address Privy signed into the session, never its row's", async () => {
    const res = await act(appOf("SignedBySession"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { writer: { address: string; isPrimary: boolean } }).writer).toMatchObject({
      address: "SignedBySession",
      isPrimary: true,
    });
  });

  it("acts for a linked wallet at its own address, once the middleware found it is the caller's", async () => {
    const res = await act(appOf("SignedBySession"), linkedId);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { writer: unknown }).writer).toEqual({
      id: linkedId,
      address: "Linked",
      isPrimary: false,
      label: null,
    });
  });

  it("refuses every wallet at once with a 400, and lets a read through", async () => {
    const app = appOf("SignedBySession");
    const res = await act(app, ALL_WALLETS);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "wallet_all" } });
    expect((await app.request("/act", { headers: { [WALLET_HEADER]: ALL_WALLETS } })).status).toBe(200);
  });

  it("has no writer for a session whose Mercury wallet is still being made", async () => {
    expect(((await (await act(appOf(null))).json()) as { writer: unknown }).writer).toBeNull();
  });

  it("refuses a wallet that is not the caller's before it reaches a write", async () => {
    expect((await act(appOf("SignedBySession"), "6f1c9b8e-0000-4000-8000-000000000000")).status).toBe(403);
  });
});
