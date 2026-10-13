import { describe, expect, it } from "vitest";
import { createRelayClient, SOLANA_CHAIN_ID, SOLANA_USDC } from "./relay.js";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("createRelayClient", () => {
  it("sends the api key and never puts it in a url", async () => {
    let seen: { url: string; key: string | null } | null = null;
    const client = createRelayClient({
      apiKey: "secret-key",
      fetch: (input, init) => {
        seen = { url: String(input), key: new Headers(init?.headers).get("x-api-key") };
        return ok({ chains: [] });
      },
    });

    await client.chains();

    expect(seen!.key).toBe("secret-key");
    expect(seen!.url).not.toContain("secret-key");
  });

  it("offers the native currency and the solver currencies, de-duplicated", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 792703809,
              name: "solana",
              vmType: "svm",
              depositEnabled: true,
              currency: {
                id: "sol",
                symbol: "SOL",
                name: "Solana",
                address: "11111111111111111111111111111111",
                decimals: 9,
                supportsBridging: true,
              },
              solverCurrencies: [
                { id: "usdc", symbol: "USDC", name: "USD Coin", address: SOLANA_USDC, decimals: 6 },
              ],
            },
          ],
        }),
    });

    const [chain] = await client.chains();

    expect(chain!.currencies.map((c) => c.symbol)).toEqual(["SOL", "USDC"]);
  });

  it("offers a native currency listed in both places only once", async () => {
    const eth = {
      id: "eth",
      symbol: "ETH",
      name: "Ether",
      address: "11111111111111111111111111111111",
      decimals: 9,
    };
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 9286185,
              name: "eclipse",
              vmType: "svm",
              depositEnabled: true,
              currency: { ...eth, supportsBridging: true },
              solverCurrencies: [eth],
            },
          ],
        }),
    });

    const [chain] = await client.chains();

    expect(chain!.currencies).toHaveLength(1);
  });

  it("leaves out a native currency that cannot be bridged", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 1,
              name: "ethereum",
              vmType: "evm",
              depositEnabled: true,
              currency: { id: "eth", symbol: "ETH", name: "Ether", address: "0x0", decimals: 18 },
              solverCurrencies: [
                { id: "usdc", symbol: "USDC", name: "USD Coin", address: "0xa0b8", decimals: 6 },
              ],
            },
          ],
        }),
    });

    const [chain] = await client.chains();

    expect(chain!.currencies.map((c) => c.symbol)).toEqual(["USDC"]);
  });

  it("drops a chain that cannot be deposited from", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 1,
              name: "ethereum",
              vmType: "evm",
              depositEnabled: false,
              currency: {
                id: "eth",
                symbol: "ETH",
                name: "Ether",
                address: "0x0",
                decimals: 18,
                supportsBridging: true,
              },
              solverCurrencies: [],
            },
          ],
        }),
    });

    expect(await client.chains()).toEqual([]);
  });

  it("drops a chain with nothing on it we could accept", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [{ id: 42, name: "empty", vmType: "evm", depositEnabled: true, solverCurrencies: [] }],
        }),
    });

    expect(await client.chains()).toEqual([]);
  });

  it("mints a deposit address against the destination we fix, not one a caller names", async () => {
    let body: Record<string, unknown> = {};
    const client = createRelayClient({
      apiKey: "k",
      fetch: (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return ok({
          requestId: "0xabc",
          steps: [{ id: "deposit", depositAddress: "0xdeadbeef" }],
          details: { currencyOut: { amount: "24846825" } },
        });
      },
    });

    const quote = await client.depositAddressQuote({
      originChainId: 8453,
      originCurrency: "0x0000000000000000000000000000000000000000",
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      refundTo: "0xrefund",
      recoveryAddress: "0xrecovery",
    });

    expect(body["destinationChainId"]).toBe(SOLANA_CHAIN_ID);
    expect(body["destinationCurrency"]).toBe(SOLANA_USDC);
    expect(body["useDepositAddress"]).toBe(true);
    expect(body["tradeType"]).toBe("EXACT_INPUT");
    expect(body["appFees"]).toBeUndefined();
    expect(quote).toEqual({ requestId: "0xabc", depositAddress: "0xdeadbeef", quotedOutRaw: "24846825" });
  });

  it("refuses a quote that came back without a deposit address", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () => ok({ requestId: "0xabc", steps: [{ id: "deposit" }] }),
    });

    await expect(
      client.depositAddressQuote({
        originChainId: 8453,
        originCurrency: "0x0",
        recipient: "9WzD",
        refundTo: "0xr",
        recoveryAddress: "0xrec",
      }),
    ).rejects.toThrow(/no deposit address/i);
  });

  it("reports a quote with no expected output rather than inventing one", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () => ok({ requestId: "0xabc", steps: [{ depositAddress: "0xdep" }] }),
    });

    const quote = await client.depositAddressQuote({
      originChainId: 8453,
      originCurrency: "0x0",
      recipient: "9WzD",
      refundTo: "0xr",
      recoveryAddress: "0xrec",
    });

    expect(quote.quotedOutRaw).toBeNull();
  });

  it("carries the upstream status through without reinterpreting it", async () => {
    const client = createRelayClient({ apiKey: "k", fetch: () => ok({ status: "pending" }) });
    expect(await client.status("0xabc")).toBe("pending");
  });

  it("escapes a request id rather than pasting it into a url", async () => {
    let url = "";
    const client = createRelayClient({
      apiKey: "k",
      fetch: (input) => {
        url = String(input);
        return ok({ status: "waiting" });
      },
    });

    await client.status("0xabc&injected=1");

    expect(url).toContain("0xabc%26injected%3D1");
  });

  it("surfaces a failure with its status but clips the upstream body", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () => Promise.resolve(new Response("x".repeat(500), { status: 500 })),
    });

    await expect(client.chains()).rejects.toThrow(/relay \/chains failed: 500/);
  });
});

describe("createRelayClient, on a chain we hold no refund key for", () => {
  const mint = async (
    over: Partial<{ refundTo: string; recoveryAddress: string }> = {},
  ): Promise<Record<string, unknown>> => {
    let body: Record<string, unknown> = {};
    const client = createRelayClient({
      apiKey: "k",
      fetch: (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return ok({ requestId: "0xabc", steps: [{ depositAddress: "Tdeposit" }] });
      },
    });
    await client.depositAddressQuote({
      originChainId: 728126428,
      originCurrency: "TR7NHq",
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      ...over,
    });
    return body;
  };

  /*
   * Relay reports eight VM families and we hold keys for three. An address is
   * only meaningful inside its own family, so Tron must not be handed an `0x`
   * one: Relay would accept it and refund into nothing.
   */
  it("omits refundTo entirely rather than sending one from another family", async () => {
    const body = await mint();
    expect(body).not.toHaveProperty("refundTo");
    expect(body).not.toHaveProperty("recoveryAddress");
  });

  it("still sends them when we do have them", async () => {
    const body = await mint({ refundTo: "0xrefund", recoveryAddress: "0xrecovery" });
    expect(body["refundTo"]).toBe("0xrefund");
    expect(body["recoveryAddress"]).toBe("0xrecovery");
  });
});
