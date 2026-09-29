import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(async () => "tok_123"),
  // The hook the real `IdentityTokenSync` reads; never called in these tests,
  // which set the mirror directly instead.
  useIdentityToken: vi.fn(() => ({ identityToken: null })),
}));

import { getAccessToken } from "@privy-io/react-auth";
import { setIdentityToken } from "../auth/identity.js";
import { apiFetch } from "./client.js";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setIdentityToken("id_456");
  });

  it("attaches both tokens", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiFetch("/v1/me");
    const h = new Headers(spy.mock.calls[0]?.[1]?.headers);
    expect(h.get("Authorization")).toBe("Bearer tok_123");
    expect(h.get("X-Privy-Identity-Token")).toBe("id_456");
  });

  it("throws ApiError carrying the server's code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthenticated", message: "no" } }), {
        status: 401,
      }),
    );
    await expect(apiFetch("/v1/me")).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("sends no Authorization header when there is no session", async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/v1/me");
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
  });

  it("sends no identity token before Privy has issued one", async () => {
    // The state every cold load starts in. It used to mean a network call per
    // request; now it simply means the header is absent until the token exists.
    setIdentityToken(null);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/v1/me");
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).has("X-Privy-Identity-Token")).toBe(false);
  });

  it("sends the token Privy last issued, without asking Privy again", async () => {
    setIdentityToken("id_789");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/v1/me");
    await apiFetch("/v1/money");
    await apiFetch("/v1/borrow");
    for (const call of spy.mock.calls) {
      expect(new Headers(call[1]?.headers).get("X-Privy-Identity-Token")).toBe("id_789");
    }
  });
});
