import { Hono } from "hono";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { InboxItem } from "../notify/inbox-queries.js";
import { activityWire } from "./activity.js";

export interface NotificationDeps {
  readonly list: (
    userId: string,
  ) => Promise<{ readonly items: readonly InboxItem[]; readonly unread: number }>;
  readonly unread: (userId: string) => Promise<number>;
  /** False when there is no such notification on this account. */
  readonly read: (userId: string, id: string) => Promise<boolean>;
  readonly readAll: (userId: string, upTo: Date) => Promise<number>;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wire = (n: InboxItem) => ({
  id: n.id,
  kind: n.kind,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt === null ? null : n.readAt.toISOString(),
  activity: activityWire(n.activity),
});

/**
 * The inbox behind the bell. Nothing here reads the chain, so the badge can be
 * polled from every open tab for the price of one indexed count.
 */
export function notificationRoutes(deps: NotificationDeps): Hono {
  const app = new Hono();

  app.get("/v1/notifications", async (c) => {
    const { items, unread } = await deps.list(c.get("identity").userId);
    return c.json({ items: items.map(wire), unread });
  });

  app.get("/v1/notifications/unread", async (c) =>
    c.json({ unread: await deps.unread(c.get("identity").userId) }),
  );

  /*
   * "Mark all as read" says how far it read: the newest item the panel showed.
   * Something that arrived after the panel was drawn was never seen, and stays
   * unread. Registered before `/:id/read` so "read-all" is never taken for an id.
   */
  app.post("/v1/notifications/read-all", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const raw = body !== null && typeof body === "object" && "upTo" in body ? body.upTo : undefined;
    const upTo = typeof raw === "string" ? new Date(raw) : null;
    if (upTo === null || Number.isNaN(upTo.getTime())) {
      return c.json(fail("validation_failed", "Say how far to mark, as upTo."), 400);
    }
    await deps.readAll(c.get("identity").userId, upTo);
    return c.body(null, 204);
  });

  app.post("/v1/notifications/:id/read", async (c) => {
    const id = c.req.param("id");
    const found = UUID.test(id) && (await deps.read(c.get("identity").userId, id));
    if (!found) return c.json(fail("not_found", "There is no such notification on this account."), 404);
    return c.body(null, 204);
  });

  return app;
}
