import type { AccountNotice, ChainSubscriptions, LogNotice, Subscription } from "../ports.js";

/**
 * Just enough of a WebSocket to carry JSON-RPC, so the whole of this module is
 * testable without a network and the platform's own quirks sit in one place.
 */
export interface Socket {
  send(payload: string): void;
  close(): void;
}

export interface SocketEvents {
  readonly opened: () => void;
  readonly received: (payload: string) => void;
  /** The socket is gone, whether it failed, was refused or was closed from the other end. */
  readonly closed: () => void;
}

export type OpenSocket = (url: string, events: SocketEvents) => Socket;

/** One endpoint, and how much one connection to it carries. */
export interface SubscriptionEndpoint {
  readonly url: string;
  /**
   * Subscriptions one connection holds, the heartbeat included. Measured, never
   * guessed: on 14 November 2026 Solana Vibe Station took 398 of 400
   * `accountSubscribe` calls on one connection, and Solana's own endpoint took
   * 55 and then closed with 1013.
   */
  readonly perConnection: number;
}

export interface SubscriptionsConfig {
  /** Where to subscribe. Empty is allowed and means nothing is watched. */
  readonly endpoints: readonly SubscriptionEndpoint[];
  readonly open?: OpenSocket;
  /**
   * No message of any kind for this long means the socket is gone.
   *
   * A node that stops sending looks exactly like a quiet market, which is why
   * every connection also subscribes to slots: they arrive about twice a
   * second, so silence this long is the socket and not the chain.
   */
  readonly quietMs?: number;
  /** The first wait before a dropped socket is reopened; doubles to `maxRetryMs`. */
  readonly retryMs?: number;
  readonly maxRetryMs?: number;
  readonly now?: () => number;
  readonly schedule?: (fn: () => void, ms: number) => void;
}

/** What one watcher asked for, so it can be asked for again on a new socket. */
interface Watch {
  readonly method: "logsSubscribe" | "accountSubscribe";
  readonly params: readonly unknown[];
  readonly told: (payload: unknown, slot: number) => void;
  /** The node's own id for it, once it has given one. Null while it has not. */
  serverId: number | null;
}

interface Connection {
  readonly url: string;
  readonly limit: number;
  socket: Socket | null;
  /** Watches this connection carries, by our own id. */
  readonly watches: Map<number, Watch>;
  open: boolean;
  lastMessageAt: number;
  /** Reopens in a row without the socket ever answering. Resets once one does. */
  failures: number;
  /** Bumped every time the socket is replaced, so an old timer does nothing. */
  epoch: number;
}

const defaultOpen: OpenSocket = (url, events) => {
  const socket = new WebSocket(url);
  socket.addEventListener("open", () => events.opened());
  socket.addEventListener("message", (event: MessageEvent) => events.received(String(event.data)));
  socket.addEventListener("close", () => events.closed());
  // An error is always followed by a close, so the one handler covers both.
  socket.addEventListener("error", () => undefined);
  return { send: (payload) => socket.send(payload), close: () => socket.close() };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

/**
 * Subscriptions over the public lane, on as many connections as the endpoints
 * will carry.
 *
 * Three things go wrong with a socket and all three are handled here, because
 * every caller would otherwise handle them again: it never opens, it opens and
 * then drops, and it stays open while the node quietly stops sending. The
 * first two are a reopen with a doubling wait; the third is why a heartbeat
 * subscription rides on every connection. A reopened socket is told every
 * address its connection was watching, so a caller's handle outlives any
 * number of reconnections and never has to be renewed.
 *
 * Connections fill before another is opened, and a new one goes to the
 * endpoint with the fewest, the one that carries most breaking the tie. That
 * keeps the bulk on the endpoint measured to take hundreds and still puts the
 * next connection somewhere else, so one endpoint refusing is not everything
 * refusing.
 */
export const solanaSubscriptions = (config: SubscriptionsConfig): ChainSubscriptions => {
  const open = config.open ?? defaultOpen;
  const now = config.now ?? Date.now;
  const schedule = config.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms).unref());
  const quietMs = config.quietMs ?? 60_000;
  const retryMs = config.retryMs ?? 1_000;
  const maxRetryMs = config.maxRetryMs ?? 60_000;
  const endpoints = [...config.endpoints];

  const connections: Connection[] = [];
  let nextWatchId = 1;
  let nextRequestId = 1;
  let stopped = false;

  /** Which watch a request id belongs to, so the node's answer can be matched to it. */
  const awaiting = new Map<number, { readonly connection: Connection; readonly watchId: number }>();

  const send = (connection: Connection, method: string, params: readonly unknown[]): number => {
    const id = nextRequestId++;
    connection.socket?.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return id;
  };

  const ask = (connection: Connection, watchId: number, watch: Watch): void => {
    const id = send(connection, watch.method, watch.params);
    awaiting.set(id, { connection, watchId });
  };

  /** Keeps `lastMessageAt` moving while nothing else happens, which is most of the time. */
  const heartbeat = (connection: Connection): void => void send(connection, "slotSubscribe", []);

  const watchQuiet = (connection: Connection): void => {
    const epoch = connection.epoch;
    schedule(() => {
      if (stopped || connection.epoch !== epoch) return;
      if (now() - connection.lastMessageAt >= quietMs) {
        // Closed, not reopened here: closing raises `closed`, which reopens
        // it with the same backoff a socket that dropped on its own gets.
        connection.socket?.close();
        connection.socket = null;
        connection.open = false;
        reopen(connection);
        return;
      }
      watchQuiet(connection);
    }, quietMs);
  };

  const connect = (connection: Connection): void => {
    if (stopped) return;
    connection.epoch += 1;
    connection.lastMessageAt = now();
    connection.open = false;
    for (const watch of connection.watches.values()) watch.serverId = null;
    connection.socket = open(connection.url, {
      opened: () => {
        connection.open = true;
        connection.failures = 0;
        connection.lastMessageAt = now();
        heartbeat(connection);
        // Everything this connection carries, asked for again: a reopened
        // socket starts out watching nothing at all.
        for (const [watchId, watch] of connection.watches) ask(connection, watchId, watch);
      },
      received: (payload) => receive(connection, payload),
      closed: () => {
        connection.open = false;
        connection.socket = null;
        reopen(connection);
      },
    });
    watchQuiet(connection);
  };

  const reopen = (connection: Connection): void => {
    if (stopped) return;
    const wait = Math.min(maxRetryMs, retryMs * 2 ** connection.failures);
    connection.failures += 1;
    const epoch = connection.epoch;
    schedule(() => {
      if (stopped || connection.epoch !== epoch) return;
      connect(connection);
    }, wait);
  };

  const receive = (connection: Connection, payload: string): void => {
    connection.lastMessageAt = now();
    let message: Record<string, unknown> | null;
    try {
      message = asRecord(JSON.parse(payload));
    } catch {
      // A node that sends something unreadable is not a reason to tear the
      // socket down: the next message is usually fine.
      return;
    }
    if (message === null) return;

    const id = message["id"];
    if (typeof id === "number") {
      const pending = awaiting.get(id);
      awaiting.delete(id);
      // A refused subscription keeps no id, so `live` stays false and whatever
      // depends on it goes on reading for itself.
      if (pending === undefined || typeof message["result"] !== "number") return;
      const watch = pending.connection.watches.get(pending.watchId);
      if (watch !== undefined) watch.serverId = message["result"];
      return;
    }

    const params = asRecord(message["params"]);
    const subscription = params?.["subscription"];
    if (typeof subscription !== "number") return;
    const result = asRecord(params?.["result"]);
    if (result === null) return;
    const slot = asRecord(result["context"])?.["slot"];
    for (const watch of connection.watches.values()) {
      if (watch.serverId !== subscription) continue;
      watch.told(result["value"], typeof slot === "number" ? slot : 0);
      return;
    }
  };

  /**
   * Where the next watch goes: a connection with room, or a new connection on
   * the endpoint carrying the fewest, the largest `perConnection` first.
   */
  const place = (): Connection | null => {
    for (const connection of connections) {
      if (connection.watches.size + 1 < connection.limit) return connection;
    }
    if (endpoints.length === 0) return null;
    const counts = new Map(endpoints.map((e) => [e.url, 0]));
    for (const connection of connections) counts.set(connection.url, (counts.get(connection.url) ?? 0) + 1);
    const chosen = [...endpoints].sort((a, b) => {
      const byCount = (counts.get(a.url) ?? 0) - (counts.get(b.url) ?? 0);
      return byCount === 0 ? b.perConnection - a.perConnection : byCount;
    })[0]!;
    const connection: Connection = {
      url: chosen.url,
      limit: chosen.perConnection,
      socket: null,
      watches: new Map(),
      open: false,
      lastMessageAt: now(),
      failures: 0,
      epoch: 0,
    };
    connections.push(connection);
    connect(connection);
    return connection;
  };

  const register = (
    method: Watch["method"],
    params: readonly unknown[],
    told: Watch["told"],
  ): Subscription => {
    const connection = place();
    if (connection === null) return { close: () => undefined };
    const watchId = nextWatchId++;
    const watch: Watch = { method, params, told, serverId: null };
    connection.watches.set(watchId, watch);
    if (connection.open) ask(connection, watchId, watch);
    return {
      close: () => {
        if (!connection.watches.delete(watchId)) return;
        if (watch.serverId !== null && connection.open) {
          const stop = method === "logsSubscribe" ? "logsUnsubscribe" : "accountUnsubscribe";
          send(connection, stop, [watch.serverId]);
        }
      },
    };
  };

  return {
    logsMentioning(address, told) {
      return register("logsSubscribe", [{ mentions: [address] }, { commitment: "confirmed" }], (value) => {
        const log = asRecord(value);
        const signature = log?.["signature"];
        if (typeof signature !== "string") return;
        const notice: LogNotice = { signature, failed: (log?.["err"] ?? null) !== null };
        told(notice);
      });
    },

    accountChanges(account, told) {
      return register(
        "accountSubscribe",
        [account, { commitment: "confirmed", encoding: "base64" }],
        (_value, slot) => {
          const notice: AccountNotice = { account, slot };
          told(notice);
        },
      );
    },

    get live() {
      if (stopped || connections.length === 0) return false;
      return connections.every(
        (connection) =>
          connection.open && [...connection.watches.values()].every((watch) => watch.serverId !== null),
      );
    },

    close() {
      stopped = true;
      for (const connection of connections) {
        connection.epoch += 1;
        connection.socket?.close();
        connection.socket = null;
        connection.open = false;
      }
    },
  };
};

/**
 * Subscriptions one connection to each endpoint carries, by host.
 *
 * Measured on 14 November 2026, not read from anybody's documentation: Solana
 * Vibe Station accepted 398 of 400 `accountSubscribe` calls on a single
 * connection, and Solana's own endpoint accepted 55 and then closed the socket
 * with code 1013. Both serve `logsSubscribe` with a `mentions` filter.
 */
const PER_CONNECTION: ReadonlyMap<string, number> = new Map([
  ["public.rpc.solanavibestation.com", 390],
  ["api.mainnet-beta.solana.com", 50],
]);

/**
 * What an endpoint nobody has measured is assumed to carry.
 *
 * Low on purpose. Going past what a node allows is not a slow socket, it is a
 * closed one, and a closed socket takes every address on it down with it.
 */
const UNMEASURED_PER_CONNECTION = 50;

/**
 * The lane's endpoints as places to subscribe, in the order given.
 *
 * The lane is configured as HTTP URLs — the same `SOLANA_PUBLIC_RPC_URLS` the
 * jobs read through — because an endpoint's socket lives at the same host, and
 * a second variable holding the same hosts is a second variable to get wrong.
 * Anything that is not a URL is passed over rather than thrown on: one bad
 * entry must not leave the jobs with no subscriptions at all.
 */
export const subscriptionEndpoints = (urls: readonly string[]): readonly SubscriptionEndpoint[] =>
  urls.flatMap((raw) => {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return [];
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return [
      {
        url: parsed.toString().replace(/\/$/, ""),
        perConnection: PER_CONNECTION.get(parsed.hostname) ?? UNMEASURED_PER_CONNECTION,
      },
    ];
  });
