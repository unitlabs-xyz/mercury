import type { QuoteSource, RedeemableQuote } from "@mercury/chain";
import { USDC_DECIMALS, USDC_MINT } from "@mercury/chain";
import { Decimal } from "@mercury/core";
import type { Address, Blockhash } from "@solana/kit";
import type { SponsoredBuilds } from "./builds.js";
import { composeSponsored, toInstruction } from "./compose.js";
import type { LookupTableReader } from "./lookups.js";
import type { RelaySigner } from "./signer.js";
import { associatedTokenAddress, transferInstruction } from "./usdc.js";

/**
 * A trade the account holder can make with no SOL at all.
 *
 * Every piece exists already; this is where they meet. The swap arrives as
 * instructions rather than a transaction so the repayment can sit beside it,
 * the relayer is named as payer so the buyer is never charged by the network,
 * and the message is remembered so the relayer will sign this and nothing else.
 */

export interface SponsoredBuildDeps {
  readonly quotes: QuoteSource;
  readonly lookups: LookupTableReader;
  readonly relay: { readonly signer: RelaySigner; readonly builds: SponsoredBuilds };
  readonly blockhash: () => Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
}

export interface SponsoredBuildInput {
  readonly quote: RedeemableQuote;
  readonly owner: string;
  /** What the trader repays, in USDC. Zero skips the transfer entirely. */
  readonly feeUsdc: Decimal;
  /**
   * Decides which side of the swap the charge goes: a buy is charged from USDC
   * it already holds, a sell from USDC the swap has yet to deliver. See
   * `ComposeInput.chargePosition`.
   */
  readonly side: "buy" | "sell";
}

/**
 * USDC has six decimals, so $0.25 is 250000 of them.
 *
 * Rounded down, which is what the mode here has to spell out: decimal.js
 * numbers its rounding modes, and `0` is ROUND_UP, not the round down the
 * comment used to claim. Nothing was overcharged, because the fee arrives
 * already rounded up to the cent and so has nothing left to round — but the
 * comment was wrong, and copying it into `transfer.ts` is what charged a unit
 * too many there until a test caught it.
 */
const toBaseUnits = (usdc: Decimal): bigint =>
  BigInt(usdc.mul(10 ** USDC_DECIMALS).toFixed(0, Decimal.ROUND_DOWN));

export const buildSponsored = async (
  deps: SponsoredBuildDeps,
  input: SponsoredBuildInput,
): Promise<{ wire: string }> => {
  const relayer = deps.relay.signer.address as Address;

  const [instructions, lifetime] = await Promise.all([
    deps.quotes.buildSwapInstructions(input.quote, input.owner, relayer),
    deps.blockhash(),
  ]);

  const tables = await deps.lookups.read(instructions.lookupTables as readonly Address[]);
  /*
   * A table we could not read is a route we cannot compose. Failing here is
   * the honest outcome: composing without it produces a transaction over the
   * size limit, which the network rejects with nothing useful to say.
   */
  for (const named of instructions.lookupTables) {
    if (!tables.has(named as Address)) {
      throw new Error(`lookup table ${named} could not be read`);
    }
  }

  const base = toBaseUnits(input.feeUsdc);
  const charge =
    base === 0n
      ? null
      : transferInstruction({
          source: await associatedTokenAddress(input.owner as Address, USDC_MINT as Address),
          destination: await associatedTokenAddress(relayer, USDC_MINT as Address),
          owner: input.owner as Address,
          amount: base,
        });

  const { wire, messageBytes } = composeSponsored({
    relayer,
    blockhash: lifetime.blockhash,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    computeBudget: instructions.computeBudget.map(toInstruction),
    charge,
    chargePosition: input.side === "buy" ? "before" : "after",
    // Setup opens the account the shares arrive in, and is paid for by the
    // relayer like everything else here.
    swap: [...instructions.setup.map(toInstruction), toInstruction(instructions.swap)].concat(
      instructions.cleanup === null ? [] : [toInstruction(instructions.cleanup)],
    ),
    lookupTables: tables,
  });

  /* Remembered before it leaves, or the relayer will not recognise it coming back. */
  deps.relay.builds.remember(messageBytes);
  return { wire };
};
