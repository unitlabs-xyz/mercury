import { useEffect, useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import type { ManagedBasketPortfolioSnapshot } from "@mercury/types";
import { displayBasketName, pct, usd, type EventKind } from "@mercury/view";
import { apiFetch, useMarketStatus, type Borrow } from "../api";
import { useOwnedBasketPortfolios } from "../baskets/api";
import { KindGlyph } from "../activity/marks";
import { PressableScale, Skeleton } from "../ui";
import { color, font, radius, space } from "../theme";

/** "in 3h 12m", "in 2d 4h", "in 8m". */
const until = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return days > 0 ? `in ${days}d ${hours}h` : hours > 0 ? `in ${hours}h ${minutes % 60}m` : `in ${minutes}m`;
};

/** "Fri 9:30 AM ET": the exchange's own clock, since that is the one the market keeps. */
const etTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";

type Item = {
  key: string;
  kind: EventKind;
  title: string;
  detail: string;
  /** When it happens, for ordering; null for something steady, like interest. */
  at: number | null;
  right: string;
  onPress?: () => void;
};

/**
 * Coming up, from what the account can actually see ahead: the market's next
 * open or close, each basket's next rebalance, what a loan is building and
 * what cash is earning. The web's panel of the same name has no endpoint yet;
 * every line here is read from one that exists.
 */
export const ComingUp = ({
  borrow,
  cashUsd,
  apr,
}: {
  borrow: Borrow | undefined;
  cashUsd: number;
  /** Cash's yearly rate, as a percentage. */
  apr: number;
}) => {
  const router = useRouter();
  const market = useMarketStatus();
  const owned = useOwnedBasketPortfolios();
  const snapshots = useQueries({
    queries: (owned.data ?? [])
      .filter((p) => p.slug !== "")
      .map((p) => ({
        queryKey: ["api", "basket-portfolio", p.slug, "coming-up"],
        queryFn: async () =>
          (
            await apiFetch<{ portfolio: ManagedBasketPortfolioSnapshot | null }>(
              `/v1/basket-templates/${encodeURIComponent(p.slug)}/portfolio`,
            )
          ).portfolio,
        staleTime: 60_000,
      })),
  });

  /* The countdown reads the clock itself between the minute's reads. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const items: Item[] = [];
  const m = market.data;
  if (m) {
    const next = m.isOpen ? m.nextCloseAt : m.nextOpenAt;
    if (next !== null) {
      items.push({
        key: "market",
        kind: "queued",
        title: m.isOpen ? "US market closes" : "US market opens",
        detail: etTime(next),
        at: Date.parse(next),
        right: until(Date.parse(next) - now),
        onPress: () => router.navigate("/invest"),
      });
    }
  }
  (owned.data ?? []).forEach((p, k) => {
    const due = snapshots[k]?.data?.schedule?.nextDueAt;
    if (!due) return;
    items.push({
      key: `basket-${p.portfolioId}`,
      kind: "dividend",
      title: `${displayBasketName(p.name)} rebalances`,
      detail: "Back to its target weights",
      at: Date.parse(due),
      right: until(Date.parse(due) - now),
      onPress: () => router.push({ pathname: "/baskets/[slug]", params: { slug: p.slug } }),
    });
  });
  if (borrow !== undefined && borrow.debtUsd > 0) {
    items.push({
      key: "loan",
      kind: "borrow",
      title: "Loan interest",
      detail: `${pct(borrow.borrowApy * 100, 1)} a year on ${usd(borrow.debtUsd)}`,
      at: null,
      right: `≈${usd((borrow.debtUsd * borrow.borrowApy) / 12)}/mo`,
      onPress: () => router.push("/borrow"),
    });
  }
  if (cashUsd > 0 && apr > 0) {
    items.push({
      key: "cash",
      kind: "interest",
      title: "Cash earning",
      detail: `${pct(apr, 1)} a year on ${usd(cashUsd)}`,
      at: null,
      right: `≈${usd((cashUsd * apr) / 100 / 12)}/mo`,
      onPress: () => router.navigate("/money"),
    });
  }
  /* Dated things first, soonest first; steady ones after. */
  items.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));

  if (items.length === 0 && !market.isPending) return null;

  return (
    <View style={s.card}>
      <RNText style={s.title}>Coming up</RNText>
      <View style={s.list}>
        {market.isPending && items.length === 0
          ? [0, 1].map((k) => <Skeleton key={k} width="100%" height={40} style={s.skeleton} />)
          : items.map((item) => (
              <PressableScale
                key={item.key}
                style={s.row}
                activeScale={0.985}
                disabled={item.onPress === undefined}
                onPress={item.onPress}
              >
                <KindGlyph kind={item.kind} size={32} />
                <View style={s.mid}>
                  <RNText style={s.name} numberOfLines={1}>
                    {item.title}
                  </RNText>
                  <RNText style={s.sub} numberOfLines={1}>
                    {item.detail}
                  </RNText>
                </View>
                <RNText style={s.right}>{item.right}</RNText>
              </PressableScale>
            ))}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  title: {
    fontFamily: font.medium,
    fontSize: 16,
    letterSpacing: -0.32,
    color: color.ink,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: space.md,
  },
  list: { borderRadius: radius.lg, backgroundColor: color.tile, padding: space.xs, gap: 2 },
  skeleton: { marginVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 54,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  right: { fontFamily: font.medium, fontSize: 13, color: color.ink },
});
