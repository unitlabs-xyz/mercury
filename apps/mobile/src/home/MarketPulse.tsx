import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { useInstruments, useMarketStatus, type MarketStatus } from "../api";
import { color, font, radius, space } from "../theme";
import { Icon, PressableScale, Skeleton, StockLogo } from "../ui";
import { Band, ON_BAND } from "./band";

/** "2h 14m", "38m", "3d 4h": the time to the next bell, said as short as it can be. */
const until = (iso: string | null, now: number): string | null => {
  if (iso === null) return null;
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/** The session, and the bell it is counting toward. */
const sessionLine = (s: MarketStatus, now: number): string => {
  if (s.isOpen) {
    const close = until(s.nextCloseAt, now);
    return close === null ? "Market open" : `Market open · closes in ${close}`;
  }
  const open = until(s.nextOpenAt, now);
  return open === null ? "Market closed" : `Market closed · opens in ${open}`;
};

/** Re-reads the clock once a minute, so the countdown moves without a refetch. */
const useNow = () => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/**
 * The band between the two home cards: where the market is today, and the
 * day's biggest movers, each a tap from its page.
 *
 * It replaces a row of buttons that repeated the + menu. This is the part of
 * the screen that changes every time it is opened, which is a better use of
 * the middle of it than four verbs that never do.
 *
 * The band bleeds up and down under the cards' corners, as the strip it
 * replaces did, so their rounded corners show ink behind them.
 */
export const MarketPulse = () => {
  const router = useRouter();
  const now = useNow();
  const status = useMarketStatus();
  const movers = useInstruments("movers", "");
  const list = movers.data?.instruments.slice(0, 8) ?? [];
  const loading = movers.isPending && movers.data === undefined;

  return (
    <Band id="pulse">
      <View style={s.head}>
        <View style={s.session}>
          <View style={[s.dot, status.data?.isOpen === true && s.live]} />
          {status.data === undefined ? (
            <Skeleton dark width={170} height={12} />
          ) : (
            <RNText style={s.sessionText}>{sessionLine(status.data, now)}</RNText>
          )}
        </View>
        <PressableScale onPress={() => router.navigate("/invest")} haptic={false} style={s.all}>
          <RNText style={s.allText}>Movers</RNText>
          <Icon name="chevronRight" size={12} color={MUTED} />
        </PressableScale>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} dark width={112} height={44} style={s.chipSkeleton} />
            ))
          : list.map((i) => {
              const pct = Number(i.changePct24h);
              const up = pct > -0.005;
              return (
                <PressableScale
                  key={i.ticker}
                  onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: i.ticker } })}
                  activeScale={0.95}
                  style={s.chip}
                  accessibilityRole="button"
                  accessibilityLabel={`${i.name}, ${up ? "up" : "down"} ${Math.abs(pct).toFixed(2)} percent`}
                >
                  <StockLogo ticker={i.ticker} uri={i.logoUrl ?? undefined} size={26} />
                  <View>
                    <RNText style={s.ticker}>{i.ticker}</RNText>
                    <RNText style={[s.pct, { color: up ? UP : DOWN }]}>
                      {`${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`}
                    </RNText>
                  </View>
                </PressableScale>
              );
            })}
      </ScrollView>
    </Band>
  );
};

const UP = ON_BAND.up;
const DOWN = ON_BAND.down;
const MUTED = ON_BAND.muted;

const s = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
  },
  session: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: MUTED },
  live: { backgroundColor: UP },
  sessionText: { fontFamily: font.medium, fontSize: 13, letterSpacing: -0.2, color: color.onBand },
  all: { flexDirection: "row", alignItems: "center", gap: 4 },
  allText: { fontFamily: font.medium, fontSize: 13, color: MUTED },
  chips: { gap: space.sm, paddingHorizontal: space.screen },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 44,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipSkeleton: { borderRadius: radius.pill },
  ticker: { fontFamily: font.medium, fontSize: 13, lineHeight: 16, color: color.onBand },
  pct: { fontFamily: font.medium, fontSize: 12, lineHeight: 15 },
});
