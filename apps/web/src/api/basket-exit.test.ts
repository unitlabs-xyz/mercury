import { describe, expect, it, vi } from "vitest";

vi.mock("@privy-io/react-auth", () => ({}));
vi.mock("@privy-io/react-auth/solana", () => ({}));
const { paysOutTo } = await import("./baskets");

const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const prepared = (recipient: string, signed = recipient, portfolioId = "p-1") => ({
  portfolioId: "p-1",
  recipientAccountId: `${SOL}:${recipient}`,
  message: {
    portfolioId,
    recipientAccountId: `${SOL}:${signed}`,
    assets: [{ assetId: "a", amountRaw: "1" }],
    nonce: `0x${"a".repeat(64)}`,
    expiresAt: 1,
  },
});

describe("paysOutTo: what a basket owner is about to sign", () => {
  it("is true only when the review, the signed message and the portfolio all pay out to the address asked for", () => {
    expect(paysOutTo(prepared("MercuryWallet"), "MercuryWallet")).toBe(true);
    expect(paysOutTo(prepared("PhantomWallet"), "PhantomWallet")).toBe(true);
  });

  it("refuses a move that would pay out anywhere but the Mercury wallet", () => {
    expect(paysOutTo(prepared("AttackerWallet"), "MercuryWallet")).toBe(false);
  });

  it("refuses a message that says another recipient, or another portfolio, than the review shows", () => {
    expect(paysOutTo(prepared("MercuryWallet", "AttackerWallet"), "MercuryWallet")).toBe(false);
    expect(paysOutTo(prepared("MercuryWallet", "MercuryWallet", "p-2"), "MercuryWallet")).toBe(false);
  });
});
