import { D, ZERO, type Decimal } from "../money.js";
import type { Issuer } from "../execution/types.js";
import { tokensToShares } from "./cost-basis.js";

export interface WrapperHolding {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly tokenQty: Decimal;
  readonly multiplier: Decimal;
  readonly pricePerToken: Decimal;
}

export interface WrapperExposure extends WrapperHolding {
  readonly shares: Decimal;
  readonly valueUsd: Decimal;
  readonly sharePct: Decimal;
}

export type ExposureWarningCode = "issuer_concentration";

export interface ExposureWarning {
  readonly code: ExposureWarningCode;
  readonly issuer: Issuer;
  readonly sharePct: Decimal;
  readonly message: string;
}

export interface Exposure {
  readonly ticker: string;
  readonly shares: Decimal;
  readonly valueUsd: Decimal;
  readonly wrappers: readonly WrapperExposure[];
  readonly warnings: readonly ExposureWarning[];
}

export const ISSUER_CONCENTRATION_WARN = D(80);

/**
 * True exposure to one company across every wrapper held.
 *
 * Shares are summed as the sum of `tokenQty x multiplier`, never by adding token
 * counts. Two tokens for the same stock represent different numbers of shares.
 * No broker has this problem, which is why no broker has this screen. See docs/02.
 */
export function exposure(ticker: string, holdings: readonly WrapperHolding[]): Exposure {
  const priced = holdings.map((h) => ({
    ...h,
    shares: tokensToShares(h.tokenQty, h.multiplier),
    valueUsd: h.tokenQty.mul(h.pricePerToken),
  }));

  const valueUsd = priced.reduce((a, h) => a.add(h.valueUsd), ZERO);
  const shares = priced.reduce((a, h) => a.add(h.shares), ZERO);

  const wrappers: WrapperExposure[] = priced
    .map((h) => ({ ...h, sharePct: valueUsd.isZero() ? ZERO : h.valueUsd.div(valueUsd).mul(100) }))
    .sort((a, b) => b.valueUsd.comparedTo(a.valueUsd));

  const byIssuer = new Map<Issuer, Decimal>();
  for (const w of wrappers) byIssuer.set(w.issuer, (byIssuer.get(w.issuer) ?? ZERO).add(w.sharePct));

  const warnings: ExposureWarning[] = [];
  for (const [issuer, pct] of byIssuer) {
    if (pct.gt(ISSUER_CONCENTRATION_WARN) && wrappers.length > 1) {
      warnings.push({
        code: "issuer_concentration",
        issuer,
        sharePct: pct,
        message: `${pct.toFixed(0)}% of your ${ticker} sits with one issuer.`,
      });
    }
  }

  return { ticker, shares, valueUsd, wrappers, warnings };
}
