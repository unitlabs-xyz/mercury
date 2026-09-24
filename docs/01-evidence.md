# 01 · Evidence

Everything here was read from live public sources on **19 September 2026**, a Saturday, with the
US stock market closed. Raw output is in `2026-09-19-solana-measurements.json` in the product
folder of the previous repository. Re-run it before quoting any number in public; these move.

## The market

| Measure                                                                | Value    |
| ---------------------------------------------------------------------- | -------- |
| Tokenized US stocks and funds on Solana                                | 590      |
| Issued by Backed (`x` suffix)                                          | 139      |
| Issued by Ondo Global Markets (`on` suffix)                            | 451      |
| Of the fifteen largest tickers we checked, available from both issuers | 15 of 15 |

Every major name has at least two wrappers. That is the condition the whole product depends on.

## Finding 1 · The two issuers are not interchangeable

Each token carries a **multiplier**, the number of real shares one token represents. It starts at
1.0 and rises as dividends are reinvested. The two issuers reinvest on their own schedules, so
the same stock has a different multiplier from each.

| Ticker | Backed   | Ondo     | Gap   |
| ------ | -------- | -------- | ----- |
| SPY    | 1.005715 | 1.009473 | 0.37% |
| QQQ    | 1.002725 | 1.003353 | 0.06% |
| AAPL   | 1.003269 | 1.003376 | 0.01% |
| NVDA   | 1.001701 | 1.001715 | 0.00% |
| JPM    | 1.013917 | 1.013353 | 0.06% |

Comparing raw token prices without dividing by the multiplier gets the answer wrong. On the S&P
500 a naive comparison says Backed is 0.48% cheaper; corrected, it is 0.11% cheaper. The naive
answer overstates the gap by more than three times.

**Consequence.** Every price the user sees must be a price _per share_, computed as the token
price divided by that token's multiplier. This rule appears again in
[04 Execution engine](04-execution-engine.md) and [05 Data model](05-data-model.md).

## Finding 2 · Only one issuer is actually liquid

Quotes taken through Jupiter for a $1,000 buy, converted to price per share.

| Ticker | Backed, price impact | Ondo, price impact | Backed $/share | Ondo $/share |
| ------ | -------------------- | ------------------ | -------------- | ------------ |
| NVDA   | 0.02%                | 85.27%             | 222.33         | 1,523.66     |
| TSLA   | 0.02%                | 97.41%             | 364.86         | 14,054.51    |
| QQQ    | 0.11%                | 75.64%             | 721.07         | 2,884.48     |
| AAPL   | 0.27%                | 13.18%             | 335.97         | 395.28       |
| SPY    | 0.00%                | 0.10%              | 764.21         | 765.03       |
| MSTR   | 0.19%                | no route           | 159.52         | —            |

At $10,000 the picture is worse: Ondo's Apple wrapper has no route at all, and Nvidia's impact
rises to 97%.

**Consequence.** A user who picks the wrong wrapper for Nvidia pays $1,524 for a share worth
$222 and nothing in the market warns them. This is the single strongest argument for the product
existing, and it is why the router in [04](04-execution-engine.md) is not optional.

The S&P 500 is the exception where both issuers are deep. That matters, because it proves the
comparison is real work and not a fixed preference for one issuer.

## Finding 3 · The reference price is available while the market is shut

The underlying share price is published continuously and was readable all Saturday. So was the
session state, which reported `MARKET_CLOSED` with reason `Weekend or Holiday` and the next open
at 2026-09-21T00:05:00Z.

**Consequence.** A fair-price check is possible at any hour. Without this the premium gate could
not exist.

## Finding 4 · Weekend drift is usually small

Best available on-chain price against the real share price, same Saturday.

| Token | Premium |
| ----- | ------- |
| NVDAx | −0.02%  |
| SPYx  | +0.02%  |
| QQQx  | −0.06%  |
| TSLAx | −0.09%  |
| AAPLx | +0.14%  |
| SPYon | +0.13%  |

**Consequence, and be honest about it.** The gate rarely fires. It is insurance against the rare
weekend, not a constant tax. Do not oversell it in the pitch. The known catastrophic case is from
another chain: a tokenized HIMS traded at 4.6 times its share price when a memecoin cornered the
float and nobody could mint more.

## Finding 5 · Borrowing against these tokens already exists

Kamino, the largest lender on Solana, accepts eight tokenized stocks as collateral and already
applies a price band outside market hours, refusing prices that stray too far from the last
close. Collateral factors sit around 60% for single names.

**Consequence.** The credit line in version two is an integration, not a lending protocol we
write. It also means somebody competent already agreed with our risk analysis.

## Context worth carrying

- Roughly $111M of tokenized stock sits in Solana DeFi against roughly $20M that could actually
  be sold, per Pine Analytics. Collateral outruns liquidity by five times.
- Solana closed Q2 2026 with $5.77B in tokenized asset spot volume, a quarterly high.
- Kraken launched yield vaults over xStocks on 14 September 2026, built on Kamino.

## What we have not measured

1. **Depth beyond $10,000.** Every quote above is at $1,000 and $10,000. Larger orders on a
   Sunday are unknown.
2. **Whether Kamino's borrow caps have room.** This decides whether borrowing power can be shown
   live in the demo or only illustrated.
3. **A dislocation event.** We have measured calm weekends only.
