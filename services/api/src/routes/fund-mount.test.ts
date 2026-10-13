import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AuthDeps } from "../auth/middleware.js";
import type { Deps, ReadDeps } from "../deps.js";

/**
 * Whether funding is reachable at all, which is a property of `createApp` and
 * not of either route module.
 *
 * Two things can only be got wrong here: mounting the webhook below the auth
 * middleware, which would put a session requirement on a caller that has none;
 * and mounting the feature when it cannot work, which would offer the user a
 * method that 500s instead of one that is hidden.
 */

const base = {
  send: { rpcUrl: "https://example.invalid" },
  instruments: {},
  portfolio: {},
  money: {},
  activity: {},
  waitlist: {},
  fills: {},
  borrow: {},
  basketTemplates: {},
  orders: {},
};

const fund = {
  relay: { chains: vi.fn().mockResolvedValue([]), depositAddressQuote: vi.fn(), status: vi.fn() },
  store: { create: vi.fn(), byDepositAddress: vi.fn(), advance: vi.fn(), forUser: vi.fn() },
  refund: { evm: "0xe", svm: "S", bvm: "bc1q" },
  recovery: { evm: "0xe", svm: "S", bvm: "bc1q" },
  minimumUsd: 10,
  webhookSecret: "relay-api-key",
};

/* Rejecting, so an authenticated route answers 401 rather than reaching a
   handler. 401 and 404 are the whole of what these tests tell apart. */
const auth = {
  db: {},
  verifier: { verify: async () => Promise.reject(new Error("no")) },
  directory: { read: async () => Promise.reject(new Error("no")) },
} as unknown as AuthDeps;

const appWith = (read: Record<string, unknown>) =>
  createApp(() => ({}) as unknown as Deps, auth, read as unknown as ReadDeps);

/*
 * The webhook is what these assert on, because it is the only one of the two
 * that is distinguishable here: `/v1/money/fund/*` sits under
 * `app.use("/v1/*", requireAuth(auth))`, so an unmounted route and an
 * unauthenticated request both answer 401 and no assertion can tell them
 * apart without a session this harness has no database to issue.
 *
 * It is the same `if (read.fund)` gate on both, so proving it on the webhook
 * proves it. And the webhook is where the risk actually is — mounted on the
 * wrong side of that middleware, Relay would be asked for a session it does
 * not have, and every delivery would be lost with a 401 that looks exactly
 * like a bad signature.
 */
describe("createApp, funding unconfigured", () => {
  const app = appWith(base);

  it("does not mount the webhook", async () => {
    expect((await app.request("/webhooks/relay", { method: "POST", body: "{}" })).status).toBe(404);
  });

  it("still serves everything else", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("createApp, funding configured", () => {
  const app = appWith({ ...base, fund });

  it("mounts the webhook outside the auth middleware", async () => {
    const res = await app.request("/webhooks/relay", { method: "POST", body: "{}" });

    expect(res.status).toBe(401);
    /*
     * `malformed` is the signature check refusing an unsigned body, which is
     * the proof: `requireAuth` would have answered `unauthorized` and never
     * reached this handler.
     */
    expect(await res.json()).toMatchObject({ error: { code: "malformed" } });
  });

  it("still serves everything else", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });
});
