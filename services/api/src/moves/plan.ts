import { D, type Decimal } from "@mercury/core";
import type { OwnedTokenAccount } from "@mercury/chain";
import { transferFee } from "../relay/fee.js";
import type { MoveToken } from "./build.js";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC_UNITS = D(10).pow(6);

export interface MovePlanInput {
  /** The linked wallet's token accounts, as the node has them. */
  readonly owned: readonly OwnedTokenAccount[];
  /** What Mercury lists: its stocks and USDC. Nothing else is offered to move. */
  readonly listed: ReadonlySet<string>;
  /**
   * How much of each to move, in the smallest unit. Absent, everything listed
   * the wallet holds. A mint left out of it is not moved.
   */
  readonly asked?: ReadonlyMap<string, bigint> | undefined;
  /** The mints the Mercury wallet already has an account for: no rent is owed for those. */
  readonly mercuryHolds: ReadonlySet<string>;
  /** Rent for one new account, in lamports, by the program it lives under. */
  readonly rent: { readonly classic: bigint; readonly token2022: bigint };
  /** Undefined when SOL has no price: then nothing is charged, as for a trade. */
  readonly solPriceUsd: Decimal | undefined;
  readonly usdcMint: string;
}

export type MovePlan =
  | {
      readonly ok: true;
      readonly tokens: readonly MoveToken[];
      /** What the move repays the relayer, in USDC's smallest unit; zero when Mercury covers it. */
      readonly feeUsdcRaw: bigint;
      /** The rent of the accounts the Mercury wallet lacks, in dollars, whoever pays it. */
      readonly rentUsd: Decimal;
      /** True when the rent is owed but no USDC moves to take it from, so Mercury pays. */
      readonly coveredByMercury: boolean;
    }
  | {
      readonly ok: false;
      readonly code: "nothing_to_move" | "not_held" | "too_much";
      readonly mint?: string;
    };

/**
 * What a move will do, before anything is built: which of the linked wallet's
 * accounts each token leaves from, and what opening the Mercury wallet's
 * missing accounts costs and who pays it.
 *
 * The rent is the one cost: the relayer opens each account the Mercury wallet
 * lacks and is repaid from the USDC that moves, when there is more than
 * enough of it. When no USDC moves, or too little, Mercury covers it. There is
 * no Mercury fee on a move between a person's own wallets.
 *
 * A token in two of the wallet's accounts moves from each, the largest first,
 * until what was asked for is reached.
 */
export const planMove = (input: MovePlanInput): MovePlan => {
  const held = input.owned.filter((a) => input.listed.has(a.mint) && a.rawAmount > 0n);
  const mints = new Set(held.map((a) => a.mint));

  if (input.asked !== undefined) {
    for (const [mint, amount] of input.asked) {
      if (amount <= 0n) continue;
      if (!mints.has(mint)) return { ok: false, code: "not_held", mint };
      const total = held.filter((a) => a.mint === mint).reduce((s, a) => s + a.rawAmount, 0n);
      if (amount > total) return { ok: false, code: "too_much", mint };
    }
  }

  const tokens: MoveToken[] = [];
  for (const mint of mints) {
    let left = input.asked === undefined ? undefined : (input.asked.get(mint) ?? 0n);
    const accounts = held
      .filter((a) => a.mint === mint)
      .sort((a, b) => (a.rawAmount === b.rawAmount ? 0 : a.rawAmount > b.rawAmount ? -1 : 1));
    for (const a of accounts) {
      const amount = left === undefined ? a.rawAmount : left < a.rawAmount ? left : a.rawAmount;
      if (amount <= 0n) break;
      tokens.push({
        mint,
        source: a.address,
        programId: a.programId,
        decimals: a.decimals,
        amountRaw: amount,
      });
      if (left !== undefined) left -= amount;
    }
  }
  if (tokens.length === 0) return { ok: false, code: "nothing_to_move" };

  // Rent, once for each mint whose account the Mercury wallet lacks.
  const opened = new Map<string, string>();
  for (const t of tokens) if (!input.mercuryHolds.has(t.mint)) opened.set(t.mint, t.programId);
  const rentLamports = [...opened.values()].reduce(
    (s, program) => s + (program === TOKEN_2022 ? input.rent.token2022 : input.rent.classic),
    0n,
  );
  const fee =
    input.solPriceUsd === undefined || input.solPriceUsd.lte(0)
      ? D(0)
      : transferFee({ rentLamports: Number(rentLamports), solPriceUsd: input.solPriceUsd }).usdc;
  const feeRaw = BigInt(fee.mul(USDC_UNITS).ceil().toFixed());

  // Only from the one USDC account the build takes it from, and never all of it.
  const firstUsdc = tokens.find((t) => t.mint === input.usdcMint);
  const takeable = firstUsdc !== undefined && firstUsdc.amountRaw > feeRaw;
  const charged = feeRaw > 0n && takeable ? feeRaw : 0n;
  return {
    ok: true,
    tokens,
    feeUsdcRaw: charged,
    rentUsd: fee,
    coveredByMercury: feeRaw > 0n && charged === 0n,
  };
};
