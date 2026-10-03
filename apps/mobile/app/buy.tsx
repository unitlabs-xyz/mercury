import { useLocalSearchParams, useRouter } from "expo-router";
import { BuySheet } from "../src/order/BuySheet";

/**
 * The buy sheet as a route, so the root stack can present it as an iOS form
 * sheet. The stock page passes what it already has on screen — the ticker,
 * the name and the logo — so the sheet opens drawn rather than loading.
 */
export default function Buy() {
  const router = useRouter();
  const { ticker, name, logoUrl } = useLocalSearchParams<{
    ticker: string;
    name?: string;
    logoUrl?: string;
  }>();
  const t = (ticker ?? "").toUpperCase();
  return <BuySheet ticker={t} name={name ?? t} logoUrl={logoUrl} onClose={() => router.back()} />;
}
