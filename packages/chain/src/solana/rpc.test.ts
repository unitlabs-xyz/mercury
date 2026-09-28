import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import {
  fails,
  fakeFetch,
  FIXTURE_OWNER,
  NVDAX_MINT,
  rpcMintNvda,
  rpcTokenAccounts,
  SPYX_MINT,
  USDC_MINT,
} from "../testing/index.js";
import { SolanaRpc } from "./rpc.js";

const RPC = "https://rpc.example/v1";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** The parsed mint account, rebuilt with whichever extension state a test needs. */
const mintWith = (scaled: Record<string, unknown>, paused: boolean) => ({
  jsonrpc: "2.0",
  id: 1,
  result: {
    value: {
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      data: {
        program: "spl-token-2022",
        parsed: {
          type: "mint",
          info: {
            decimals: 8,
            extensions: [
              { extension: "scaledUiAmountConfig", state: scaled },
              { extension: "pausableConfig", state: { authority: "JDq1", paused } },
            ],
          },
        },
      },
    },
  },
});

/**
 * A node answers each program separately, and a mint belongs to exactly one of
 * them. The fixture holds all three accounts, so the fake splits it the way a
 * real node would rather than serving the whole list to both calls.
 */
const byProgram = (accounts = rpcTokenAccounts.result.value) => {
  const of = (program: string) => ({
    jsonrpc: "2.0",
    id: 1,
    result: { context: { slot: 1 }, value: accounts.filter((a) => a.account.owner === program) },
  });
  return (body: string) =>
    body.includes(TOKEN_2022) ? of(TOKEN_2022) : of("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
};

const nodeServing = (accounts?: typeof rpcTokenAccounts.result.value) => {
  const pick = byProgram(accounts);
  const calls: string[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = String(init?.body);
    calls.push(body);
    return Promise.resolve(
      new Response(JSON.stringify(pick(body)), { headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return { doFetch, calls };
};

describe("SolanaRpc.tokenBalances", () => {
  it("asks both token programs, because xStocks are Token-2022 and USDC is not", async () => {
    const node = nodeServing();
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node.doFetch });
    await rpc.tokenBalances(FIXTURE_OWNER);
    expect(node.calls.length).toBe(2);
    expect(node.calls.join()).toContain("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(node.calls.join()).toContain(TOKEN_2022);
    expect(node.calls.join()).toContain(FIXTURE_OWNER);
  });

  it("returns raw amounts as bigint, and never touches uiAmount", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.find((b) => b.mint === NVDAX_MINT)).toEqual({
      mint: NVDAX_MINT,
      rawAmount: 44_483_201n,
      decimals: 8,
    });
    expect(balances.find((b) => b.mint === USDC_MINT)).toEqual({
      mint: USDC_MINT,
      rawAmount: 250_000_000n,
      decimals: 6,
    });
  });

  it("merges the two programs into one list", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.map((b) => b.mint).sort()).toEqual([USDC_MINT, NVDAX_MINT].sort());
  });

  it("drops emptied accounts, so a closed position is not a zero row", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.every((b) => b.rawAmount > 0n)).toBe(true);
    // The zero-balance SPYx account is in the fixture and must not appear.
    expect(balances.map((b) => b.mint)).not.toContain(SPYX_MINT);
  });

  it("sums two accounts for the same mint, which a wallet is allowed to have", async () => {
    const accounts = rpcTokenAccounts.result.value;
    const nvdax = accounts.find((a) => a.account.data.parsed.info.mint === NVDAX_MINT)!;
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: nodeServing([...accounts, structuredClone(nvdax)]).doFetch,
    });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    const nvda = balances.filter((b) => b.mint === NVDAX_MINT);
    expect(nvda.length).toBe(1);
    expect(nvda[0]!.rawAmount).toBe(44_483_201n * 2n);
  });

  it("throws when the node answers an error, rather than reporting an empty wallet", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad params" } } }),
    });
    await expect(rpc.tokenBalances(FIXTURE_OWNER)).rejects.toThrow("bad params");
  });

  it("throws on a transport failure", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: fails(503) }) });
    await expect(rpc.tokenBalances(FIXTURE_OWNER)).rejects.toThrow("503");
  });
});

describe("SolanaRpc.mintConfig", () => {
  it("uses newMultiplier once its effective timestamp has passed", async () => {
    const body = mintWith(
      {
        multiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        newMultiplierEffectiveTimestamp: 1_789_000_200,
      },
      false,
    );
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: body }),
      now: () => 1_789_000_200_000 + 1,
    });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config!.multiplier.toFixed()).toBe("1.001701196801074");
  });

  it("uses the current multiplier until then", async () => {
    const body = mintWith(
      {
        multiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        newMultiplierEffectiveTimestamp: 1_789_000_200,
      },
      false,
    );
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: body }),
      now: () => 1_789_000_200_000 - 1,
    });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config!.multiplier.toFixed()).toBe("1.0009180758490996");
  });

  it("reads the recorded mint without inventing a shape", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: rpcMintNvda }) });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config).not.toBeNull();
    expect(config!.decimals).toBe(8);
    expect(config!.multiplier.gte(D(1))).toBe(true);
    expect(typeof config!.isPaused).toBe("boolean");
  });

  it("reports a halted token", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: mintWith({ multiplier: "1" }, true) }),
    });
    expect((await rpc.mintConfig(NVDAX_MINT))!.isPaused).toBe(true);
  });

  it("says a multiplier of one for a mint that has never paid a dividend", async () => {
    const plain = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        value: {
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          data: { program: "spl-token", parsed: { type: "mint", info: { decimals: 6 } } },
        },
      },
    };
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: plain }) });
    const config = await rpc.mintConfig(USDC_MINT);
    expect(config).toEqual({ decimals: 6, multiplier: D(1), isPaused: false });
  });

  it("says null for an account that does not exist", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: { jsonrpc: "2.0", id: 1, result: { value: null } } }),
    });
    expect(await rpc.mintConfig("NotAMint")).toBeNull();
  });
});

describe("SolanaRpc.transaction", () => {
  const SIGNATURE =
    "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";

  it("returns null when the node has no such transaction, or has pruned it — worth a retry", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: { jsonrpc: "2.0", id: 1, result: null } }),
    });
    expect(await rpc.transaction(SIGNATURE)).toBeNull();
  });

  /**
   * Distinct from "no such transaction": the node has the transaction but not
   * its metadata, which is permanent for that signature and unretryable. With
   * no meta there is no balance to read either, so an empty transaction is
   * the honest answer, not a `null` that stops the walk cold forever.
   */
  it("returns an empty transaction, not null, when the node has it but no metadata", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        blockTime: 1_790_000_000,
        transaction: { message: { accountKeys: [{ pubkey: FIXTURE_OWNER }] } },
        meta: null,
      },
    };
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: body }) });
    const detail = await rpc.transaction(SIGNATURE);
    expect(detail).toEqual({
      signature: SIGNATURE,
      blockTime: 1_790_000_000,
      accountKeys: [FIXTURE_OWNER],
      feeLamports: 0n,
      preLamports: [],
      postLamports: [],
      preTokens: [],
      postTokens: [],
    });
  });

  it("decodes the fee, lamport balances and token balances as bigint when metadata is present", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        blockTime: 1_790_000_000,
        transaction: { message: { accountKeys: [{ pubkey: FIXTURE_OWNER }] } },
        meta: {
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [999_995_000],
          preTokenBalances: [],
          postTokenBalances: [
            { mint: USDC_MINT, owner: FIXTURE_OWNER, uiTokenAmount: { amount: "500000000", decimals: 6 } },
          ],
        },
      },
    };
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: body }) });
    const detail = await rpc.transaction(SIGNATURE);
    expect(detail).toEqual({
      signature: SIGNATURE,
      blockTime: 1_790_000_000,
      accountKeys: [FIXTURE_OWNER],
      feeLamports: 5000n,
      preLamports: [1_000_000_000n],
      postLamports: [999_995_000n],
      preTokens: [],
      postTokens: [{ mint: USDC_MINT, owner: FIXTURE_OWNER, rawAmount: 500_000_000n, decimals: 6 }],
    });
  });
});
