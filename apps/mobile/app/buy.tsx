import { useLocalSearchParams, useRouter } from "expo-router";
import { usePortfolio } from "../src/api";
import { BuySheet } from "../src/order/BuySheet";

/**
 * The order sheet as a route, so the root stack can present it as an iOS form
 * sheet. The stock page passes what it already has on screen — the ticker,
 * the name and the logo — so the sheet opens drawn rather than loading.
 *
 * `side=sell` turns it round. What can be sold is worked out here, as the
 * web's stock page does: the books count pledged stock as owned, and they are
 * right to, but the wallet cannot spend it, so it is not what can be sold.
 */
export default function Buy() {
  const router = useRouter();
  const { ticker, name, logoUrl, side } = useLocalSearchParams<{
    ticker: string;
    name?: string;
    logoUrl?: string;
    side?: string;
  }>();
  const t = (ticker ?? "").toUpperCase();
  const selling = side === "sell";

  const holding = usePortfolio().data?.holdings.find((h) => h.ticker === t);
  const shares = holding === undefined ? null : Number(holding.shares);
  const pledged = holding?.pledgedShares === undefined ? 0 : Number(holding.pledgedShares);
  const sellableUsd =
    holding === undefined || shares === null || shares <= 0
      ? null
      : Number(((Number(holding.valueUsd) * Math.max(0, shares - pledged)) / shares).toFixed(2));

  return (
    <BuySheet
      ticker={t}
      name={name ?? t}
      logoUrl={logoUrl}
      side={selling ? "sell" : "buy"}
      sellableUsd={sellableUsd}
      onClose={() => router.back()}
    />
  );
}
