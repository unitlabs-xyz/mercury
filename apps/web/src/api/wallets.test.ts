import { describe, expect, it } from "vitest";
import { getBase58Encoder } from "@solana/kit";
import { ApiError } from "./client";
import {
  linkedCount,
  linkedLine,
  linkErrorCopy,
  shortAddress,
  signatureBase58,
  walletName,
  type AccountWallet,
} from "./wallets";

const PHANTOM = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";

const wallet = (over: Partial<AccountWallet> = {}): AccountWallet => ({
  id: "w1",
  address: PHANTOM,
  kind: "external",
  isPrimary: false,
  label: null,
  linkedAt: "2026-11-21T10:00:00.000Z",
  ...over,
});

describe("shortAddress", () => {
  it("keeps the first and last four, as a wallet shows it", () => {
    expect(shortAddress(PHANTOM)).toBe("7EYn…awMs");
  });
  it("leaves a short string whole", () => expect(shortAddress("abc")).toBe("abc"));
});

describe("walletName", () => {
  it("calls the Mercury wallet Mercury, whatever else it holds", () => {
    expect(walletName(wallet({ isPrimary: true, label: "ignored" }))).toBe("Mercury");
  });
  it("uses a linked wallet's name, or its short address without one", () => {
    expect(walletName(wallet({ label: "Phantom main" }))).toBe("Phantom main");
    expect(walletName(wallet())).toBe("7EYn…awMs");
  });
});

describe("linkedCount and linkedLine", () => {
  const account = {
    wallets: [wallet({ isPrimary: true, kind: "privy_embedded" }), wallet(), wallet()],
    limit: 5,
  };
  it("counts linked wallets, not the Mercury wallet", () => expect(linkedCount(account.wallets)).toBe(2));
  it("says how many of how many", () => expect(linkedLine(account)).toBe("2 of 5 linked"));
  it("reads zero with only the Mercury wallet", () =>
    expect(linkedLine({ wallets: [wallet({ isPrimary: true })], limit: 5 })).toBe("0 of 5 linked"));
});

describe("signatureBase58", () => {
  const bytes = new Uint8Array(64).map((_, i) => i + 1);

  it("encodes the bytes AppKit's provider answers", () => {
    const encoded = signatureBase58(bytes);
    expect(new Uint8Array(getBase58Encoder().encode(encoded))).toEqual(bytes);
  });

  it("takes Phantom's { signature } shape too", () => {
    expect(signatureBase58({ signature: bytes })).toBe(signatureBase58(bytes));
  });

  it("passes a signature already in base58 through", () => {
    expect(signatureBase58("5j7s")).toBe("5j7s");
    expect(signatureBase58({ signature: "5j7s" })).toBe("5j7s");
  });

  it("says so plainly when the wallet answered something else", () => {
    for (const odd of [undefined, null, "", {}, new Uint8Array(10), { signature: 42 }]) {
      expect(() => signatureBase58(odd)).toThrow("Your wallet did not return a signature.");
    }
  });
});

describe("linkErrorCopy", () => {
  it("uses the server's own sentence", () => {
    expect(linkErrorCopy(new ApiError(409, "link_limit", "Unlink a wallet to link another."))).toBe(
      "Unlink a wallet to link another.",
    );
  });

  it("says a declined prompt was declined, however the wallet words it", () => {
    for (const message of ["User rejected the request.", "Request denied", "User canceled"]) {
      expect(linkErrorCopy(new Error(message))).toBe("You declined to sign, so nothing was linked.");
    }
  });

  it("passes anything else through, and has a sentence for nothing at all", () => {
    expect(linkErrorCopy(new Error("Connect the wallet first."))).toBe("Connect the wallet first.");
    expect(linkErrorCopy("??")).toBe("Linking didn't go through. Try again.");
  });
});
