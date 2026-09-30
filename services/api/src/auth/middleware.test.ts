import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireAuth, type AuthDeps } from "./middleware.js";
import { InvalidToken, type TokenVerifier } from "./verifier.js";

const verifier: TokenVerifier = {
  verify: async (t) => {
    if (t !== "good") throw new InvalidToken("nope");
    return {
      privyUserId: "did:privy:abc123",
      sessionId: "sess_1",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    };
  },
};

const deps: AuthDeps = {
  db: {} as AuthDeps["db"],
  verifier,
  directory: {
    read: async () => ({ privyUserId: "did:privy:abc123", solanaAddress: "So1anaAddr", email: null }),
  },
};

/** The middleware is what we are testing, so identity resolution is stubbed. */
const appWith = (d: AuthDeps) => {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.use(
    "/v1/*",
    requireAuth(d, async (_db, dir, token, identityToken) => ({
      userId: "user-1",
      privyUserId: token.privyUserId,
      walletAddress: identityToken ? (await dir.read(identityToken)).solanaAddress : null,
    })),
  );
  app.get("/v1/me", (c) => c.json(c.get("identity")));
  return app;
};

describe("requireAuth", () => {
  it("lets /health through without a token", async () => {
    const res = await appWith(deps).request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await appWith(deps).request("/v1/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthenticated", message: expect.any(String) },
    });
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await appWith(deps).request("/v1/me", { headers: { Authorization: "good" } });
    expect(res.status).toBe(401);
  });

  it("rejects a token the verifier refuses", async () => {
    const res = await appWith(deps).request("/v1/me", {
      headers: { Authorization: "Bearer bad" },
    });
    expect(res.status).toBe(401);
  });

  it("passes the identity through on a good token", async () => {
    const res = await appWith(deps).request("/v1/me", {
      headers: { Authorization: "Bearer good", "X-Privy-Identity-Token": "id_tok" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: "user-1",
      privyUserId: "did:privy:abc123",
      walletAddress: "So1anaAddr",
    });
  });

  it("authenticates without an identity token, reporting no wallet", async () => {
    const res = await appWith(deps).request("/v1/me", {
      headers: { Authorization: "Bearer good" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ walletAddress: null });
  });
});
