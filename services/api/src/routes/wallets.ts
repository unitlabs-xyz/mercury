import { Hono } from "hono";
import { isAddress } from "@solana/kit";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { KeptWallet, LinkRefusal, WalletView } from "../wallets/store.js";

/**
 * Linking, listing, naming and unlinking a person's wallets. The queries are
 * functions, so every route here is tested with a plain object.
 */
export interface WalletDeps {
  /** How many wallets a person may have linked at once. */
  readonly limit: number;
  readonly list: (userId: string) => Promise<readonly WalletView[]>;
  /** Unlinked wallets whose history was kept, to delete it. Absent, none is listed. */
  readonly kept?: (userId: string) => Promise<readonly KeptWallet[]>;
  readonly challenge: (
    userId: string,
    address: string,
  ) => Promise<
    | { kind: "ok"; challengeId: string; message: string; expiresAt: Date }
    | { kind: "refused"; reason: LinkRefusal }
  >;
  readonly link: (
    userId: string,
    challengeId: string,
    signature: string,
  ) => Promise<
    { kind: "linked"; wallet: WalletView; relinked: boolean } | { kind: "refused"; reason: LinkRefusal }
  >;
  readonly rename: (
    userId: string,
    walletId: string,
    label: string | null,
  ) => Promise<{ kind: "renamed"; wallet: WalletView } | { kind: "not_found" } | { kind: "primary" }>;
  readonly unlink: (
    userId: string,
    walletId: string,
    deleteHistory: boolean,
  ) => Promise<{ kind: "unlinked" } | { kind: "not_found" } | { kind: "primary" }>;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough for "Phantom — trading", short enough for a header. */
export const LABEL_MAX = 40;

const wire = (w: WalletView) => ({
  id: w.id,
  address: w.address,
  kind: w.kind,
  isPrimary: w.isPrimary,
  label: w.label,
  linkedAt: w.linkedAt === null ? null : w.linkedAt.toISOString(),
});

/*
 * What each refusal answers. The limit and the two "whose wallet is this"
 * cases are conflicts with what the account already holds; a challenge or a
 * signature that does not check out is a bad request.
 */
const REFUSED: Record<LinkRefusal, { status: 400 | 409; message: string }> = {
  link_limit: { status: 409, message: "Unlink a wallet to link another." },
  already_linked: { status: 409, message: "This wallet is already on your account." },
  linked_elsewhere: {
    status: 409,
    message:
      "This wallet is linked to another Mercury account. Its owner can free it there with Unlink and delete history.",
  },
  challenge_invalid: { status: 400, message: "That request to link has expired. Start again." },
  bad_signature: { status: 400, message: "The signature does not match this wallet." },
};

const bodyOf = async (c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown> | null> => {
  const body: unknown = await c.req.json().catch(() => null);
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
};

export function walletRoutes(deps: WalletDeps): Hono {
  const app = new Hono();

  /** The Mercury wallet first, then linked wallets in the order they were linked. */
  app.get("/v1/wallets", async (c) => {
    const userId = c.get("identity").userId;
    const [rows, kept] = await Promise.all([deps.list(userId), deps.kept?.(userId) ?? []]);
    return c.json({
      wallets: rows.map(wire),
      limit: deps.limit,
      // Unlinked with their history kept: deleted with DELETE /v1/wallets/:id?history=delete.
      kept: kept.map((k) => ({
        id: k.id,
        address: k.address,
        label: k.label,
        unlinkedAt: k.unlinkedAt.toISOString(),
      })),
    });
  });

  /*
   * Linking needs the Mercury wallet to exist: it is the account a linked
   * wallet hangs from, and every write that does not yet name a wallet takes it.
   */
  app.post("/v1/wallets/link/challenge", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json(fail("wallet_not_ready", "Your Mercury wallet is still being set up."), 409);
    }
    const body = await bodyOf(c);
    const address = typeof body?.["address"] === "string" ? body["address"].trim() : "";
    if (!isAddress(address)) {
      return c.json(fail("invalid_address", "That is not a Solana wallet address."), 400);
    }
    const result = await deps.challenge(identity.userId, address);
    if (result.kind === "refused") {
      const r = REFUSED[result.reason];
      return c.json(fail(result.reason, r.message), r.status);
    }
    return c.json({
      challengeId: result.challengeId,
      message: result.message,
      expiresAt: result.expiresAt.toISOString(),
    });
  });

  app.post("/v1/wallets/link", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json(fail("wallet_not_ready", "Your Mercury wallet is still being set up."), 409);
    }
    const body = await bodyOf(c);
    const challengeId = body?.["challengeId"];
    const signature = body?.["signature"];
    if (
      typeof challengeId !== "string" ||
      !UUID.test(challengeId) ||
      typeof signature !== "string" ||
      signature.length === 0
    ) {
      return c.json(fail("validation_failed", "Send the challengeId and the wallet's signature."), 400);
    }
    const result = await deps.link(identity.userId, challengeId, signature);
    if (result.kind === "refused") {
      const r = REFUSED[result.reason];
      return c.json(fail(result.reason, r.message), r.status);
    }
    return c.json({ wallet: wire(result.wallet), relinked: result.relinked });
  });

  /** A name like "Phantom main". An empty or absent label clears it. */
  app.patch("/v1/wallets/:id", async (c) => {
    const id = c.req.param("id");
    const body = await bodyOf(c);
    const raw = body?.["label"];
    if (body === null || !("label" in body) || (raw !== null && typeof raw !== "string")) {
      return c.json(fail("validation_failed", "Send a label, or null to clear it."), 400);
    }
    const label = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
    if (label !== null && label.length > LABEL_MAX) {
      return c.json(fail("validation_failed", `A name can be at most ${LABEL_MAX} characters.`), 400);
    }
    if (!UUID.test(id)) return c.json(fail("not_found", "There is no such wallet on this account."), 404);
    const result = await deps.rename(c.get("identity").userId, id, label);
    if (result.kind === "not_found") {
      return c.json(fail("not_found", "There is no such wallet on this account."), 404);
    }
    if (result.kind === "primary") {
      return c.json(fail("primary_wallet", "Your Mercury wallet keeps its name."), 400);
    }
    return c.json({ wallet: wire(result.wallet) });
  });

  /** Unlinks. `?history=delete` also deletes everything Mercury kept about the wallet. */
  app.delete("/v1/wallets/:id", async (c) => {
    const id = c.req.param("id");
    const history = c.req.query("history");
    if (history !== undefined && history !== "delete") {
      return c.json(fail("validation_failed", "history can only be delete."), 400);
    }
    if (!UUID.test(id)) return c.json(fail("not_found", "There is no such wallet on this account."), 404);
    const result = await deps.unlink(c.get("identity").userId, id, history === "delete");
    if (result.kind === "not_found") {
      return c.json(fail("not_found", "There is no such wallet on this account."), 404);
    }
    if (result.kind === "primary") {
      return c.json(fail("primary_wallet", "Your Mercury wallet cannot be unlinked."), 400);
    }
    return c.body(null, 204);
  });

  return app;
}
