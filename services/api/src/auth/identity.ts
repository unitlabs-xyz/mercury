import { verifyIdentityToken } from "@privy-io/node";
import { privyJwks } from "./verifier.js";
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
  /** Null when this account has no linked email — a social login, say. */
  readonly email: string | null;
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
  /** A pasted PEM. Omit it and the app's published JWKS is used instead. */
  verificationKey?: string | undefined;
}): UserDirectory => ({
  async read(identityToken) {
    const user = await verifyIdentityToken({
      identity_token: identityToken,
      app_id: opts.appId,
      verification_key: opts.verificationKey ?? privyJwks(opts.appId),
    });
    const wallet = user.linked_accounts.find(
      (a) =>
        a.type === "wallet" &&
        "chain_type" in a &&
        a.chain_type === "solana" &&
        "connector_type" in a &&
        a.connector_type === "embedded",
    );
    // The same signed list the wallet came from. Email is the only login method
    // this app offers, so in practice it is always here; the null case is a
    // Privy account linked some other way, and it costs nothing to allow.
    const email = user.linked_accounts.find((a) => a.type === "email");
    return {
      privyUserId: user.id,
      solanaAddress: wallet && "address" in wallet ? wallet.address : null,
      email: email && "address" in email ? email.address : null,
    };
  },
});

export const resolveIdentity = async (
  db: Db,
  directory: UserDirectory,
  token: VerifiedToken,
  identityToken: string | null,
): Promise<Identity> => {
  const find = () => db.query.users.findFirst({ where: eq(users.privyUserId, token.privyUserId) });

  /*
   * A first visit sends several requests at once, and each finds no user. One
   * insert wins; the rest meet the unique index and get nothing back. That is
   * the same person, created a moment ago by a request beside this one, so
   * the answer is to read it rather than to fail.
   */
  const user =
    (await find()) ??
    (
      await db.insert(users).values({ privyUserId: token.privyUserId }).onConflictDoNothing().returning()
    )[0] ??
    (await find());

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

    /*
     * Keep the address we hold in step with Privy's.
     *
     * Written on every request rather than only at signup, because signup is the
     * one moment it might be missing — a session can be valid before the
     * identity token arrives — and because somebody who changes their email in
     * Privy would otherwise keep an address here that no longer reaches them. An
     * alert sent to a stale address is worse than one not sent: it looks
     * delivered.
     *
     * The guard is not an optimisation. Without it every authenticated request
     * writes to `user`, and the portfolio page alone makes several a minute.
     */
    // `?? null` rather than a bare null check: a directory that omits the field
    // hands back undefined, and Drizzle rejects an empty `set` rather than
    // writing nothing. Absent and null both mean "Privy named no address".
    const email = claimed.email ?? null;
    if (email !== null && email !== user.email) {
      await db.update(users).set({ email }).where(eq(users.id, user.id));
    }
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
