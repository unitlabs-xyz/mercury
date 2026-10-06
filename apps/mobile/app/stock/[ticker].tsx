import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { count, pct, usd, usdCompact, usdSigned } from "@mercury/view";
import {
  Button,
  Chip,
  DotChart,
  Icon,
  IconButton,
  MoveChip,
  Skeleton,
  StockLogo,
  Text,
  useBottomGap,
} from "../../src/ui";
import {
  SPANS,
  useExposure,
  useInstrument,
  useInstrumentHistory,
  usePortfolio,
  type Span,
  type Wrapper,
} from "../../src/api";
import { ExposureCard } from "../../src/stock/ExposureCard";
import { color, font, radius, space } from "../../src/theme";

/** The web's own words for each range, so the line under the figure reads. */
const SINCE: Record<Span, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "6M": "past six months",
  "1Y": "past year",
  "5Y": "past five years",
};

const ISSUER: Record<Wrapper["issuer"], string> = { backed: "Backed", ondo: "Ondo" };

export default function Stock() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const t = (ticker ?? "").toUpperCase();
  const router = useRouter();
  const [span, setSpan] = useState<Span>("1M");
  const bottom = useBottomGap();

  const page = useInstrument(t);
  const history = useInstrumentHistory(t, span);
  const portfolio = usePortfolio();

  const i = page.data?.instrument;
  const held = (portfolio.data?.holdings ?? []).find((h) => h.ticker === t);
  const exposure = useExposure(t, held !== undefined);

  const points = history.data?.points ?? [];
  const values = points.map(([, p]) => Number(p));
  const first = values[0];
  const last = values[values.length - 1];
  /* Over a day the live 24h move is the better number: it is what the price
     beside it is quoted against, and tokenised stocks trade around the clock
     while a session does not. */
  const movePct =
    span === "1D"
      ? i === undefined
        ? null
        : Number(i.changePct24h)
      : history.data === undefined
        ? null
        : Number(history.data.changePct);
  const moveUsd = first === undefined || last === undefined ? null : last - first;

  const order = (side: "buy" | "sell") =>
    i !== undefined &&
    router.push({
      pathname: "/buy",
      params: { ticker: t, name: i.name, side, ...(i.logoUrl ? { logoUrl: i.logoUrl } : {}) },
    });

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
          {i !== undefined && (
            <RNText style={s.navTitle} numberOfLines={1}>
              {i.name}
            </RNText>
          )}
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* ── Price and its chart ─────────────────────────────────────── */}
          <View style={s.card}>
            <View style={s.head}>
              <StockLogo ticker={t} uri={i?.logoUrl ?? undefined} size={48} />
              <View style={s.headText}>
                <View style={s.nameRow}>
                  <RNText style={s.name} numberOfLines={1}>
                    {i?.name ?? t}
                  </RNText>
                  {held !== undefined && (
                    <View style={s.ownedChip}>
                      <RNText style={s.ownedLabel}>Owned</RNText>
                    </View>
                  )}
                </View>
                <RNText style={s.sub} numberOfLines={1}>
                  {t}
                  {i?.sector == null ? "" : ` · ${i.sector}`}
                </RNText>
              </View>
            </View>

            {i === undefined ? (
              <View style={s.priceSkeleton}>
                <Skeleton width={170} height={34} />
                <Skeleton width={190} height={14} />
              </View>
            ) : (
              <View style={s.priceBlock}>
                <RNText style={s.price}>{usd(i.pricePerShare)}</RNText>
                <View style={s.moveRow}>
                  <MoveChip value={movePct} />
                  {moveUsd !== null && (
                    <RNText style={[s.moveUsd, { color: moveUsd >= 0 ? color.up : color.fall }]}>
                      {usdSigned(moveUsd)}
                    </RNText>
                  )}
                  <RNText style={s.moveSince}>{SINCE[span]}</RNText>
                </View>
              </View>
            )}

            <View style={s.ranges}>
              {SPANS.map((sp) => (
                <Chip key={sp} label={sp} selected={span === sp} onPress={() => setSpan(sp)} />
              ))}
            </View>

            {values.length > 1 ? <DotChart values={values} /> : <Skeleton width="100%" height={200} />}
          </View>

          {/* Only when the market is shut. Open is the ordinary case and needs
              no notice: a banner that is always there is furniture, and the one
              time it carries news it reads as furniture too. */}
          {i?.status !== undefined && i.status !== "open" && (
            <View style={s.notice}>
              <Icon name="clock" size={15} color={color.muted} style={s.noticeIcon} />
              <View style={s.fill}>
                <Text variant="label">US markets are closed.</Text>
                <Text variant="small" tone="muted" style={s.noticeBody}>
                  You can still place your order. We'll check the latest market price before processing it and
                  let you know if there's a significant difference.
                </Text>
              </View>
            </View>
          )}

          {/* ── The figures behind the price ────────────────────────────── */}
          {page.data !== undefined && i !== undefined && (
            <View style={s.card}>
              <RNText style={s.sectionTitle}>Key figures</RNText>
              <View style={s.stats}>
                <Stat label="24h volume" value={usdCompact(i.volume24hUsd)} />
                <Stat label="Holders" value={count(i.holders)} />
                <Stat label="Largest order" value={usdCompact(i.maxOrderUsd)} />
                <Stat
                  label="Past year"
                  value={`${pct(page.data.returns.y1, 1)}`}
                  tone={Number(page.data.returns.y1) >= 0 ? "up" : "down"}
                />
              </View>
            </View>
          )}

          {/* ── What you hold of it, across every token ─────────────────── */}
          {held !== undefined && (
            <ExposureCard name={i?.name ?? t} exposure={exposure.data} loading={exposure.isPending} />
          )}

          {/* ── Where an order goes ─────────────────────────────────────── */}
          {i !== undefined && i.wrappers.length > 0 && (
            <View style={s.card}>
              <RNText style={s.sectionTitle}>Where your order goes</RNText>
              <Text variant="small" tone="muted" style={s.sectionNote}>
                The same share, issued as more than one token. We route to whichever fills your order best at
                the moment you place it.
              </Text>
              {i.wrappers.map((w) => (
                <View key={w.mint} style={s.wrapper}>
                  <StockLogo ticker={t} uri={w.icon ?? undefined} size={30} />
                  <View style={s.fill}>
                    <RNText style={s.wrapperName}>{ISSUER[w.issuer]}</RNText>
                    <RNText style={s.wrapperSub}>
                      {w.symbol} · {usdCompact(w.liquidityUsd)} liquidity
                    </RNText>
                  </View>
                  {w.isRoutable ? (
                    <View style={s.routable}>
                      <Icon name="check" size={11} color={color.actBuy} strokeWidth={3} />
                      <RNText style={s.routableLabel}>Routable</RNText>
                    </View>
                  ) : (
                    <RNText style={s.notRoutable}>Not routable</RNText>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── What the company is ─────────────────────────────────────── */}
          {i?.description != null && i.description !== "" && (
            <View style={s.card}>
              <RNText style={s.sectionTitle}>About {i.name}</RNText>
              <Text variant="body" tone="muted" style={s.about}>
                {i.description}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: bottom }]}>
          {/* Selling sits beside buying once there is something to sell, the
              lesser of the two: a position is held more often than it is left. */}
          <View style={s.actions}>
            {held !== undefined && (
              <View style={s.fill}>
                <Button
                  label="Sell"
                  variant="secondary"
                  disabled={i === undefined}
                  onPress={() => i !== undefined && order("sell")}
                />
              </View>
            )}
            <View style={s.fill}>
              <Button
                label={held === undefined ? "Buy" : "Buy more"}
                disabled={i === undefined}
                onPress={() => i !== undefined && order("buy")}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) => (
  <View style={s.stat}>
    <RNText style={s.statLabel}>{label}</RNText>
    <RNText
      style={[s.statValue, tone === "up" && { color: color.up }, tone === "down" && { color: color.fall }]}
    >
      {value}
    </RNText>
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1 },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  flip: { transform: [{ rotate: "180deg" }] },
  navTitle: { flex: 1, fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },

  /* Clears the footer's pinned action. */
  scroll: { paddingHorizontal: space.screen, paddingBottom: 110, gap: space.md },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.screen },

  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  headText: { flex: 1, gap: 7 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, fontFamily: font.medium, fontSize: 20, letterSpacing: -0.4, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 13.5, letterSpacing: -0.14, color: color.muted },
  ownedChip: {
    height: 19,
    paddingHorizontal: 7,
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: color.actBuyTint,
  },
  ownedLabel: { fontFamily: font.medium, fontSize: 10.5, letterSpacing: 0.1, color: color.actBuy },

  priceBlock: { marginTop: 18, gap: 10 },
  priceSkeleton: { marginTop: 18, gap: 10 },
  price: { fontFamily: font.medium, fontSize: 36, letterSpacing: -1, color: color.ink },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  moveUsd: { fontFamily: font.medium, fontSize: 12.5, letterSpacing: -0.2 },
  moveSince: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.2, color: color.muted },

  /* Inset by the chip's own padding, so "1D" sits on the card's own edge. */
  ranges: { flexDirection: "row", gap: 2, marginTop: 14, marginLeft: -13 },

  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
  },
  noticeIcon: { marginTop: 2 },
  noticeBody: { marginTop: 4, lineHeight: 18 },

  sectionTitle: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3, color: color.ink },
  sectionNote: { marginTop: 6, lineHeight: 18 },

  stats: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  stat: { width: "50%", paddingVertical: 7, gap: 4 },
  statLabel: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.12, color: color.muted },
  statValue: { fontFamily: font.medium, fontSize: 17, letterSpacing: -0.34, color: color.ink },

  wrapper: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  wrapperName: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  wrapperSub: {
    fontFamily: font.regular,
    fontSize: 12,
    letterSpacing: -0.12,
    color: color.muted,
    marginTop: 3,
  },
  routable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: radius.sm - 2,
    backgroundColor: color.actBuyTint,
  },
  routableLabel: { fontFamily: font.medium, fontSize: 11, letterSpacing: -0.1, color: color.actBuy },
  notRoutable: { fontFamily: font.regular, fontSize: 11.5, letterSpacing: -0.1, color: color.muted },

  about: { marginTop: 8, lineHeight: 21 },

  actions: { flexDirection: "row", gap: space.sm },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: color.page,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
});
