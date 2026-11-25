import { getBase58Decoder } from "@solana/kit";

/** How long a person has to sign before the challenge is refused. */
export const CHALLENGE_TTL_MS = 10 * 60_000;

export interface LinkMessageInput {
  /** The web app's origin, such as https://beta.trymercury.xyz. */
  readonly appUrl: string;
  readonly address: string;
  readonly nonce: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/**
 * What a wallet signs to be linked.
 *
 * Sign-In-With-Solana's plain-text form, so a wallet that knows it can show it
 * as a sign-in rather than as an opaque blob. It names the domain, so a
 * signature asked for on another site cannot be replayed here, and says in
 * words that linking does not let Mercury move anything.
 *
 * Built once, stored with the challenge, and checked against exactly what was
 * stored: the client never sends the message back.
 */
export function linkMessage(input: LinkMessageInput): string {
  const domain = new URL(input.appUrl).host;
  return [
    `${domain} wants you to link this wallet to your Mercury account:`,
    input.address,
    "",
    "Linking lets Mercury show this wallet's positions and build transactions for you to sign.",
    "It does not let Mercury move funds without your signature.",
    "",
    `URI: ${input.appUrl}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

/** Sixteen random bytes, base58. Makes every challenge's message unique, so no signature fits two. */
export function linkNonce(): string {
  return getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(16)));
}
