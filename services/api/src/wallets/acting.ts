import type { Context, MiddlewareHandler } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { wallets } from "../db/schema.js";
import { followed } from "./active.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

/** The header that picks the wallet a request is for: a wallet id, `all`, or absent for the Mercury wallet. */
export const WALLET_HEADER = "X-Mercury-Wallet";
/** The header's value for every followed wallet at once. Reads only. */
export const ALL_WALLETS = "all";

export interface ActingWallet {
  readonly id: string;
  readonly address: string;
  readonly kind: "privy_embedded" | "external";
  readonly isPrimary: boolean;
  readonly label: string | null;
}

/**
 * Which of the caller's wallets a request is for.
 *
 * A list either way, so a read sums over it the same whether it names one
 * wallet or every one: `all` is a read of several wallets, never a different
 * read. Empty while Privy is still provisioning the Mercury wallet, which every
 * read already answers as an empty account.
 */
export interface Acting {
  readonly all: boolean;
  readonly wallets: readonly ActingWallet[];
}

declare module "hono" {
  interface ContextVariableMap {
    acting: Acting;
  }
}

export interface ActingDeps {
  readonly db: Db;
  /** Told each linked wallet being read, as `requireAuth` tells the Mercury wallet. See `jobs/presence.ts`. */
  readonly onSeen?: (address: string) => void;
  /** Told each linked wallet being read, for `last_viewed_at`. See `wallets/viewed.ts`. */
  readonly onViewed?: (address: string) => void;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

/**
 * The caller's followed wallets, the Mercury wallet first and then linked
 * wallets in the order they were linked: the order every list of them is shown in.
 */
export const followedWallets = (db: Db, userId: string): Promise<readonly ActingWallet[]> =>
  db
    .select({
      id: wallets.id,
      address: wallets.address,
      kind: wallets.kind,
      isPrimary: wallets.isPrimary,
      label: wallets.label,
    })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), followed))
    .orderBy(desc(wallets.isPrimary), asc(wallets.linkedAt), asc(wallets.createdAt));

/**
 * Mount after `requireAuth`. Reads `X-Mercury-Wallet` and sets `acting`.
 *
 * - Absent: the Mercury wallet. iOS never sends it, and nor does a web client
 *   from before linked wallets, so both keep reading what they always read.
 * - A wallet id: it must be one of the caller's followed wallets. Anything
 *   else, someone else's wallet or one they unlinked, is a 403, and the same
 *   403 whichever it is, so the answer says nothing about a wallet that is not theirs.
 * - `all`: every followed wallet. Write routes refuse it; see `mercuryWalletOnly`.
 */
export const actingWallet = (deps: ActingDeps): MiddlewareHandler => {
  return async (c, next) => {
    const asked = c.req.header(WALLET_HEADER)?.trim() ?? "";
    const owned = await followedWallets(deps.db, c.get("identity").userId);

    let acting: Acting;
    if (asked === "") {
      acting = { all: false, wallets: owned.filter((w) => w.isPrimary) };
    } else if (asked === ALL_WALLETS) {
      acting = { all: true, wallets: owned };
    } else {
      const one = owned.find((w) => w.id === asked);
      if (one === undefined) {
        return c.json(fail("wallet_forbidden", "That wallet isn't on your account."), 403);
      }
      acting = { all: false, wallets: [one] };
    }
    c.set("acting", acting);

    // Being looked at is what keeps a linked wallet's figures fresh. The
    // Mercury wallet is reported by `requireAuth` already.
    for (const w of acting.wallets) {
      if (w.isPrimary) continue;
      deps.onSeen?.(w.address);
      deps.onViewed?.(w.address);
    }

    await next();
    return undefined;
  };
};

/**
 * The one wallet a request is for, or null when there is none yet, for a read
 * that only makes sense of one wallet. Under `all` it is null too: those
 * routes answer 400 to `all` before they get here; see `oneWalletOnly`.
 */
export const actingOne = (c: Context): ActingWallet | null => {
  const acting = c.get("acting");
  return acting.all ? null : (acting.wallets[0] ?? null);
};

/**
 * For a read of one wallet's detail, which has no sum: one holding's
 * wrappers, one transaction's receipt. `all` is a 400 there, as it is on a write.
 */
export const oneWalletOnly = (): MiddlewareHandler => async (c, next) => {
  if (c.get("acting").all) {
    return c.json(fail("wallet_all", "Choose a wallet to see this."), 400);
  }
  await next();
  return undefined;
};

/**
 * For a route that acts for the Mercury wallet alone: today the Symmetry
 * basket vaults (`/v1/baskets/*`), which were never built for a linked wallet.
 * Every other route that acts takes the wallet chosen (`oneWalletToAct`).
 *
 * The web sends the header on every request, writes included. Without this a
 * request made while a linked wallet was chosen would be built for the Mercury
 * wallet instead, without a word. `all` is a 400, as the spec has it for every
 * write; a linked wallet is a 409, a wallet this route can't act for.
 *
 * Reads pass, so it can be mounted on a whole path: `/v1/orders/*` holds the
 * order a person is looking at as well as the ones they place.
 */
export const mercuryWalletOnly = (): MiddlewareHandler => async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    await next();
    return undefined;
  }
  const acting = c.get("acting");
  if (acting.all) {
    return c.json(fail("wallet_all", "Choose a wallet to do this from."), 400);
  }
  const one = acting.wallets[0];
  if (one !== undefined && !one.isPrimary) {
    return c.json(
      fail(
        "wallet_read_only",
        "This can only be done from your Mercury wallet for now. Switch to it to continue.",
      ),
      409,
    );
  }
  await next();
  return undefined;
};

/**
 * For a route that acts, once linked wallets can: it acts for the one wallet
 * chosen, the Mercury wallet or a linked one. `all` is a 400, as the spec has
 * it for every write: a trade for every wallet at once would not say whose.
 * Reads pass, so it can be mounted on a whole path, as `mercuryWalletOnly` is.
 */
export const oneWalletToAct = (): MiddlewareHandler => async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.get("acting").all) {
    return c.json(fail("wallet_all", "Choose a wallet to do this from."), 400);
  }
  await next();
  return undefined;
};

/** The wallet a write acts for, and its address as the write should use it. */
export interface Writer {
  readonly id: string;
  readonly address: string;
  readonly isPrimary: boolean;
  /** What to call it where the person approves: "Mercury", its label, or its short address. */
  readonly label: string | null;
}

/**
 * The wallet a write acts for: the one chosen, never a wallet the caller only
 * names. The acting middleware has already checked the choice against the
 * caller's own followed wallets in the database, and a linked wallet was
 * proven theirs by its signature when it was linked. The Mercury wallet's
 * address is the one Privy signed into the session, as every write used
 * before; a linked wallet's is its row's. Null when there is no wallet to act
 * for: a session whose Mercury wallet is still being made, or every wallet at
 * once (which `oneWalletToAct` turns away first).
 */
export const writerOf = (c: Context): Writer | null => {
  const one = actingOne(c);
  if (one === null) return null;
  if (one.isPrimary) {
    const signed = c.get("identity").walletAddress;
    return signed === null ? null : { id: one.id, address: signed, isPrimary: true, label: one.label };
  }
  return { id: one.id, address: one.address, isPrimary: false, label: one.label };
};
