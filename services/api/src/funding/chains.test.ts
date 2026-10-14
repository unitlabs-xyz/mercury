import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chainRank, isSupportedChain, SUPPORTED_CHAIN_IDS } from "./chains.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const WEB_CHAINS = join(ROOT, "apps/web/src/wallet/chains.ts");

describe("SUPPORTED_CHAIN_IDS", () => {
  it("has no duplicates, since the order is the chip order", () => {
    expect(new Set(SUPPORTED_CHAIN_IDS).size).toBe(SUPPORTED_CHAIN_IDS.length);
  });

  it("does not include Bitcoin, which no wallet here can sign for", () => {
    expect(isSupportedChain(8253038)).toBe(false);
  });

  it("ranks an unlisted chain last rather than first", () => {
    /* `indexOf` returning -1 would sort an unknown chain to the top of the
       list, which is the opposite of what an unknown chain deserves. */
    expect(chainRank(999999)).toBeGreaterThan(chainRank(SUPPORTED_CHAIN_IDS.at(-1)!));
  });
});

/*
 * The server decides which chains we offer; the browser decides which it can
 * sign on. Those are two files in two packages, and a chain in the first but
 * not the second is a row that fails after somebody has chosen it — the worst
 * moment to find out.
 *
 * The web app cannot be imported from here, so this reads its source the way
 * dockerfile.test.ts reads the Dockerfile. Coarse, and it only has to catch
 * the case that matters: adding a chain to the server and forgetting the
 * browser.
 */
describe("the chains the browser can sign on", () => {
  const web = existsSync(WEB_CHAINS) ? readFileSync(WEB_CHAINS, "utf8") : null;

  it("has a source file to check against", () => {
    expect(web).not.toBeNull();
  });

  it("declares every chain the server offers", () => {
    /* Solana arrives as a named constant and the EVM chains as viem imports,
       so match both shapes rather than parsing TypeScript. */
    const solana = /SOLANA_CHAIN_ID\s*=\s*(\d+)/.exec(web!)?.[1];
    const evmNames = /EVM_NETWORKS\s*=\s*\[([^\]]*)\]/
      .exec(web!)?.[1]
      ?.split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    expect(evmNames).toBeDefined();

    /* viem's ids for the chains we name. Hardcoded because importing viem into
       the API to read nine integers would be a dependency for a test. */
    const VIEM_IDS: Readonly<Record<string, number>> = {
      mainnet: 1,
      optimism: 10,
      bsc: 56,
      unichain: 130,
      polygon: 137,
      base: 8453,
      arbitrum: 42161,
      avalanche: 43114,
    };

    const signable = new Set<number>([
      ...(solana === undefined ? [] : [Number(solana)]),
      ...evmNames!.flatMap((n) => {
        const id = VIEM_IDS[n];
        return id === undefined ? [] : [id];
      }),
    ]);

    /* Every name in EVM_NETWORKS has to be one this test knows, or the check
       silently passes by not recognising the chain it was meant to verify. */
    expect(evmNames!.filter((n) => VIEM_IDS[n] === undefined)).toEqual([]);

    expect(SUPPORTED_CHAIN_IDS.filter((id) => !signable.has(id))).toEqual([]);
  });
});
