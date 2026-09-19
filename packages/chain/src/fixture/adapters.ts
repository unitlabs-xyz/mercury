import { D } from "@harbor/core";
import type { QuoteRequest, QuoteSource, TokenRef, TokenRegistry, TriggerOrder, TriggerSource } from "../ports.js";
import { FIXTURE_TOKENS } from "./data.js";

export class FixtureRegistry implements TokenRegistry {
  async wrappersFor(ticker: string): Promise<readonly TokenRef[]> {
    return FIXTURE_TOKENS.filter((t) => t.ticker === ticker).map(toRef);
  }
  async all(): Promise<readonly TokenRef[]> {
    return FIXTURE_TOKENS.map(toRef);
  }
  async byMint(mint: string): Promise<TokenRef | null> {
    const t = FIXTURE_TOKENS.find((x) => x.mint === mint);
    return t ? toRef(t) : null;
  }
}

const toRef = (t: (typeof FIXTURE_TOKENS)[number]): TokenRef => ({
  mint: t.mint, symbol: t.symbol, ticker: t.ticker, issuer: t.issuer, decimals: t.decimals,
});

/** Deterministic quotes from the 19 September measurements. No network, no keys. */
export class FixtureQuoteSource implements QuoteSource {
  async quote(req: QuoteRequest): Promise<Awaited<ReturnType<QuoteSource["quote"]>>> {
    const t = FIXTURE_TOKENS.find((x) => x.mint === req.mint);
    if (t === undefined) return null;

    const pricePerToken = D(t.pricePerShare).mul(t.multiplier);
    const outAmount = req.side === "buy" ? req.amount.div(pricePerToken) : req.amount.mul(pricePerToken);

    return {
      inAmount: req.amount,
      outAmount,
      priceImpact: D(t.priceImpact),
      routeLabels: [t.route],
      quoteId: `fixture-${t.symbol}-${req.side}-${req.amount.toFixed(4)}`,
      expiresAt: new Date(Date.now() + 30_000),
    };
  }

  async buildSwap(quoteId: string): Promise<readonly string[]> {
    return [`fixture-unsigned-tx:${quoteId}`];
  }
}

export class FixtureTriggerSource implements TriggerSource {
  private readonly orders = new Map<string, TriggerOrder>();

  async create(req: QuoteRequest & { triggerPricePerToken: unknown; owner: string }): Promise<readonly string[]> {
    const account = `fixture-trigger-${req.mint}-${Date.now()}`;
    this.orders.set(account, { account, status: "open", filledTokens: D(0) });
    return [`fixture-unsigned-trigger:${account}`];
  }
  async status(account: string): Promise<TriggerOrder> {
    return this.orders.get(account) ?? { account, status: "expired", filledTokens: D(0) };
  }
  async cancel(account: string): Promise<readonly string[]> {
    this.orders.delete(account);
    return [`fixture-unsigned-cancel:${account}`];
  }
}
