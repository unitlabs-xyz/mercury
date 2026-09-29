import type { NewOrder, OrderStatus, OrderStore, StoredOrder } from "./store.js";

/**
 * The same contract, in memory. It exists so the routes and the contract above
 * can be tested without Postgres — not as a fixture mode: nothing wires it into
 * a running server, and `buildDeps` has no branch that reaches it.
 */
export const memoryOrderStore = (): OrderStore => {
  const rows = new Map<string, { order: NewOrder; stored: StoredOrder }>();
  return {
    async create(order) {
      const stored: StoredOrder = {
        id: crypto.randomUUID(),
        decision: order.decision,
        status: order.status,
        createdAt: new Date().toISOString(),
      };
      rows.set(stored.id, { order, stored });
      return stored;
    },
    async byId(userId, id) {
      const row = rows.get(id);
      return row === undefined || row.order.userId !== userId ? null : row.stored;
    },
    async setStatus(userId, id, status: OrderStatus) {
      const row = rows.get(id);
      if (row === undefined || row.order.userId !== userId) return;
      rows.set(id, { order: row.order, stored: { ...row.stored, status } });
    },
    async reprice(userId, id, next) {
      const row = rows.get(id);
      if (row === undefined || row.order.userId !== userId) return;
      rows.set(id, {
        order: { ...row.order, ...next },
        stored: { ...row.stored, decision: next.decision, status: next.status },
      });
    },
  };
};
