import { afterEach, describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { JupiterLite } from "./jupiter/lite.js";
import { JupiterRegistry } from "./jupiter/registry.js";
import { SolanaRpc } from "./solana/rpc.js";

/**
 * Reproduces a browser's receiver check in Node.
 *
 * `window.fetch` throws "Illegal invocation" when called with a receiver that
 * is not the window. An adapter that stores the global on an instance field and
 * calls `this.doFetch(...)` does exactly that. Node's fetch does not care, so
 * the bug passes every other test here and every server boot, and only shows up
 * in the browser — where half of these adapters run.
 */
const original = globalThis.fetch;

const withBrowserReceiverCheck = () => {
  const real = original;
  const guarded = function (this: unknown, ...args: Parameters<typeof fetch>) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return real(...args);
  };
  globalThis.fetch = guarded as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = original;
});

describe("the default fetch is bound", () => {
  it("survives being called as a method on the adapter", async () => {
    withBrowserReceiverCheck();
    // No injected fetch: this is the path a browser takes.
    const registry = new JupiterRegistry({ baseUrl: "https://127.0.0.1:1" });
    // It must fail on the network, not on the receiver.
    await expect(registry.instruments()).rejects.not.toThrow(/Illegal invocation/);
  });

  it("is bound in every adapter that takes one", async () => {
    withBrowserReceiverCheck();
    const adapters = [
      () =>
        new JupiterLite({ baseUrl: "https://127.0.0.1:1" }).quote({
          side: "buy",
          mint: "m",
          decimals: 8,
          amount: D(100),
        }),
      () => new SolanaRpc({ rpcUrl: "https://127.0.0.1:1" }).tokenBalances("owner"),
    ];
    for (const run of adapters) {
      await expect(run()).rejects.not.toThrow(/Illegal invocation/);
    }
  });
});
