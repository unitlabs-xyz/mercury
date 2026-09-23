import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(async () => "tok_123"),
  getIdentityToken: vi.fn(async () => "id_456"),
}));

import { getAccessToken } from "@privy-io/react-auth";
import { ApiError, apiFetch } from "./client.js";

describe("apiFetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attaches both tokens", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
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
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    await apiFetch("/v1/me");
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
  });
});
