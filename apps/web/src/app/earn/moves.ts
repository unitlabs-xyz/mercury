import { usd } from "@mercury/view";
import type { EarnIntent, EarnStep } from "../../api/earn";

/** Cents, rounded down: never offer a cent more than is there. */
export const floorCents = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/**
 * What a switch puts into the new vault: what came out of the others, never
 * more than the figure the button showed. The withdrawals' confirms say what
 * came out; when one could not be read, the figure shown is what moves.
 * Either way, cash that was already in the wallet stays there.
 */
export const switchDeposit = (shown: number, cameOut: number | null) =>
  floorCents(cameOut === null ? shown : Math.min(shown, cameOut));

/**
 * Whether Earn can cover a purchase's shortfall. The withdraw sheet takes from
 * one vault at a time, so one vault alone has to hold it; anything less and
 * the way out is adding cash.
 */
export const earnCovers = (holdings: readonly { balanceUsd: number }[] | undefined, shortfall: number) =>
  shortfall > 0 && (holdings ?? []).some((h) => h.balanceUsd >= shortfall);

/** A move that stopped part way: what already happened, then why the rest did not. */
export const partialMoveText = (cameOut: number | null, reason: string) =>
  `${cameOut === null ? "Your money" : usd(cameOut)} came out of Earn and is in your cash. ` +
  `Moving it on didn't go through: ${reason}`;

/** The sentence an error carries, if it carries one. Wallets throw bare objects with a `message`. */
export const reasonOf = (err: unknown): string | null => {
  if (err instanceof Error && err.message) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.length > 0 ? message : null;
};

/** What a move needs from outside: the server, the wallet, and the confirm. */
export interface MoveIo {
  build(intent: EarnIntent): Promise<{ transactions: string[]; vault: string }>;
  /** Signs and sends one transaction and answers its signature once it lands. Throws if it did not. */
  signAndSend(transaction: string): Promise<string>;
  /** Tells the server what landed. Never throws: null when it could not say. */
  confirm(sent: {
    signature: string;
    action: EarnIntent;
  }): Promise<{ recorded: boolean; usd: string } | null>;
}

/**
 * A move's steps, in order, answering every signature sent. A switch's
 * deposit is what its withdrawals brought back, up to the figure shown; a
 * move that fails after something landed says what already moved, because
 * "your money has not moved" would then be false.
 */
export async function runSteps(steps: readonly EarnStep[], io: MoveIo): Promise<string[]> {
  const signatures: string[] = [];
  /* Dollars this run's withdrawals brought back; null once one of them could not be read. */
  let cameOut: number | null = 0;
  for (const step of steps) {
    const intent: EarnIntent =
      typeof step.usd === "object"
        ? { kind: "deposit", usd: switchDeposit(step.usd.cameOutUpTo, cameOut).toFixed(2), vault: step.vault }
        : { ...step, usd: step.usd };
    try {
      const built = await io.build(intent);
      let last: string | undefined;
      for (const tx of built.transactions) {
        last = await io.signAndSend(tx);
        signatures.push(last);
      }
      if (last !== undefined) {
        const filed = await io.confirm({ signature: last, action: { ...intent, vault: built.vault } });
        if (intent.kind === "withdraw") {
          cameOut = cameOut === null || filed === null ? null : cameOut + Number(filed.usd);
        }
      }
    } catch (err) {
      if (signatures.length === 0) throw err;
      throw new Error(partialMoveText(cameOut, reasonOf(err) ?? "it did not go through."), { cause: err });
    }
  }
  return signatures;
}
