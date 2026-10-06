import { describe, expect, it } from "vitest";
import { basketEnrollmentEnabled, enrollBasket } from "./baskets";
import { MercuryClient } from "@mercury/sdk";

describe("enrollBasket", () => {
  it("signs the Glider message and submits only the issued intent and signature", async () => {
    let submitted: unknown;
    const portfolio = { portfolioId: "portfolio-1", ownerAccountId: "solana:owner", strategyId: "strategy-1", smartAccounts: [] };
    const result = await enrollBasket("magnificent-seven", {
      prepare: async () => ({ intentId: "intent-1", authorization: { kind: "solana-message", text: "Sign this" } }),
      submit: async (body) => { submitted = body; return portfolio; },
      signMessage: async (text) => { expect(text).toBe("Sign this"); return "signature-1"; },
      signTransaction: async () => { throw new Error("wrong signing path"); },
    });
    expect(result).toEqual(portfolio);
    expect(submitted).toEqual({ intentId: "intent-1", signed: "signature-1" });
  });
});

it("the typed SDK sends both Privy tokens when reading an enrollment", async () => {
  let authorization = "";
  let identity = "";
  const client = new MercuryClient({
    baseUrl: "https://mercury.test", token: "access", identityToken: "identity",
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization") ?? "";
      identity = headers.get("x-privy-identity-token") ?? "";
      return new Response(JSON.stringify({ portfolio: null }));
    },
  });
  expect(await client.basketEnrollment("magnificent-seven")).toEqual({ portfolio: null });
  expect([authorization, identity]).toEqual(["Bearer access", "identity"]);
});

it("does not treat design-sample access as a real wallet session", () => {
  expect(basketEnrollmentEnabled(true, false, false)).toBe(false);
  expect(basketEnrollmentEnabled(true, true, false)).toBe(false);
  expect(basketEnrollmentEnabled(true, true, true)).toBe(true);
});
