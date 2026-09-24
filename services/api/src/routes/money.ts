import { Hono } from "hono";
import { D, toWire, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { CreditSource } from "@mercury/market";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface MoneyDeps {
  readonly chain: ChainReader;
  readonly credit: CreditSource;
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

    const [balances, credit] = await Promise.all([
      deps.chain.tokenBalances(identity.walletAddress),
      // A missing rate is a missing rate. The balance is the number that
      // matters on this screen, and it does not depend on Kamino being up.
      deps.credit.current().catch(() => null),
    ]);

    const usdc = balances.find((b) => b.mint === deps.usdcMint);
    const balanceUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));

    return c.json({
      balanceUsd: toWire(balanceUsd),
      // What a supplier earns in Kamino's xStocks market right now. It is the
      // rate available, not a rate this account is being paid: v1 supplies
      // nothing, which is also why the interest below is zero.
      yieldApr: toWire(credit?.supplyApy ?? ZERO),
      interestEarnedYtdUsd: "0",
      depositAddress: identity.walletAddress,
      // Borrowing is cut from v1's interface. The shape stays so the field does
      // not have to be invented later. See ADR 0009.
      borrowingPower: { availableUsd: "0", enabled: false },
    });
  });

  return app;
}
