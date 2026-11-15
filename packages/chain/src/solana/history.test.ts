import { describe, expect, it } from "vitest";
import { FIXTURE_OWNER, NVDAX_MINT, USDC_MINT } from "../testing/index.js";
import { SolanaRpc, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./rpc.js";

const RPC = "https://rpc.example/v1";

/** Captures every request body, and answers each method from a map. */
const node = (answers: Record<string, unknown>) => {
  const calls: string[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = String(init?.body);
    calls.push(body);
    const method = (JSON.parse(body) as { method: string }).method;
    const result = answers[method];
    if (result === undefined) throw new Error(`no answer registered for ${method}`);
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { doFetch, calls };
};

const SIG_A = "4FciXUT4ubwv8vt1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SIG_B = "51WvrJYbqCD29ZVzbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("SolanaRpc.tokenAccountsFor", () => {
  it("asks for the owner's accounts filtered to one mint, and returns their addresses", async () => {
    const n = node({
      getTokenAccountsByOwner: {
        context: { slot: 1 },
        value: [{ pubkey: "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C" }],
      },
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    const accounts = await rpc.tokenAccountsFor(FIXTURE_OWNER, USDC_MINT);
    expect(accounts).toEqual(["EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C"]);
    expect(n.calls[0]).toContain(`"mint":"${USDC_MINT}"`);
    expect(n.calls[0]).toContain(FIXTURE_OWNER);
  });

  it("returns nothing when the owner has no account for that mint", async () => {
    const n = node({ getTokenAccountsByOwner: { context: { slot: 1 }, value: [] } });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    expect(await rpc.tokenAccountsFor(FIXTURE_OWNER, NVDAX_MINT)).toEqual([]);
  });
});

describe("SolanaRpc.signatures", () => {
  it("passes limit, until and before through, and reads err as failure", async () => {
    const n = node({
      getSignaturesForAddress: [
        { signature: SIG_A, slot: 451224633, blockTime: 1790573221, err: null },
        { signature: SIG_B, slot: 451224600, blockTime: null, err: { InstructionError: [0, "Custom"] } },
      ],
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    const page = await rpc.signatures(FIXTURE_OWNER, { limit: 100, until: SIG_B, before: SIG_A });

    expect(n.calls[0]).toContain('"limit":100');
    expect(n.calls[0]).toContain(`"until":"${SIG_B}"`);
    expect(n.calls[0]).toContain(`"before":"${SIG_A}"`);
    expect(page).toEqual([
      { signature: SIG_A, slot: 451224633, blockTime: 1790573221, failed: false },
      { signature: SIG_B, slot: 451224600, blockTime: null, failed: true },
    ]);
  });

  it("omits until and before when they are not given, rather than sending null", async () => {
    const n = node({ getSignaturesForAddress: [] });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    await rpc.signatures(FIXTURE_OWNER, { limit: 1 });
    expect(n.calls[0]).not.toContain("until");
    expect(n.calls[0]).not.toContain("before");
  });
});

describe("SolanaRpc.transaction", () => {
  const detail = {
    blockTime: 1790573221,
    slot: 451224633,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: FIXTURE_OWNER, source: "transaction" },
          { pubkey: "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C", source: "lookupTable" },
        ],
      },
    },
    meta: {
      fee: 5001,
      preBalances: [2_000_000_000, 2_039_280],
      postBalances: [1_999_994_999, 2_039_280],
      preTokenBalances: [],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: USDC_MINT,
          owner: FIXTURE_OWNER,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          uiTokenAmount: { amount: "500000000", decimals: 6, uiAmount: 500, uiAmountString: "500" },
        },
      ],
    },
  };

  it("asks with a version ceiling of 255, because 0 errors on a version 1 transaction", async () => {
    const n = node({ getTransaction: detail });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    await rpc.transaction(SIG_A);
    expect(n.calls[0]).toContain('"maxSupportedTransactionVersion":255');
    expect(n.calls[0]).toContain('"encoding":"jsonParsed"');
  });

  it("decodes lamports and token amounts as bigint, keys in index order", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node({ getTransaction: detail }).doFetch });
    const tx = await rpc.transaction(SIG_A);
    expect(tx).not.toBeNull();
    expect(tx!.signature).toBe(SIG_A);
    expect(tx!.blockTime).toBe(1790573221);
    expect(tx!.feeLamports).toBe(5001n);
    expect(tx!.accountKeys).toEqual([FIXTURE_OWNER, "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C"]);
    expect(tx!.preLamports).toEqual([2_000_000_000n, 2_039_280n]);
    expect(tx!.postLamports).toEqual([1_999_994_999n, 2_039_280n]);
    expect(tx!.preTokens).toEqual([]);
    expect(tx!.postTokens).toEqual([
      { mint: USDC_MINT, owner: FIXTURE_OWNER, rawAmount: 500_000_000n, decimals: 6 },
    ]);
  });

  it("preserves parsed outer and inner SPL transfers with token-account owners", async () => {
    const sourceOwner = "7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
    const source = "8H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
    const destination = "9H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
    const transfer = (programId: string, amount: string) => ({
      programId,
      parsed: {
        type: "transferChecked",
        info: {
          source,
          destination,
          authority: sourceOwner,
          mint: USDC_MINT,
          tokenAmount: { amount, decimals: 6 },
        },
      },
    });
    const withTransfers = {
      ...detail,
      transaction: {
        message: {
          accountKeys: [{ pubkey: source }, { pubkey: destination }],
          instructions: [transfer(TOKEN_PROGRAM, "1000000")],
        },
      },
      meta: {
        ...detail.meta,
        preBalances: [0, 0],
        postBalances: [0, 0],
        preTokenBalances: [
          {
            accountIndex: 0,
            mint: USDC_MINT,
            owner: sourceOwner,
            uiTokenAmount: { amount: "3000000", decimals: 6 },
          },
          {
            accountIndex: 1,
            mint: USDC_MINT,
            owner: FIXTURE_OWNER,
            uiTokenAmount: { amount: "0", decimals: 6 },
          },
        ],
        postTokenBalances: [],
        innerInstructions: [{ index: 0, instructions: [transfer(TOKEN_2022_PROGRAM, "2000000")] }],
      },
    };
    const tx = await new SolanaRpc({
      rpcUrl: RPC,
      fetch: node({ getTransaction: withTransfers }).doFetch,
    }).transaction(SIG_A);
    expect(tx?.tokenTransfersIn).toEqual([
      expect.objectContaining({
        programId: TOKEN_PROGRAM,
        sourceOwner,
        destinationOwner: FIXTURE_OWNER,
        rawAmount: 1_000_000n,
      }),
      expect.objectContaining({
        programId: TOKEN_2022_PROGRAM,
        sourceOwner,
        destinationOwner: FIXTURE_OWNER,
        rawAmount: 2_000_000n,
      }),
    ]);
  });

  it("returns null when the node has no such transaction", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node({ getTransaction: null }).doFetch });
    expect(await rpc.transaction(SIG_A)).toBeNull();
  });
});

describe("SolanaRpc.tokenAccounts", () => {
  /**
   * Both token programs, because a wallet holds USDC under the original and
   * xStocks under Token-2022, and the point of this is to watch all of them.
   */
  it("asks both token programs and returns every account's address", async () => {
    let page = 0;
    const pages = [
      { context: { slot: 1 }, value: [{ pubkey: "AccountOne1111111111111111111111111111111" }] },
      { context: { slot: 1 }, value: [{ pubkey: "AccountTwo2222222222222222222222222222222" }] },
    ];
    const n = node({ getTokenAccountsByOwner: {} });
    const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void n.calls.push(String(init?.body));
      const result = pages[page++];
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof fetch;
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: doFetch });

    const accounts = await rpc.tokenAccounts(FIXTURE_OWNER);

    expect([...accounts].sort()).toEqual([
      "AccountOne1111111111111111111111111111111",
      "AccountTwo2222222222222222222222222222222",
    ]);
    expect(n.calls.join(" ")).toContain(TOKEN_PROGRAM);
    expect(n.calls.join(" ")).toContain(TOKEN_2022_PROGRAM);
  });

  /* An account holding nothing is exactly where the next transfer in lands. */
  it("keeps an account that is empty, which a balance read drops", async () => {
    const n = node({
      getTokenAccountsByOwner: {
        context: { slot: 1 },
        value: [
          {
            pubkey: "EmptyAccount111111111111111111111111111111",
            account: {
              data: {
                parsed: {
                  info: { mint: USDC_MINT, tokenAmount: { amount: "0", decimals: 6 } },
                },
              },
            },
          },
        ],
      },
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });

    expect(await rpc.tokenBalances(FIXTURE_OWNER)).toEqual([]);
    expect(await rpc.tokenAccounts(FIXTURE_OWNER)).toContain("EmptyAccount111111111111111111111111111111");
  });

  it("names an account once, however many programs answer with it", async () => {
    const n = node({
      getTokenAccountsByOwner: {
        context: { slot: 1 },
        value: [{ pubkey: "AccountOne1111111111111111111111111111111" }],
      },
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });

    expect(await rpc.tokenAccounts(FIXTURE_OWNER)).toEqual(["AccountOne1111111111111111111111111111111"]);
  });

  it("returns nothing for a wallet that holds nothing yet", async () => {
    const n = node({ getTokenAccountsByOwner: { context: { slot: 1 }, value: [] } });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });

    expect(await rpc.tokenAccounts(FIXTURE_OWNER)).toEqual([]);
  });
});
