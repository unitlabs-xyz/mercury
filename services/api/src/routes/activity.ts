import { Hono } from "hono";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { ReceiptDetail } from "../portfolio/receipt.js";

export interface ActivityRow {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: Date;
  readonly title: string;
  readonly subtitle: string | null;
  readonly amountUsd: string | null;
  readonly txSignature: string | null;
  /** Wrapped SOL for native SOL, the USDC mint for cash, else the stock token. */
  readonly mint: string | null;
  /** The instrument behind the mint, when the mint is a stock we list. */
  readonly logoUrl: string | null;
}

export interface Cursor {
  readonly occurredAt: Date;
  readonly id: string;
}

export interface ActivityDeps {
  readonly read: (userId: string, limit: number, cursor: Cursor | null) => Promise<readonly ActivityRow[]>;
  /**
   * One row and what it is made of. Null when the row is not this account's,
   * which is the same answer as no row at all.
   */
  readonly receipt: (
    userId: string,
    wallet: string | null,
    id: string,
  ) => Promise<{ readonly row: ActivityRow; readonly detail: ReceiptDetail | null } | null>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Keyset, not offset. The feed grows while it is being read, and an offset would
 * repeat or skip a row every time something new arrived mid-scroll.
 */
export const encodeCursor = (c: Cursor): string =>
  Buffer.from(`${c.occurredAt.toISOString()}|${c.id}`).toString("base64url");

export const decodeCursor = (raw: string): Cursor | null => {
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (iso === undefined || id === undefined || id.length === 0) return null;
    const occurredAt = new Date(iso);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
};

const fail = (code: string, message: string) => ({ error: { code, message } });

const wire = (i: ActivityRow) => ({
  id: i.id,
  kind: i.kind,
  occurredAt: i.occurredAt.toISOString(),
  title: i.title,
  subtitle: i.subtitle,
  mint: i.mint,
  logoUrl: i.logoUrl,
  amountUsd: i.amountUsd,
  txSignature: i.txSignature,
});

export function activityRoutes(deps: ActivityDeps): Hono {
  const app = new Hono();

  app.get("/v1/activity", async (c) => {
    const identity = c.get("identity");

    const asked = Number(c.req.query("limit"));
    const limit =
      Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_LIMIT) : DEFAULT_LIMIT;

    const raw = c.req.query("cursor");
    const cursor = raw === undefined ? null : decodeCursor(raw);
    if (raw !== undefined && cursor === null) {
      return c.json(fail("validation_failed", "That cursor is not one we issued."), 400);
    }

    const items = await deps.read(identity.userId, limit, cursor);
    const last = items[items.length - 1];

    return c.json({
      items: items.map(wire),
      // A full page means there is probably another. An empty one never has.
      nextCursor:
        items.length === limit && last !== undefined
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
    });
  });

  /*
   * A receipt: the row again, with the record behind it read back — the fee
   * in a trade, both halves of a pledge-and-borrow, who a send went to. Fetched
   * when somebody opens a row, so the feed itself stays one cheap query.
   */
  app.get("/v1/activity/:id", async (c) => {
    const identity = c.get("identity");
    const found = await deps.receipt(identity.userId, identity.walletAddress, c.req.param("id"));
    if (found === null) return c.json(fail("not_found", "There is no such event on this account."), 404);
    return c.json({ item: wire(found.row), detail: found.detail });
  });

  return app;
}
