import { Hono } from "hono";
import { D, toWire, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { capacity } from "../lending/capacity.js";
import { capacityInputFor } from "../lending/input.js";
import type { LendingSource } from "../lending/ports.js";
import type { CreditSource } from "@mercury/market";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface MoneyDeps {
  readonly chain: ChainReader;
  readonly credit: CreditSource;
  /** Kamino, for what this wallet could borrow against what it holds. */
  readonly lending: LendingSource;
  readonly usdcMint: string;
}

export function moneyRoutes(deps: MoneyDeps): Hono {
  const app = new Hono();

  app.get("/v1/money", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json({
        balanceUsd: "0",
        yieldApr: "0",
        interestEarnedYtdUsd: "0",
        depositAddress: null,
        borrowingPower: { availableUsd: "0", enabled: false },
      });
    }

    const wallet = identity.walletAddress;
    const [balances, credit] = await Promise.all([
      deps.chain.tokenBalances(wallet),
      // A missing rate is a missing rate. The balance is the number that
      // matters on this screen, and it does not depend on Kamino being up.
      deps.credit.current().catch(() => null),
    ]);

    const usdc = balances.find((b) => b.mint === deps.usdcMint);
    const balanceUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));

    // Same rule as the rate above: if Kamino cannot be read, the balance still
    // answers. What changes is that we then cannot say what is borrowable, and
    // the field says so rather than reporting a confident zero.
    const power = await capacityInputFor(deps, wallet, balances)
      .then(capacity)
      .catch(() => null);

    return c.json({
      balanceUsd: toWire(balanceUsd),
      // What a supplier earns in Kamino's xStocks market right now. It is the
      // rate available, not a rate this account is being paid: v1 supplies
      // nothing, which is also why the interest below is zero.
      yieldApr: toWire(credit?.supplyApy ?? ZERO),
      interestEarnedYtdUsd: "0",
      depositAddress: wallet,
      /*
       * ADR 0009 puts borrowing against holdings firmly in scope — "not margin
       * trading, and it stays" — and `/v1/borrow` has shipped it. This field
       * used to answer a flat zero and cite that same ADR as the reason, which
       * read its own decision backwards.
       *
       * `enabled` is whether we can offer borrowing right now, not whether the
       * product has the feature. Nothing pledged is enabled with nothing
       * available, which lets the screen invite a deposit; Kamino unreachable
       * is not enabled, because offering a number we cannot price would be
       * worse than saying we do not know.
       */
      borrowingPower:
        power === null
          ? { availableUsd: "0", enabled: false }
          : { availableUsd: toWire(power.borrowableNowUsd.toDecimalPlaces(2)), enabled: true },
    });
  });

  return app;
}
