import { describe, expect, it } from "vitest";
import { JupiterRegistry, SolanaRpc } from "@mercury/chain";
import { JupiterMarket } from "./jupiter.js";
import { MintMultipliers } from "./mint.js";

const RPC = process.env["SOLANA_RPC_URL"];

/**
 * The risk the backend design takes on is two paths disagreeing. The server
 * reads the multiplier from the mint; the browser fallback reads it from
 * Jupiter. If those ever diverge, every share count on one of the two paths is
 * wrong, and nothing else in the system would notice.
 *
 * Live, by hand, never in CI:
 *   SOLANA_RPC_URL=https://… pnpm --filter @mercury/market exec vitest run parity.live
 */
describe.skipIf(RPC === undefined)("multiplier parity, live", () => {
  it("agrees with Jupiter on every wrapper we list", async () => {
    const registry = new JupiterRegistry();
    const chain = new SolanaRpc({ rpcUrl: RPC! });
    const fromMint = new MintMultipliers({ chain });
    const fromJupiter = new JupiterMarket({ registry });

    const tokens = await registry.all();
    expect(tokens.length).toBeGreaterThan(0);

    for (const token of tokens) {
      const [mint, jupiter] = await Promise.all([
        fromMint.multiplierFor(token.mint),
        fromJupiter.multiplierFor(token.mint),
      ]);
      expect(mint, `${token.symbol} has no multiplier on chain`).not.toBeNull();
      expect(jupiter, `${token.symbol} has no multiplier at Jupiter`).not.toBeNull();
      // A floating-point round trip through Jupiter's JSON costs a few digits,
      // so exact equality is the wrong assertion. A basis point is not: the gap
      // this catches is a stale multiplier, which is hundreds of times larger.
      const gap = mint!.sub(jupiter!).abs().div(mint!);
      expect(gap.lte("0.0001"), `${token.symbol}: chain ${mint!.toFixed()} vs jupiter ${jupiter!.toFixed()}`).toBe(true);
    }
  }, 60_000);
});
