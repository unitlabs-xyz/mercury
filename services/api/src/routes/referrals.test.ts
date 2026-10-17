import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { D } from "@mercury/core";
import type { ReferralStore } from "../referrals/store.js";
import { referralRoutes } from "./referrals.js";

const now = new Date("2026-10-17T12:00:00Z");

const appWith = (store: Partial<ReferralStore>) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", referralRoutes({ store: store as ReferralStore, now: () => now }));
  return app;
};
const post = (app: Hono, body: unknown) =>
  app.request("/v1/referrals/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /v1/referrals", () => {
  it("gives the link, the counts and the tier", async () => {
    const summary = vi.fn(async () => ({
      code: "abcdefgh",
      invited: 4,
      funded: 2,
      founding: false,
      share: D("0.25"),
      discountUntil: null,
    }));
    const res = await appWith({ summary }).request("/v1/referrals");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: "abcdefgh",
      link: "https://trymercury.xyz/?ref=abcdefgh",
      invited: 4,
      funded: 2,
      founding: false,
      share: "0.25",
      discountUntil: null,
    });
    expect(summary).toHaveBeenCalledWith("user-1", now);
  });
});

describe("POST /v1/referrals/claim", () => {
  it("claims for the signed-in person", async () => {
    const claim = vi.fn(async () => ({ kind: "claimed" as const, inviterId: "user-9" }));
    const res = await post(appWith({ claim }), { code: "abcdefgh" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "claimed" });
    expect(claim).toHaveBeenCalledWith("user-1", "abcdefgh", now);
  });

  it.each([
    ["unknown_code", 404, "not_found"],
    ["self", 409, "self_referral"],
    ["taken", 409, "already_referred"],
    ["too_late", 409, "too_late"],
  ] as const)("answers %s with %i %s", async (kind, status, code) => {
    const res = await post(appWith({ claim: async () => ({ kind }) }), { code: "abcdefgh" });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
  });

  it("refuses something that is not a code without asking the store", async () => {
    const claim = vi.fn();
    const res = await post(appWith({ claim }), { code: "../etc" });
    expect(res.status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });
});
