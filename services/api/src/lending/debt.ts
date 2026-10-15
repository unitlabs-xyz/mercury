import { ZERO, type Decimal } from "@mercury/core";
import { logger } from "../log/index.js";
import type { LendingSource } from "./ports.js";

/**
 * What this wallet owes Kamino, or null if Kamino would not say.
 *
 * The null is the point. `pledgedByMint` answers an unreadable Kamino with an
 * empty list, which makes a holder look like they hold less — wrong, and wrong
 * in the direction that costs nobody anything. Answering the same way here
 * would make a borrower look solvent, and a portfolio that overstates net worth
 * during an outage is the one that tells someone they have room to borrow more.
 *
 * So there are three answers, not two: a figure, zero for an account with no
 * loan, and null for not knowing. The caller decides what to show for null; it
 * must not decide it is zero.
 */
const log = logger("lending");

export async function debtFrom(lending: LendingSource, wallet: string): Promise<Decimal | null> {
  try {
    const position = await lending.position(wallet);
    return position === null ? ZERO : position.debtUsd;
  } catch (error: unknown) {
    // The wallet, never the address: an address in a log is a person's holdings in a log.
    log.error({ err: error }, "could not read the loan for a wallet");
    return null;
  }
}
