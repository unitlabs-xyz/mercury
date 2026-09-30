import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
} from "@solana/kit";
import type { QuoteSource } from "@mercury/chain";
import { buildSponsored, type SponsoredBuildDeps } from "./build.js";
import { inMemoryBuilds } from "./builds.js";
import { parseLookupTable } from "./lookups.js";
import jupiter from "./__fixtures__/jupiter-swap-instructions.json" with { type: "json" };
import tables from "./__fixtures__/lookup-table.json" with { type: "json" };

const RELAYER = "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ";
const BUYER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const TABLE = "GvwBveeCABXvtbyQYYyX9133EpvuVRk4HQ8qmcGgox9E" as Address;

const table = parseLookupTable(
  Uint8Array.from(Buffer.from((tables as Record<string, string>)[TABLE] ?? "", "base64")),
);

const deps = (over: Partial<SponsoredBuildDeps> = {}): SponsoredBuildDeps => ({
  quotes: {
    quote: async () => null,
    buildSwap: async () => [],
    buildSwapInstructions: async () => ({
      computeBudget: jupiter.computeBudgetInstructions,
      setup: jupiter.setupInstructions,
      swap: jupiter.swapInstruction,
      cleanup: null,
      lookupTables: [TABLE],
    }),
  } as unknown as QuoteSource,
  lookups: { read: async () => new Map([[TABLE, table]]) },
  relay: {
    signer: { address: RELAYER, cosign: async (b: string) => b },
    builds: inMemoryBuilds(),
  },
  blockhash: async () => ({
    blockhash: "11111111111111111111111111111111" as Blockhash,
    lastValidBlockHeight: 1n,
  }),
  ...over,
});

const read = (wire: string) => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const m = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  return {
    message: m,
    programs: m.instructions.map((i) => m.staticAccounts[i.programAddressIndex]),
    bytes: Uint8Array.from(tx.messageBytes),
  };
};

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

describe("buildSponsored", () => {
  it("names the relayer as payer, so the buyer needs no SOL", async () => {
    const { wire } = await buildSponsored(deps(), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.25"),
    });
    expect(read(wire).message.staticAccounts[0]).toBe(RELAYER);
  });

  it("carries the repayment in the same transaction as the swap", async () => {
    const { wire } = await buildSponsored(deps(), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.25"),
    });
    expect(read(wire).programs).toContain(TOKEN);
  });

  /* Nothing owed, nothing charged — not a transfer of zero. */
  it("leaves the transfer out when the fee is zero", async () => {
    const { wire } = await buildSponsored(deps(), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D(0),
    });
    expect(read(wire).programs).not.toContain(TOKEN);
  });

  /*
   * The link that makes the charge stick. If the message is not remembered
   * before it leaves, the relayer refuses it when it comes back signed and no
   * buy can ever complete.
   */
  it("remembers the message, so the relayer will recognise it", async () => {
    const d = deps();
    const { wire } = await buildSponsored(d, {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.25"),
    });
    expect(d.relay.builds.recognises(read(wire).bytes)).toBe(true);
  });

  it("does not recognise a transaction with the fee altered", async () => {
    const d = deps();
    await buildSponsored(d, {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.25"),
    });
    const cheaper = await buildSponsored(deps(), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.01"),
    });
    expect(d.relay.builds.recognises(read(cheaper.wire).bytes)).toBe(false);
  });

  /*
   * A table we cannot read is a route we cannot compose: without it the
   * message exceeds the size limit and the network rejects it with nothing
   * useful to say. Better to fail here, where the reason is known.
   */
  it("fails loudly when a lookup table cannot be read", async () => {
    await expect(
      buildSponsored(deps({ lookups: { read: async () => new Map() } }), {
        quote: { quoteId: "q", raw: {} },
        owner: BUYER,
        side: "buy" as const,
        feeUsdc: D("0.25"),
      }),
    ).rejects.toThrow(/could not be read/);
  });

  it("charges the exact base units the fee names", async () => {
    const d = deps();
    const { wire } = await buildSponsored(d, {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.25"),
    });
    const { message, programs } = read(wire);
    const at = programs.indexOf(TOKEN as Address);
    const data = message.instructions[at]?.data ?? new Uint8Array();
    // Transfer, then the amount little-endian: 250000 USDC base units.
    expect(data[0]).toBe(3);
    let n = 0n;
    for (let i = data.length - 1; i >= 1; i--) n = (n << 8n) | BigInt(data[i] ?? 0);
    expect(n).toBe(250_000n);
  });
});

/**
 * The wiring, not the composition. `compose.test.ts` proves the two orderings
 * exist; this proves the builder picks the right one from the side, which is
 * the only place that choice is ever made.
 */
describe("buildSponsored, by side", () => {
  const positions = async (side: "buy" | "sell") => {
    const { wire } = await buildSponsored(deps(), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side,
      feeUsdc: D("0.25"),
    });
    /* The zero-fee case above proves the fixture carries no other Token
       instruction, so this index is the charge and nothing else. */
    const { programs } = read(wire);
    return { token: programs.indexOf(TOKEN as Address), jup: programs.indexOf(JUPITER as Address) };
  };

  it("charges a buy before the swap", async () => {
    const { token, jup } = await positions("buy");
    expect(token).toBeGreaterThanOrEqual(0);
    expect(jup).toBeGreaterThan(token);
  });

  it("charges a sell after the swap, because the dollars arrive in it", async () => {
    const { token, jup } = await positions("sell");
    expect(jup).toBeGreaterThanOrEqual(0);
    expect(token).toBeGreaterThan(jup);
  });
});
