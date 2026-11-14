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
