import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { LABEL_MAX, walletRoutes, type WalletDeps } from "./wallets.js";
import type { WalletView } from "../wallets/store.js";

const WALLET_ID = "6f1c9a52-6a1d-4b55-9d0e-1e2a3b4c5d6e";
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";
const PHANTOM = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";

const mercury: WalletView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  address: "MercuryWa11et1111111111111111111111111111111",
  kind: "privy_embedded",
  isPrimary: true,
  label: null,
  linkedAt: null,
};
const phantom: WalletView = {
  id: WALLET_ID,
  address: PHANTOM,
  kind: "external",
  isPrimary: false,
  label: "Phantom main",
  linkedAt: new Date("2026-11-21T10:00:00Z"),
};

const stub = (over: Partial<WalletDeps> = {}): WalletDeps => ({
  limit: 5,
  list: async () => [mercury, phantom],
  challenge: async () => ({
    kind: "ok",
    challengeId: CHALLENGE_ID,
    message: "beta.trymercury.xyz wants you to link this wallet",
    expiresAt: new Date("2026-11-21T10:10:00Z"),
  }),
  link: async () => ({ kind: "linked", wallet: phantom, relinked: false }),
  rename: async () => ({ kind: "renamed", wallet: phantom }),
  unlink: async () => ({ kind: "unlinked" }),
  ...over,
});

const appWith = (d: WalletDeps, walletAddress: string | null = mercury.address) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  app.route("/", walletRoutes(d));
  return app;
};

const send = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("GET /v1/wallets", () => {
  it("lists the caller's wallets on the wire, with how many may be linked", async () => {
    let asked = "";
    const res = await appWith(stub({ list: async (u) => ((asked = u), [mercury, phantom]) })).request(
      "/v1/wallets",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      wallets: [
        { ...mercury, linkedAt: null },
        { ...phantom, linkedAt: "2026-11-21T10:00:00.000Z" },
      ],
      limit: 5,
    });
    expect(asked).toBe("user-1");
  });
});

describe("POST /v1/wallets/link/challenge", () => {
  it("returns the message to sign and when it stops being good", async () => {
    let asked: [string, string] | null = null;
    const res = await appWith(
      stub({
        challenge: async (u, a) => {
          asked = [u, a];
          return {
            kind: "ok",
            challengeId: CHALLENGE_ID,
            message: "sign me",
            expiresAt: new Date("2026-11-21T10:10:00Z"),
          };
        },
      }),
    ).request("/v1/wallets/link/challenge", send("POST", { address: ` ${PHANTOM} ` }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      challengeId: CHALLENGE_ID,
      message: "sign me",
      expiresAt: "2026-11-21T10:10:00.000Z",
    });
    expect(asked).toEqual(["user-1", PHANTOM]);
  });

  it("refuses what is not a Solana address, and asks for nothing", async () => {
    let asked = false;
    const app = appWith(
      stub({ challenge: async () => ((asked = true), { kind: "refused", reason: "link_limit" }) }),
    );
    for (const body of [{ address: "0xabc" }, { address: 42 }, {}, "not json", null]) {
      const res = await app.request("/v1/wallets/link/challenge", send("POST", body));
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe("invalid_address");
    }
    expect(asked).toBe(false);
  });

  it("answers 409 link_limit before anything is signed", async () => {
    const res = await appWith(
      stub({ challenge: async () => ({ kind: "refused", reason: "link_limit" }) }),
    ).request("/v1/wallets/link/challenge", send("POST", { address: PHANTOM }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "link_limit", message: "Unlink a wallet to link another." },
    });
  });

  it("says a wallet is linked elsewhere without saying to whom", async () => {
    const res = await appWith(
      stub({ challenge: async () => ({ kind: "refused", reason: "linked_elsewhere" }) }),
    ).request("/v1/wallets/link/challenge", send("POST", { address: PHANTOM }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linked_elsewhere");
    expect(body.error.message).toContain("Unlink and delete history");
  });

  it("answers 409 for a wallet already on the account", async () => {
    const res = await appWith(
      stub({ challenge: async () => ({ kind: "refused", reason: "already_linked" }) }),
    ).request("/v1/wallets/link/challenge", send("POST", { address: PHANTOM }));
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("already_linked");
  });

  it("waits for the Mercury wallet, which a linked wallet hangs from", async () => {
    const res = await appWith(stub(), null).request(
      "/v1/wallets/link/challenge",
      send("POST", { address: PHANTOM }),
    );
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("wallet_not_ready");
  });
});

describe("POST /v1/wallets/link", () => {
  it("links and returns the wallet", async () => {
    let asked: string[] = [];
    const res = await appWith(
      stub({
        link: async (...args) => ((asked = args), { kind: "linked", wallet: phantom, relinked: true }),
      }),
    ).request("/v1/wallets/link", send("POST", { challengeId: CHALLENGE_ID, signature: "SiGnAtUrE" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      wallet: { ...phantom, linkedAt: "2026-11-21T10:00:00.000Z" },
      relinked: true,
    });
    expect(asked).toEqual(["user-1", CHALLENGE_ID, "SiGnAtUrE"]);
  });

  it("refuses a body without a challenge id and a signature", async () => {
    const app = appWith(stub());
    for (const body of [
      {},
      { challengeId: CHALLENGE_ID },
      { signature: "s" },
      { challengeId: "not-a-uuid", signature: "s" },
      { challengeId: CHALLENGE_ID, signature: "" },
      "nope",
    ]) {
      const res = await app.request("/v1/wallets/link", send("POST", body));
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe("validation_failed");
    }
  });

  it.each([
    ["challenge_invalid", 400],
    ["bad_signature", 400],
    ["link_limit", 409],
    ["already_linked", 409],
    ["linked_elsewhere", 409],
  ] as const)("answers a %s refusal with %i", async (reason, status) => {
    const res = await appWith(stub({ link: async () => ({ kind: "refused", reason }) })).request(
      "/v1/wallets/link",
      send("POST", { challengeId: CHALLENGE_ID, signature: "s" }),
    );
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(reason);
  });

  it("waits for the Mercury wallet", async () => {
    const res = await appWith(stub(), null).request(
      "/v1/wallets/link",
      send("POST", { challengeId: CHALLENGE_ID, signature: "s" }),
    );
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("wallet_not_ready");
  });
});

describe("PATCH /v1/wallets/:id", () => {
  it("names a wallet, trimmed", async () => {
    let asked: unknown[] = [];
    const res = await appWith(
      stub({ rename: async (...args) => ((asked = args), { kind: "renamed", wallet: phantom }) }),
    ).request(`/v1/wallets/${WALLET_ID}`, send("PATCH", { label: "  Phantom main " }));
    expect(res.status).toBe(200);
    expect(asked).toEqual(["user-1", WALLET_ID, "Phantom main"]);
  });

  it("clears the name for null or a blank one", async () => {
    const seen: unknown[] = [];
    const app = appWith(
      stub({ rename: async (_u, _w, label) => (seen.push(label), { kind: "renamed", wallet: phantom }) }),
    );
    for (const label of [null, "", "   "]) {
      expect((await app.request(`/v1/wallets/${WALLET_ID}`, send("PATCH", { label }))).status).toBe(200);
    }
    expect(seen).toEqual([null, null, null]);
  });

  it("refuses a name longer than a header can show", async () => {
    const res = await appWith(stub()).request(
      `/v1/wallets/${WALLET_ID}`,
      send("PATCH", { label: "x".repeat(LABEL_MAX + 1) }),
    );
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("validation_failed");
  });

  it("refuses a body that does not say what to call it", async () => {
    const app = appWith(stub());
    for (const body of [{}, { label: 7 }, "label"]) {
      const res = await app.request(`/v1/wallets/${WALLET_ID}`, send("PATCH", body));
      expect(res.status).toBe(400);
    }
  });

  it("keeps the Mercury wallet's name", async () => {
    const res = await appWith(stub({ rename: async () => ({ kind: "primary" }) })).request(
      `/v1/wallets/${WALLET_ID}`,
      send("PATCH", { label: "Mine" }),
    );
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("primary_wallet");
  });

  it("answers 404 for a wallet that is not the caller's, or not an id at all", async () => {
    const app = appWith(stub({ rename: async () => ({ kind: "not_found" }) }));
    for (const id of [WALLET_ID, "nope"]) {
      const res = await app.request(`/v1/wallets/${id}`, send("PATCH", { label: "x" }));
      expect(res.status).toBe(404);
    }
  });
});

describe("DELETE /v1/wallets/:id", () => {
  it("unlinks and keeps the history by default", async () => {
    let asked: unknown[] = [];
    const res = await appWith(
      stub({ unlink: async (...args) => ((asked = args), { kind: "unlinked" }) }),
    ).request(`/v1/wallets/${WALLET_ID}`, send("DELETE"));
    expect(res.status).toBe(204);
    expect(asked).toEqual(["user-1", WALLET_ID, false]);
  });

  it("deletes the history too with ?history=delete", async () => {
    let asked: unknown[] = [];
    const res = await appWith(
      stub({ unlink: async (...args) => ((asked = args), { kind: "unlinked" }) }),
    ).request(`/v1/wallets/${WALLET_ID}?history=delete`, send("DELETE"));
    expect(res.status).toBe(204);
    expect(asked).toEqual(["user-1", WALLET_ID, true]);
  });

  it("refuses any other history, rather than guessing which was meant", async () => {
    let asked = false;
    const res = await appWith(stub({ unlink: async () => ((asked = true), { kind: "unlinked" }) })).request(
      `/v1/wallets/${WALLET_ID}?history=keep`,
      send("DELETE"),
    );
    expect(res.status).toBe(400);
    expect(asked).toBe(false);
  });

  it("answers 400 for the Mercury wallet", async () => {
    const res = await appWith(stub({ unlink: async () => ({ kind: "primary" }) })).request(
      `/v1/wallets/${WALLET_ID}`,
      send("DELETE"),
    );
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("primary_wallet");
  });

  it("answers 404 for a wallet that is not the caller's, or not an id at all", async () => {
    const app = appWith(stub({ unlink: async () => ({ kind: "not_found" }) }));
    for (const id of [WALLET_ID, "nope"]) {
      expect((await app.request(`/v1/wallets/${id}`, send("DELETE"))).status).toBe(404);
    }
  });
});
