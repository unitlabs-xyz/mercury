import { describe, expect, it } from "vitest";
import { createRelayClient, SOLANA_USDC } from "./relay.js";

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

describe("createRelayClient · currencies", () => {
  const token = (over: Record<string, unknown> = {}) => ({
    chainId: 8453,
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    vmType: "evm",
    metadata: { logoURI: "https://coin-images.coingecko.com/usdc.png", verified: true },
    ...over,
  });

  it("carries the logo through, which is the only place one exists", async () => {
    const client = createRelayClient({ apiKey: "k", fetch: () => ok([token()]) });

    const [first] = await client.currencies({ chainIds: [8453], term: "usdc" });

    expect(first).toMatchObject({
      chainId: 8453,
      symbol: "USDC",
      decimals: 6,
      logoUrl: "https://coin-images.coingecko.com/usdc.png",
    });
  });

  it("drops anything Relay has not verified", async () => {
    /*
     * The impostor case, and the reason this filter is not decorative:
     * `verifiedOnly` is honoured on a term search and ignored on an address
     * lookup, so the only thing standing between a token named USDC at
     * somebody else's address and a quote is this line.
     */
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok([
          token(),
          token({ address: "0x584fbca587e2bbea9bec6cac60370f6ed20a49c4", metadata: { verified: false } }),
        ]),
    });

    const found = await client.currencies({
      chainIds: [8453],
      address: "0x584fbca587e2bbea9bec6cac60370f6ed20a49c4",
    });

    expect(found.map((t) => t.address)).toEqual(["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"]);
  });

  it("asks for verified tokens and omits what it was not given", async () => {
    let body: Record<string, unknown> | null = null;
    const client = createRelayClient({
      apiKey: "k",
      fetch: (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return ok([]);
      },
    });

    await client.currencies({ chainIds: [8453, 1] });

    expect(body!["verifiedOnly"]).toBe(true);
    expect(body!["chainIds"]).toEqual([8453, 1]);
    /* Absent rather than undefined: Relay reads a present `term` as a search. */
    expect(body).not.toHaveProperty("term");
    expect(body).not.toHaveProperty("address");
  });

  it("survives a null body rather than throwing on no matches", async () => {
    const client = createRelayClient({ apiKey: "k", fetch: () => ok(null) });

    expect(await client.currencies({ chainIds: [8453], term: "zzzz" })).toEqual([]);
  });

  it("drops a row missing the fields a deposit needs", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () => ok([token({ decimals: undefined }), token({ address: undefined }), token()]),
    });

    expect(await client.currencies({ chainIds: [8453] })).toHaveLength(1);
  });
});
