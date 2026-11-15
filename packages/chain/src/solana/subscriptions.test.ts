import { describe, expect, it } from "vitest";
import {
  solanaSubscriptions,
  subscriptionEndpoints,
  type OpenSocket,
  type SocketEvents,
} from "./subscriptions.js";

const BIG = { url: "wss://big.example", perConnection: 3 };
const SMALL = { url: "wss://small.example", perConnection: 2 };

const A = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const B = "Wa11etBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/** One request as a node received it. */
interface Sent {
  readonly id: number;
  readonly method: string;
  readonly params: readonly unknown[];
}

/**
 * Sockets the test drives: nothing opens by itself, nothing closes by itself,
 * and every request a connection sends is readable. A node answers a
 * subscribe with an id of its own so the test can push notifications back
 * through it the way a real node addresses them.
 */
const sockets = () => {
  const open: {
    readonly url: string;
    readonly events: SocketEvents;
    readonly sent: Sent[];
    closed: boolean;
  }[] = [];
  let nextServerId = 100;

  const opener: OpenSocket = (url, events) => {
    const entry = { url, events, sent: [] as Sent[], closed: false };
    open.push(entry);
    return {
      send: (payload: string) => void entry.sent.push(JSON.parse(payload) as Sent),
      close: () => {
        entry.closed = true;
      },
    };
  };

  const at = (i: number) => {
    const entry = open[i];
    if (entry === undefined) throw new Error(`no socket ${i} was opened`);
    return entry;
  };

  return {
    opener,
    count: () => open.length,
    urls: () => open.map((s) => s.url),
    at,
    sent: (i: number) => at(i).sent,
    closed: (i: number) => at(i).closed,
    /** The connection is up, which is when it sends what it has been asked for. */
    connect: (i: number) => at(i).events.opened(),
    drop: (i: number) => at(i).events.closed(),
    deliver: (i: number, payload: unknown) => at(i).events.received(JSON.stringify(payload)),
    /** Answer every subscribe this connection has sent, as a node does, newest last. */
    acknowledge: (i: number) => {
      const ids: number[] = [];
      for (const request of at(i).sent) {
        if (!/Subscribe$/.test(request.method)) continue;
        const serverId = nextServerId++;
        ids.push(serverId);
        at(i).events.received(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: serverId }));
      }
      return ids;
    },
  };
};

/**
 * A timer the test fires by hand, so no wait here is a real one.
 *
 * `quietMs` is the interval the quiet check re-arms itself at, and it shares
 * this queue with the reopen waits. `waits` leaves it out, so a test about
 * backoff reads only the backoff.
 */
const timers = (quietMs = 99_000) => {
  const pending: { readonly fn: () => void; readonly ms: number }[] = [];
  const asked: number[] = [];
  return {
    quietMs,
    schedule: (fn: () => void, ms: number) => {
      pending.push({ fn, ms });
      asked.push(ms);
    },
    /** Every wait asked for so far, the quiet check's own interval aside. */
    waits: () => asked.filter((ms) => ms !== quietMs),
    /** Fire everything scheduled so far, in order. */
    fire: () => {
      const due = pending.splice(0, pending.length);
      for (const p of due) p.fn();
    },
  };
};

const logsNotice = (subscription: number, signature: string, err: unknown = null) => ({
  jsonrpc: "2.0",
  method: "logsNotification",
  params: { result: { context: { slot: 7 }, value: { signature, err, logs: [] } }, subscription },
});

const accountNotice = (subscription: number, slot: number) => ({
  jsonrpc: "2.0",
  method: "accountNotification",
  params: { result: { context: { slot }, value: { lamports: 1 } }, subscription },
});

describe("solanaSubscriptions", () => {
  it("asks the node to watch an address and passes on what it hears", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const heard: string[] = [];

    subs.logsMentioning(A, (notice) => heard.push(notice.signature));
    net.connect(0);
    const [slot, logs] = net.acknowledge(0);

    // A slot subscription first: a socket that says nothing is how a dead one
    // looks, and slots are what tell the two apart.
    expect(net.sent(0).map((s) => s.method)).toEqual(["slotSubscribe", "logsSubscribe"]);
    expect(net.sent(0)[1]!.params[0]).toEqual({ mentions: [A] });
    expect(slot).toBeDefined();

    net.deliver(0, logsNotice(logs!, "sig-1"));
    expect(heard).toEqual(["sig-1"]);
  });

  it("says a transaction that failed moved nothing", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const heard: { signature: string; failed: boolean }[] = [];

    subs.logsMentioning(A, (notice) => heard.push({ ...notice }));
    net.connect(0);
    const [, logs] = net.acknowledge(0);

    net.deliver(0, logsNotice(logs!, "sig-ok"));
    net.deliver(0, logsNotice(logs!, "sig-bad", { InstructionError: [0, "Custom"] }));

    expect(heard).toEqual([
      { signature: "sig-ok", failed: false },
      { signature: "sig-bad", failed: true },
    ]);
  });

  it("watches an account and names it in what it hears", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const heard: { account: string; slot: number }[] = [];

    subs.accountChanges(A, (notice) => heard.push({ ...notice }));
    net.connect(0);
    const [, account] = net.acknowledge(0);

    net.deliver(0, accountNotice(account!, 42));

    expect(net.sent(0)[1]!.method).toBe("accountSubscribe");
    expect(net.sent(0)[1]!.params[0]).toBe(A);
    expect(heard).toEqual([{ account: A, slot: 42 }]);
  });

  it("tells each watcher only about its own subscription", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const forA: string[] = [];
    const forB: string[] = [];

    subs.logsMentioning(A, (n) => forA.push(n.signature));
    subs.logsMentioning(B, (n) => forB.push(n.signature));
    net.connect(0);
    const [, idA, idB] = net.acknowledge(0);

    net.deliver(0, logsNotice(idB!, "sig-for-b"));

    expect(forA).toEqual([]);
    expect(forB).toEqual(["sig-for-b"]);
    expect(idA).not.toBe(idB);
  });

  it("opens another connection rather than going past what one endpoint carries", () => {
    const net = sockets();
    // perConnection 3, one of which the slot heartbeat takes: two watchers fit.
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });

    subs.logsMentioning(A, () => undefined);
    subs.logsMentioning(B, () => undefined);
    expect(net.count()).toBe(1);

    subs.logsMentioning("Wa11etCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", () => undefined);

    expect(net.count()).toBe(2);
    expect(net.urls()).toEqual([BIG.url, BIG.url]);
  });

  it("spreads connections across endpoints, the one that carries most first", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [SMALL, BIG], open: net.opener });

    // SMALL is listed first and BIG carries more, so BIG is asked first.
    subs.logsMentioning(A, () => undefined);
    subs.logsMentioning(B, () => undefined);
    expect(net.urls()).toEqual([BIG.url]);

    // BIG's first connection is full; the next goes to the endpoint carrying
    // none, rather than piling a second onto BIG.
    subs.logsMentioning("Wa11etCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", () => undefined);
    expect(net.urls()).toEqual([BIG.url, SMALL.url]);
  });

  it("reopens a dropped socket and watches the same addresses on it", () => {
    const net = sockets();
    const clock = timers();
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      quietMs: clock.quietMs,
    });
    const heard: string[] = [];

    subs.logsMentioning(A, (n) => heard.push(n.signature));
    net.connect(0);
    net.acknowledge(0);
    net.drop(0);
    clock.fire();

    expect(net.count()).toBe(2);
    net.connect(1);
    const [, logs] = net.acknowledge(1);
    expect(net.sent(1).map((s) => s.method)).toEqual(["slotSubscribe", "logsSubscribe"]);

    // The id the node gave the first time is gone; the new one is what counts.
    net.deliver(1, logsNotice(logs!, "sig-after"));
    expect(heard).toEqual(["sig-after"]);
  });

  it("waits twice as long before each reopen, up to a cap", () => {
    const net = sockets();
    const clock = timers();
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      quietMs: clock.quietMs,
      retryMs: 1_000,
      maxRetryMs: 4_000,
    });

    subs.logsMentioning(A, () => undefined);
    for (let i = 0; i < 5; i++) {
      net.drop(i);
      clock.fire();
    }

    expect(clock.waits()).toEqual([1_000, 2_000, 4_000, 4_000, 4_000]);
  });

  it("goes back to the first wait once a socket has answered", () => {
    const net = sockets();
    const clock = timers();
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      quietMs: clock.quietMs,
      retryMs: 1_000,
    });

    subs.logsMentioning(A, () => undefined);
    net.drop(0);
    clock.fire();
    net.drop(1);
    clock.fire();
    net.connect(2);
    net.acknowledge(2);
    net.drop(2);
    clock.fire();

    expect(clock.waits()).toEqual([1_000, 2_000, 1_000]);
  });

  it("reopens a socket that has gone quiet without ever failing", () => {
    const net = sockets();
    const clock = timers();
    let now = 0;
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      now: () => now,
      quietMs: 30_000,
    });

    subs.logsMentioning(A, () => undefined);
    net.connect(0);
    net.acknowledge(0);

    // Nothing wrong has happened: the node simply stopped sending slots.
    now = 30_001;
    clock.fire();

    expect(net.closed(0)).toBe(true);
    clock.fire();
    expect(net.count()).toBe(2);
  });

  it("leaves a socket alone while the node is still sending slots", () => {
    const net = sockets();
    const clock = timers();
    let now = 0;
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      now: () => now,
      quietMs: 30_000,
    });

    subs.logsMentioning(A, () => undefined);
    net.connect(0);
    const [slot] = net.acknowledge(0);

    now = 25_000;
    net.deliver(0, {
      jsonrpc: "2.0",
      method: "slotNotification",
      params: { result: { slot: 9, parent: 8, root: 8 }, subscription: slot },
    });
    now = 50_000;
    clock.fire();

    expect(net.closed(0)).toBe(false);
    expect(net.count()).toBe(1);
  });

  it("tells the node to stop when a watcher closes, and frees the room", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });

    const one = subs.logsMentioning(A, () => undefined);
    subs.logsMentioning(B, () => undefined);
    net.connect(0);
    const [, idA] = net.acknowledge(0);

    one.close();

    expect(net.sent(0).at(-1)).toMatchObject({ method: "logsUnsubscribe", params: [idA] });
    // Its place is free, so a third watcher fits without a second connection.
    subs.logsMentioning("Wa11etCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", () => undefined);
    expect(net.count()).toBe(1);
  });

  it("says nothing more to a watcher that has closed", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const heard: string[] = [];

    const one = subs.logsMentioning(A, (n) => heard.push(n.signature));
    net.connect(0);
    const [, idA] = net.acknowledge(0);
    one.close();

    net.deliver(0, logsNotice(idA!, "too-late"));

    expect(heard).toEqual([]);
  });

  it("is not live until every address it was asked for is being watched", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });

    expect(subs.live).toBe(false);

    subs.logsMentioning(A, () => undefined);
    expect(subs.live).toBe(false);

    net.connect(0);
    expect(subs.live).toBe(false);

    net.acknowledge(0);
    expect(subs.live).toBe(true);
  });

  it("is not live while a socket it needs is down", () => {
    const net = sockets();
    const clock = timers();
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      quietMs: clock.quietMs,
    });

    subs.logsMentioning(A, () => undefined);
    net.connect(0);
    net.acknowledge(0);
    expect(subs.live).toBe(true);

    net.drop(0);
    expect(subs.live).toBe(false);
  });

  it("is not live with nowhere to subscribe at all", () => {
    const subs = solanaSubscriptions({ endpoints: [], open: sockets().opener });
    expect(subs.live).toBe(false);
    // And asking for a watch is still safe: nothing is pushed, nothing throws.
    expect(() => subs.logsMentioning(A, () => undefined).close()).not.toThrow();
  });

  it("closes every socket and stops reopening them", () => {
    const net = sockets();
    const clock = timers();
    const subs = solanaSubscriptions({
      endpoints: [BIG],
      open: net.opener,
      schedule: clock.schedule,
      quietMs: clock.quietMs,
    });

    subs.logsMentioning(A, () => undefined);
    net.connect(0);
    net.acknowledge(0);
    subs.close();

    expect(net.closed(0)).toBe(true);
    expect(subs.live).toBe(false);
    net.drop(0);
    clock.fire();
    expect(net.count()).toBe(1);
  });

  it("keeps going when a node sends something it cannot read", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });
    const heard: string[] = [];

    subs.logsMentioning(A, (n) => heard.push(n.signature));
    net.connect(0);
    const [, logs] = net.acknowledge(0);

    net.at(0).events.received("not json at all");
    net.deliver(0, { jsonrpc: "2.0", method: "logsNotification", params: {} });
    net.deliver(0, logsNotice(logs!, "still-here"));

    expect(heard).toEqual(["still-here"]);
  });

  it("does not count a subscription the node refused", () => {
    const net = sockets();
    const subs = solanaSubscriptions({ endpoints: [BIG], open: net.opener });

    subs.logsMentioning(A, () => undefined);
    net.connect(0);
    const slotRequest = net.sent(0)[0]!;
    const logsRequest = net.sent(0)[1]!;
    net.deliver(0, { jsonrpc: "2.0", id: slotRequest.id, result: 1 });
    net.deliver(0, {
      jsonrpc: "2.0",
      id: logsRequest.id,
      error: { code: -32601, message: "Method 'logsSubscribe' not found" },
    });

    expect(subs.live).toBe(false);
  });
});

describe("subscriptionEndpoints", () => {
  it("turns the lane's HTTP URLs into socket URLs", () => {
    expect(subscriptionEndpoints(["https://api.mainnet-beta.solana.com"])).toEqual([
      { url: "wss://api.mainnet-beta.solana.com", perConnection: 50 },
    ]);
    expect(subscriptionEndpoints(["http://localhost:8899"])[0]!.url).toBe("ws://localhost:8899");
  });

  it("gives each endpoint the number of subscriptions it was measured to carry", () => {
    const [vibe] = subscriptionEndpoints(["https://public.rpc.solanavibestation.com"]);
    expect(vibe!.perConnection).toBe(390);
  });

  it("is cautious about an endpoint nobody has measured", () => {
    const [unknown] = subscriptionEndpoints(["https://rpc.unmeasured.example"]);
    expect(unknown!.perConnection).toBe(50);
  });

  it("keeps the order it was given, so a caller's preference survives", () => {
    const urls = ["https://api.mainnet-beta.solana.com", "https://public.rpc.solanavibestation.com"];
    expect(subscriptionEndpoints(urls).map((e) => e.url)).toEqual([
      "wss://api.mainnet-beta.solana.com",
      "wss://public.rpc.solanavibestation.com",
    ]);
  });

  it("passes over a URL that is not one", () => {
    expect(subscriptionEndpoints(["", "not a url", "https://ok.example"])).toEqual([
      { url: "wss://ok.example", perConnection: 50 },
    ]);
  });
});
