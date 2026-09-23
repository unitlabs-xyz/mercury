import { verifyIdentityToken } from "@privy-io/node";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import type { VerifiedToken } from "./verifier.js";

export interface Identity {
  readonly userId: string;
  readonly privyUserId: string;
  /** Null when Privy is still provisioning, or no identity token was sent. */
  readonly walletAddress: string | null;
}

/** What Privy itself says about a user, as opposed to what the caller claims. */
export interface PrivyUser {
  readonly privyUserId: string;
  readonly solanaAddress: string | null;
}

/**
 * Reads Privy's signed claim about a user from an identity token.
 *
 * A caller that could name its own wallet address could name somebody else's,
 * so the address never comes from the request body — only from a token Privy
 * signed. `verifyIdentityToken` does this offline against the public
 * verification key, so there is no round-trip and no app secret involved.
 */
export interface UserDirectory {
  read(identityToken: string): Promise<PrivyUser>;
}

export const createPrivyDirectory = (opts: {
  appId: string;
  verificationKey: string;
}): UserDirectory => ({
  async read(identityToken) {
    const user = await verifyIdentityToken({
      identity_token: identityToken,
      app_id: opts.appId,
      verification_key: opts.verificationKey,
    });
    const wallet = user.linked_accounts.find(
      (a) =>
        a.type === "wallet" &&
        "chain_type" in a &&
        a.chain_type === "solana" &&
        "connector_type" in a &&
        a.connector_type === "embedded",
    );
    return {
      privyUserId: user.id,
      solanaAddress: wallet && "address" in wallet ? wallet.address : null,
    };
  },
});

export const resolveIdentity = async (
  db: Db,
  directory: UserDirectory,
  token: VerifiedToken,
  identityToken: string | null,
): Promise<Identity> => {
  const existing = await db.query.users.findFirst({
    where: eq(users.privyUserId, token.privyUserId),
  });

  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ privyUserId: token.privyUserId })
        .onConflictDoNothing()
        .returning()
    )[0];

  if (!user) throw new Error(`could not create or find user for ${token.privyUserId}`);

  let address: string | null = null;
  if (identityToken) {
    const claimed = await directory.read(identityToken);
    // Two separately signed tokens, so they must agree on who this is. A
    // mismatch means somebody paired their access token with another user's
    // identity token, and we take neither.
    if (claimed.privyUserId !== token.privyUserId) {
      throw new Error("identity token does not match the access token");
    }
    address = claimed.solanaAddress;
  }

  if (address) {
    const known = await db.query.wallets.findFirst({ where: eq(wallets.address, address) });
    if (!known) {
      await db
        .insert(wallets)
        .values({ userId: user.id, address, kind: "privy_embedded", isPrimary: true })
        .onConflictDoNothing()
        .returning();
    }
  }

  return { userId: user.id, privyUserId: user.privyUserId, walletAddress: address };
};
