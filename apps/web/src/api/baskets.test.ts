import { describe, expect, it } from "vitest";
import { basketEnrollmentEnabled, enrollBasket, fundBasket } from "./baskets";
import { MercuryClient } from "@mercury/sdk";

describe("enrollBasket", () => {
  it("signs the Glider message and submits only the issued intent and signature", async () => {
    let submitted: unknown;
    const portfolio = {
      portfolioId: "portfolio-1",
      ownerAccountId: "solana:owner",
      strategyId: "strategy-1",
      smartAccounts: [],
    };
    const result = await enrollBasket("magnificent-seven", {
      prepare: async () => ({
        intentId: "intent-1",
        authorization: { kind: "solana-message", text: "Sign this" },
      }),
      submit: async (body) => {
        submitted = body;
        return portfolio;
      },
      signMessage: async (text) => {
        expect(text).toBe("Sign this");
        return "signature-1";
      },
      signTransaction: async () => {
        throw new Error("wrong signing path");
      },
    });
    expect(result).toEqual(portfolio);
    expect(submitted).toEqual({ intentId: "intent-1", signed: "signature-1" });
  });
});

it("the typed SDK sends both Privy tokens when reading an enrollment", async () => {
  let authorization = "";
  let identity = "";
  const client = new MercuryClient({
    baseUrl: "https://mercury.test",
    token: "access",
    identityToken: "identity",
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

it("the typed SDK prepares a funding transfer with only the requested amount", async () => {
  let body: unknown;
  const client = new MercuryClient({
    baseUrl: "https://mercury.test",
    token: "access",
    identityToken: "identity",
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          portfolioId: "portfolio-1",
          destinationAccountId: "solana:mainnet:Vault",
          amountRaw: "12500000",
          transaction: "unsigned",
          expiresAt: "2026-10-06T12:00:00Z",
        }),
      );
    },
  });
  const prepared = await client.prepareBasketFunding("magnificent-seven", "12.50");
  expect(body).toEqual({ amountUsd: "12.50" });
  expect(prepared.amountRaw).toBe("12500000");
});

it("does not treat design-sample access as a real wallet session", () => {
  expect(basketEnrollmentEnabled(true, false, false)).toBe(false);
  expect(basketEnrollmentEnabled(true, true, false)).toBe(false);
  expect(basketEnrollmentEnabled(true, true, true)).toBe(true);
});

it("signs and sends only funding prepared for the reviewed portfolio and amount", async () => {
  const portfolio = {
    portfolioId: "portfolio-1",
    ownerAccountId: "solana:owner",
    strategyId: "strategy-1",
    smartAccounts: [{ accountId: "solana:mainnet:Vault" }],
  };
  let sent: unknown;
  const result = await fundBasket("12.50", portfolio, {
    prepare: async () => ({
      portfolioId: "portfolio-1",
      destinationAccountId: "solana:mainnet:Vault",
      amountRaw: "12500000",
      transaction: "unsigned",
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
    }),
    sign: async (wire) => {
      expect(wire).toBe("unsigned");
      return "signed";
    },
    send: async (wire) => {
      sent = wire;
      return { signature: "sig-1", status: "confirmed" as const };
    },
  });
  expect(sent).toBe("signed");
  expect(result.status).toBe("confirmed");
});

it("never signs a funding transaction prepared for another destination", async () => {
  const portfolio = {
    portfolioId: "portfolio-1",
    ownerAccountId: "solana:owner",
    strategyId: "strategy-1",
    smartAccounts: [{ accountId: "solana:mainnet:Vault" }],
  };
  await expect(
    fundBasket("12.50", portfolio, {
      prepare: async () => ({
        portfolioId: "portfolio-1",
        destinationAccountId: "solana:mainnet:Other",
        amountRaw: "12500000",
        transaction: "unsigned",
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
      }),
      sign: async () => {
        throw new Error("must not sign");
      },
      send: async () => {
        throw new Error("must not send");
      },
    }),
  ).rejects.toThrow(/destination/i);
});
