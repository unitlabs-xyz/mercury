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

describe("apiFetch, and the chosen wallet", () => {
  it("sends the wallet chosen in the header, unless the caller names one, and nothing for the Mercury wallet", async () => {
    const { setChosenWallet, WALLET_HEADER } = await import("./wallet-choice.js");
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const sent = () => new Headers(spy.mock.calls.at(-1)?.[1]?.headers).get(WALLET_HEADER);

    setChosenWallet(null);
    await apiFetch("/v1/portfolio");
    expect(sent()).toBeNull();

    setChosenWallet("phantom");
    await apiFetch("/v1/portfolio");
    expect(sent()).toBe("phantom");

    await apiFetch("/v1/portfolio", { headers: { [WALLET_HEADER]: "all" } });
    expect(sent()).toBe("all");
    setChosenWallet(null);
  });

  const forbidden = () =>
    new Response(
      JSON.stringify({ error: { code: "wallet_forbidden", message: "That wallet isn't on your account." } }),
      { status: 403 },
    );

  it("goes back to the Mercury wallet when the chosen one is no longer on the account, and reads again", async () => {
    // Unlinked here or elsewhere: the server refuses every read for it, the wallet list included.
    const { chosenWallet, setChosenWallet, WALLET_HEADER } = await import("./wallet-choice.js");
    setChosenWallet("unlinked-id");
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) =>
        new Headers(init?.headers).has(WALLET_HEADER)
          ? forbidden()
          : new Response(JSON.stringify({ wallets: [] }), { status: 200 }),
      );

    await expect(apiFetch("/v1/wallets")).resolves.toEqual({ wallets: [] });
    expect(chosenWallet()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(new Headers(spy.mock.calls[1]?.[1]?.headers).has(WALLET_HEADER)).toBe(false);
  });

  it("forgets a stale choice on a write too, but never sends the write again for another wallet", async () => {
    const { chosenWallet, setChosenWallet } = await import("./wallet-choice.js");
    setChosenWallet("unlinked-id");
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => forbidden());

    await expect(apiFetch("/v1/orders", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 403,
      code: "wallet_forbidden",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(chosenWallet()).toBeNull();
  });

  it("leaves the choice alone when the caller named the wallet itself", async () => {
    const { chosenWallet, setChosenWallet, WALLET_HEADER } = await import("./wallet-choice.js");
    setChosenWallet("phantom");
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => forbidden());

    await expect(apiFetch("/v1/portfolio", { headers: { [WALLET_HEADER]: "other" } })).rejects.toMatchObject({
      status: 403,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(chosenWallet()).toBe("phantom");
    setChosenWallet(null);
  });

  it("keeps a choice made while the refused request was in flight", async () => {
    const { chosenWallet, setChosenWallet } = await import("./wallet-choice.js");
    setChosenWallet("unlinked-id");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      setChosenWallet("phantom");
      return forbidden();
    });

    await expect(apiFetch("/v1/portfolio")).rejects.toMatchObject({ status: 403 });
    expect(chosenWallet()).toBe("phantom");
    setChosenWallet(null);
  });
});
