import { describe, expect, it } from "vitest";
import type { Subscription } from "@mercury/chain";
import { watchAddresses, type WatchedAddress } from "./watch.js";

const WALLET_A = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const WALLET_B = "Wa11etBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const USDC_A = "Usdc0fAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** A node that records what it was asked to watch, and can be made to speak. */
const node = () => {
  const watching = new Map<string, { readonly tell: () => void; closed: boolean }>();
  const subscribe = (address: string, told: () => void): Subscription => {
    watching.set(address, { tell: told, closed: false });
    return {
      close: () => {
        const entry = watching.get(address);
        if (entry !== undefined) entry.closed = true;
      },
    };
  };
  return {
    subscribe,
    /** Addresses still being watched, in order. */
    live: () => [...watching.entries()].filter(([, v]) => !v.closed).map(([k]) => k),
    closed: () => [...watching.entries()].filter(([, v]) => v.closed).map(([k]) => k),
    speak: (address: string) => {
      const entry = watching.get(address);
      if (entry === undefined || entry.closed) {
        throw new Error(`${address} is not being watched`);
      }
      entry.tell();
    },
  };
};

const harness = (lists: readonly (readonly WatchedAddress[])[]) => {
  const net = node();
  const told: string[] = [];
  let pass = 0;
  const watch = watchAddresses({
    addresses: async () => lists[Math.min(pass++, lists.length - 1)] ?? [],
    subscribe: net.subscribe,
    told: (wallet) => void told.push(wallet),
  });
  return { net, told, watch };
};

describe("watchAddresses", () => {
  it("asks the node to watch every address it is given", async () => {
    const h = harness([
      [
        { wallet: WALLET_A, address: WALLET_A },
        { wallet: WALLET_A, address: USDC_A },
        { wallet: WALLET_B, address: WALLET_B },
      ],
    ]);

    const summary = await h.watch.refresh();

    expect(h.net.live()).toEqual([WALLET_A, USDC_A, WALLET_B]);
    expect(summary).toEqual({ added: 3, dropped: 0, watching: 3 });
  });

  it("names the wallet an address belongs to, not the address", async () => {
    const h = harness([
      [
        { wallet: WALLET_A, address: USDC_A },
        { wallet: WALLET_B, address: WALLET_B },
      ],
    ]);
    await h.watch.refresh();

    h.net.speak(USDC_A);
    h.net.speak(WALLET_B);

    expect(h.told).toEqual([WALLET_A, WALLET_B]);
  });

  it("asks for nothing twice", async () => {
    const h = harness([[{ wallet: WALLET_A, address: WALLET_A }]]);

    await h.watch.refresh();
    const second = await h.watch.refresh();

    expect(second).toEqual({ added: 0, dropped: 0, watching: 1 });
    expect(h.net.live()).toEqual([WALLET_A]);
  });

  it("lets go of an address that is no longer worth watching", async () => {
    const h = harness([
      [
        { wallet: WALLET_A, address: WALLET_A },
        { wallet: WALLET_B, address: WALLET_B },
      ],
      [{ wallet: WALLET_A, address: WALLET_A }],
    ]);
    await h.watch.refresh();

    const second = await h.watch.refresh();

    expect(second).toEqual({ added: 0, dropped: 1, watching: 1 });
    expect(h.net.live()).toEqual([WALLET_A]);
    expect(h.net.closed()).toEqual([WALLET_B]);
  });

  it("picks up an address that appeared since the last pass", async () => {
    const h = harness([
      [{ wallet: WALLET_A, address: WALLET_A }],
      [
        { wallet: WALLET_A, address: WALLET_A },
        { wallet: WALLET_A, address: USDC_A },
      ],
    ]);
    await h.watch.refresh();

    const second = await h.watch.refresh();

    expect(second).toEqual({ added: 1, dropped: 0, watching: 2 });
    expect(h.net.live()).toEqual([WALLET_A, USDC_A]);
  });

  it("closes everything and keeps nothing", async () => {
    const h = harness([
      [
        { wallet: WALLET_A, address: WALLET_A },
        { wallet: WALLET_B, address: WALLET_B },
      ],
    ]);
    await h.watch.refresh();

    h.watch.close();

    expect(h.net.live()).toEqual([]);
    await expect(h.watch.refresh()).resolves.toEqual({ added: 2, dropped: 0, watching: 2 });
  });

  it("lets a failure to read the addresses reach the job, keeping what it has", async () => {
    const net = node();
    let fail = false;
    const watch = watchAddresses({
      addresses: async () => {
        if (fail) throw new Error("the database said no");
        return [{ wallet: WALLET_A, address: WALLET_A }];
      },
      subscribe: net.subscribe,
      told: () => undefined,
    });
    await watch.refresh();

    fail = true;
    await expect(watch.refresh()).rejects.toThrow("the database said no");
    expect(net.live()).toEqual([WALLET_A]);
  });
});

describe("watchAddresses on a clock of its own", () => {
  /**
   * Finding a wallet's token accounts costs an RPC call per wallet, so it
   * cannot happen on every pass of a job that runs every ten seconds — that
   * would be the poll this replaces, under another name.
   */
  it("reads the addresses again only once the interval has passed", async () => {
    const net = node();
    let now = 0;
    let reads = 0;
    const watch = watchAddresses({
      addresses: async () => {
        reads += 1;
        return [{ wallet: WALLET_A, address: WALLET_A }];
      },
      subscribe: net.subscribe,
      told: () => undefined,
      everyMs: 10_000,
      now: () => now,
    });

    await watch.refresh();
    expect(reads).toBe(1);

    now = 9_999;
    await watch.refresh();
    expect(reads).toBe(1);

    now = 10_000;
    await watch.refresh();
    expect(reads).toBe(2);
  });

  it("reports what it is watching even on a pass it did not look", async () => {
    const net = node();
    const watch = watchAddresses({
      addresses: async () => [
        { wallet: WALLET_A, address: WALLET_A },
        { wallet: WALLET_A, address: USDC_A },
      ],
      subscribe: net.subscribe,
      told: () => undefined,
      everyMs: 10_000,
      now: () => 0,
    });
    await watch.refresh();

    await expect(watch.refresh()).resolves.toEqual({ added: 0, dropped: 0, watching: 2 });
  });

  it("looks again straight away after a read that failed", async () => {
    const net = node();
    let fail = true;
    let reads = 0;
    const watch = watchAddresses({
      addresses: async () => {
        reads += 1;
        if (fail) throw new Error("the database said no");
        return [{ wallet: WALLET_A, address: WALLET_A }];
      },
      subscribe: net.subscribe,
      told: () => undefined,
      everyMs: 10_000,
      now: () => 0,
    });

    await expect(watch.refresh()).rejects.toThrow("the database said no");
    fail = false;

    // Not held off for ten seconds by a pass that watched nothing.
    await watch.refresh();
    expect(reads).toBe(2);
    expect(net.live()).toEqual([WALLET_A]);
  });

  it("looks every pass when no interval is given", async () => {
    const net = node();
    let reads = 0;
    const watch = watchAddresses({
      addresses: async () => {
        reads += 1;
        return [];
      },
      subscribe: net.subscribe,
      told: () => undefined,
      now: () => 0,
    });

    await watch.refresh();
    await watch.refresh();

    expect(reads).toBe(2);
  });
});

describe("watchAddresses knowing whether to be believed", () => {
  const watchOver = (opts: {
    readonly addresses: () => Promise<readonly WatchedAddress[]>;
    readonly now: () => number;
    readonly everyMs?: number;
  }) =>
    watchAddresses({
      addresses: opts.addresses,
      subscribe: node().subscribe,
      told: () => undefined,
      now: opts.now,
      ...(opts.everyMs === undefined ? {} : { everyMs: opts.everyMs }),
    });

  it("is not to be believed before it has ever looked", () => {
    const watch = watchOver({ addresses: async () => [], now: () => 0 });

    expect(watch.current()).toBe(false);
  });

  it("is to be believed once it has looked", async () => {
    const watch = watchOver({ addresses: async () => [], now: () => 0 });
    await watch.refresh();

    expect(watch.current()).toBe(true);
  });

  it("is not to be believed after two intervals with no successful look", async () => {
    let now = 0;
    let fail = false;
    const watch = watchOver({
      addresses: async () => {
        if (fail) throw new Error("the node said no");
        return [];
      },
      now: () => now,
      everyMs: 10_000,
    });
    await watch.refresh();
    fail = true;

    now = 19_999;
    await expect(watch.refresh()).rejects.toThrow();
    expect(watch.current()).toBe(true);

    now = 20_000;
    expect(watch.current()).toBe(false);
  });

  it("is to be believed again after a look that worked", async () => {
    let now = 0;
    const watch = watchOver({ addresses: async () => [], now: () => now, everyMs: 10_000 });
    await watch.refresh();

    now = 30_000;
    expect(watch.current()).toBe(false);
    await watch.refresh();
    expect(watch.current()).toBe(true);
  });

  it("is not to be believed after being closed", async () => {
    const watch = watchOver({ addresses: async () => [], now: () => 0 });
    await watch.refresh();

    watch.close();

    expect(watch.current()).toBe(false);
  });
});
