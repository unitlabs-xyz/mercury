import { describe, expect, it } from "vitest";
import { getBase58Encoder } from "@solana/kit";
import { CHALLENGE_TTL_MS, linkMessage, linkNonce } from "./message.js";

const ISSUED = new Date("2026-11-21T10:00:00.000Z");

describe("linkMessage", () => {
  it("is Sign-In-With-Solana's plain-text form, naming the app, the wallet and the time", () => {
    const message = linkMessage({
      appUrl: "https://beta.trymercury.xyz",
      address: "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
      nonce: "Nonce123",
      issuedAt: ISSUED,
      expiresAt: new Date(ISSUED.getTime() + CHALLENGE_TTL_MS),
    });
    expect(message).toBe(
      [
        "beta.trymercury.xyz wants you to link this wallet to your Mercury account:",
        "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
        "",
        "Linking lets Mercury show this wallet's positions and build transactions for you to sign.",
        "It does not let Mercury move funds without your signature.",
        "",
        "URI: https://beta.trymercury.xyz",
        "Version: 1",
        "Chain ID: mainnet",
        "Nonce: Nonce123",
        "Issued At: 2026-11-21T10:00:00.000Z",
        "Expiration Time: 2026-11-21T10:10:00.000Z",
      ].join("\n"),
    );
  });

  it("names a local app by host and port, as a wallet would show it", () => {
    const message = linkMessage({
      appUrl: "http://localhost:5173",
      address: "A",
      nonce: "N",
      issuedAt: ISSUED,
      expiresAt: ISSUED,
    });
    expect(message.split("\n")[0]).toBe(
      "localhost:5173 wants you to link this wallet to your Mercury account:",
    );
    expect(message).toContain("URI: http://localhost:5173");
  });

  it("gives a person ten minutes to sign", () => {
    expect(CHALLENGE_TTL_MS).toBe(600_000);
  });
});

describe("linkNonce", () => {
  it("is sixteen random bytes, base58", () => {
    expect(getBase58Encoder().encode(linkNonce())).toHaveLength(16);
  });

  it("is different every time, so no signature fits two challenges", () => {
    const seen = new Set(Array.from({ length: 200 }, () => linkNonce()));
    expect(seen.size).toBe(200);
  });
});
