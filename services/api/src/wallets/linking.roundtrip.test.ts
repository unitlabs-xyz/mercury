import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { mercuryWallet, testDb } from "../db/testing.js";
import { users } from "../db/schema.js";
import { walletRoutes } from "../routes/wallets.js";
import { pgWalletDeps } from "./deps.js";
import { testWallet } from "./testing.js";

/**
 * Linking end to end: HTTP in, Postgres underneath, a real wallet signing the
 * message the server issued. The pieces are each tested alone; this is the
 * test that they fit, the way the server wires them.
 */
const world = async (limit = 5) => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:roundtrip" }).returning();
  const mercury = await mercuryWallet(db, user!.id, "MercuryWallet");
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", {
      userId: user!.id,
      privyUserId: "did:privy:roundtrip",
      walletAddress: "MercuryWallet",
    });
    await next();
  });
  app.route("/", walletRoutes(pgWalletDeps(db, { appUrl: "https://beta.trymercury.xyz", limit })));
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : ((await res.json()) as Record<string, unknown>),
    };
  };
  const link = async (wallet: Awaited<ReturnType<typeof testWallet>>) => {
    const challenge = await call("POST", "/v1/wallets/link/challenge", { address: wallet.address });
    if (challenge.status !== 200) return challenge;
    return call("POST", "/v1/wallets/link", {
      challengeId: challenge.body!["challengeId"],
      signature: await wallet.sign(challenge.body!["message"] as string),
    });
  };
  const listed = async () =>
    (await call("GET", "/v1/wallets")).body!["wallets"] as {
      id: string;
      address: string;
      label: string | null;
    }[];
  return { call, link, listed, mercury };
};

describe("linking a wallet, over HTTP and Postgres", () => {
  it("links, names, unlinks and links again, keeping the same wallet", async () => {
    const { call, link, listed, mercury } = await world();
    const phantom = await testWallet();

    const linked = await link(phantom);
    expect(linked.status).toBe(200);
    const id = (linked.body!["wallet"] as { id: string }).id;
    expect((await listed()).map((w) => w.id)).toEqual([mercury, id]);

    expect((await call("PATCH", `/v1/wallets/${id}`, { label: "Phantom main" })).status).toBe(200);
    expect((await listed())[1]!.label).toBe("Phantom main");

    expect((await call("DELETE", `/v1/wallets/${id}`)).status).toBe(204);
    expect((await listed()).map((w) => w.id)).toEqual([mercury]);

    const again = await link(phantom);
    expect(again.body).toMatchObject({ relinked: true, wallet: { id, label: "Phantom main" } });
  });

  it("refuses a signature from any wallet but the one named in the challenge", async () => {
    const { call } = await world();
    const phantom = await testWallet();
    const impostor = await testWallet();
    const challenge = await call("POST", "/v1/wallets/link/challenge", { address: phantom.address });

    const res = await call("POST", "/v1/wallets/link", {
      challengeId: challenge.body!["challengeId"],
      signature: await impostor.sign(challenge.body!["message"] as string),
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "bad_signature" } });
  });

  it("stops at the limit and says so before asking for a signature", async () => {
    const { call, link } = await world(2);
    expect((await link(await testWallet())).status).toBe(200);
    expect((await link(await testWallet())).status).toBe(200);

    const third = await call("POST", "/v1/wallets/link/challenge", { address: (await testWallet()).address });
    expect(third.status).toBe(409);
    expect(third.body).toMatchObject({ error: { code: "link_limit" } });
  });

  it("deletes a wallet's history on request, and refuses to touch the Mercury wallet", async () => {
    const { call, link, listed, mercury } = await world();
    const linked = await link(await testWallet());
    const id = (linked.body!["wallet"] as { id: string }).id;

    expect((await call("DELETE", `/v1/wallets/${id}?history=delete`)).status).toBe(204);
    expect((await call("DELETE", `/v1/wallets/${id}`)).status).toBe(404);
    expect((await call("DELETE", `/v1/wallets/${mercury}`)).status).toBe(400);
    expect((await listed()).map((w) => w.id)).toEqual([mercury]);
  });
});
