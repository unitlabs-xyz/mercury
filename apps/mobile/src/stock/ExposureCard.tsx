import { StyleSheet, Text as RNText, View } from "react-native";
import { usd } from "@mercury/view";
import type { Exposure } from "../api";
import { Note, Skeleton, StatusChip } from "../ui";
import { color, font, radius, space } from "../theme";

const ISSUER = { backed: "Backed", ondo: "Ondo" } as const;
const SHADE = { backed: color.brand, ondo: "#62AEA9" } as const;

const n = (v: string) => Number(v);
/** Shares to four places, trimmed: fractional shares are the point, trailing zeros are not. */
const shares = (v: string | number) => Number(Number(v).toFixed(4)).toString();

/**
 * Your true exposure to one company.
 *
 * You can hold the same share through more than one token. Each token carries
 * its own multiplier — how many real shares one token is worth, which grows as
 * dividends are paid in — so tokens cannot simply be added up. This shows the
 * real share count summed across them, the split by issuer, and a warning when
 * too much of it sits with one issuer. No broker has this screen, because no
 * broker has this problem.
 */
export const ExposureCard = ({
  name,
  exposure,
  loading,
}: {
  name: string;
  exposure: Exposure | undefined;
  loading: boolean;
}) => (
  <View style={s.card}>
    <View style={s.head}>
      <RNText style={s.title}>Your exposure</RNText>
      {exposure !== undefined && exposure.wrappers.length > 1 && (
        <StatusChip size="md">{`${exposure.wrappers.length} issuers`}</StatusChip>
      )}
    </View>

    {loading || exposure === undefined ? (
      <View style={s.panel}>
        <Skeleton width="55%" height={22} />
        <Skeleton width="100%" height={8} />
        <Skeleton width="70%" height={14} />
      </View>
    ) : (
      <>
        <View style={s.panel}>
          <View style={s.totals}>
            <View>
              <RNText style={s.big}>{`${shares(exposure.shares)} shares`}</RNText>
              <RNText style={s.sub}>{`of ${name}, across every token you hold`}</RNText>
            </View>
            <RNText style={s.value}>{usd(n(exposure.valueUsd))}</RNText>
          </View>

          {/* One bar, split by issuer, so the balance between them reads at a glance. */}
          <View style={s.bar}>
            {exposure.wrappers.map((w) => (
              <View
                key={w.mint}
                style={{ flex: Math.max(n(w.sharePct), 0.5), backgroundColor: SHADE[w.issuer] }}
              />
            ))}
          </View>

          {exposure.wrappers.map((w) => (
            <View key={w.mint} style={s.row}>
              <View style={[s.dot, { backgroundColor: SHADE[w.issuer] }]} />
              <View style={s.fill}>
                <RNText style={s.rowTitle}>{`${ISSUER[w.issuer]} · ${w.symbol}`}</RNText>
                <RNText style={s.rowSub}>
                  {`${shares(w.tokenQty)} tokens × ${shares(w.multiplier)} = ${shares(w.shares)} shares`}
                </RNText>
              </View>
              <View style={s.end}>
                <RNText style={s.rowTitle}>{`${Math.round(n(w.sharePct))}%`}</RNText>
                <RNText style={s.rowSub}>{usd(n(w.valueUsd))}</RNText>
              </View>
            </View>
          ))}
        </View>

        {exposure.warnings.map((w) => (
          <View key={w.code + w.issuer} style={s.note}>
            <Note tone="warn">{w.message}</Note>
          </View>
        ))}

        {exposure.wrappers.some((w) => n(w.multiplier) !== 1) && (
          <RNText style={s.foot}>
            A token&apos;s multiplier grows as dividends are paid in, so your share count rises by itself.
          </RNText>
        )}
      </>
    )}
  </View>
);

const s = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: color.surface, padding: space.xs },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  title: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.md },
  totals: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md },
  big: { fontFamily: font.medium, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 3 },
  value: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fill: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  rowSub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 2 },
  end: { alignItems: "flex-end" },
  note: { marginTop: space.xs },
  foot: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: color.muted,
    padding: space.md,
    paddingBottom: space.sm,
  },
});
