import { D, type Decimal } from "@mercury/core";
import type { OwnedTokenAccount } from "@mercury/chain";
import type { MoveToken } from "./build.js";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const LAMPORTS_PER_SOL = D(1_000_000_000);

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
  /**
   * The mints the Mercury wallet already has an account for, empty ones
   * included: no rent is owed for those, since the account is what rent pays
   * for, not the tokens in it.
   */
  readonly mercuryHolds: ReadonlySet<string>;
  /** Rent for one new account, in lamports, by the program it lives under. */
  readonly rent: { readonly classic: bigint; readonly token2022: bigint };
  /** Undefined when SOL has no price: the rent is then said in SOL only. */
  readonly solPriceUsd: Decimal | undefined;
}

export type MovePlan =
  | {
      readonly ok: true;
      readonly tokens: readonly MoveToken[];
      /** The rent of the accounts the Mercury wallet lacks, which the linked wallet pays in SOL. */
      readonly rentLamports: bigint;
      /** The same in dollars, at SOL's price now; zero when SOL has no price. */
      readonly rentUsd: Decimal;
    }
  | {
      readonly ok: false;
      readonly code: "nothing_to_move" | "not_held" | "too_much";
      readonly mint?: string;
    };

/**
 * What a move will do, before anything is built: which of the linked wallet's
 * accounts each token leaves from, and what opening the Mercury wallet's
 * missing accounts costs.
 *
 * The linked wallet pays it all, in SOL: the network fee and the rent of each
 * account the Mercury wallet lacks. It is the person's own wallet, signing for
 * their own money going into their own account. Mercury sponsors only the
 * Mercury wallet, whose accounts it alone can close; a linked wallet's keys are
 * its own, so rent Mercury put up there could be taken back out. There is no
 * Mercury fee on a move between a person's own wallets.
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
  const rentUsd =
    input.solPriceUsd === undefined || input.solPriceUsd.lte(0)
      ? D(0)
      : D(rentLamports.toString()).div(LAMPORTS_PER_SOL).mul(input.solPriceUsd);
  return { ok: true, tokens, rentLamports, rentUsd };
};
