import { Hono } from "hono";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface ActivityRow {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: Date;
  readonly title: string;
  readonly subtitle: string | null;
  readonly amountUsd: string | null;
  readonly txSignature: string | null;
}

export interface Cursor {
  readonly occurredAt: Date;
  readonly id: string;
}

export interface ActivityDeps {
  readonly read: (userId: string, limit: number, cursor: Cursor | null) => Promise<readonly ActivityRow[]>;
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

export function activityRoutes(deps: ActivityDeps): Hono {
  const app = new Hono();

  app.get("/v1/activity", async (c) => {
    const identity = c.get("identity");

    const asked = Number(c.req.query("limit"));
    const limit = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_LIMIT) : DEFAULT_LIMIT;

    const raw = c.req.query("cursor");
    const cursor = raw === undefined ? null : decodeCursor(raw);
    if (raw !== undefined && cursor === null) {
      return c.json(fail("validation_failed", "That cursor is not one we issued."), 400);
    }

    const items = await deps.read(identity.userId, limit, cursor);
    const last = items[items.length - 1];

    return c.json({
      items: items.map((i) => ({
        id: i.id,
        kind: i.kind,
        occurredAt: i.occurredAt.toISOString(),
        title: i.title,
        subtitle: i.subtitle,
        amountUsd: i.amountUsd,
        txSignature: i.txSignature,
      })),
      // A full page means there is probably another. An empty one never has.
      nextCursor:
        items.length === limit && last !== undefined
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
    });
  });

  return app;
}
