import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text as RNText, View, type ImageSourcePropType } from "react-native";
import type { BasketTag, Basket } from "@mercury/types";
import { byWeight } from "@mercury/view";
import { useInstrumentsByTicker, type Instrument } from "../api";
import { StockLogo } from "../ui";
import { color, font, space } from "../theme";
import art_themes_1 from "../../assets/baskets/themes/1.webp";
import art_themes_2 from "../../assets/baskets/themes/2.webp";
import art_themes_3 from "../../assets/baskets/themes/3.webp";
import art_themes_4 from "../../assets/baskets/themes/4.webp";
import art_themes_5 from "../../assets/baskets/themes/5.webp";
import art_themes_6 from "../../assets/baskets/themes/6.webp";
import art_themes_7 from "../../assets/baskets/themes/7.webp";
import art_investors_3 from "../../assets/baskets/investors/3.webp";
import art_investors_4 from "../../assets/baskets/investors/4.webp";
import art_investors_1 from "../../assets/baskets/investors/1.webp";
import art_investors_2 from "../../assets/baskets/investors/2.webp";

/** The artwork the web's shelves use, bundled: a theme's scene, an investor's portrait. */
export const THEME_ART: Record<string, ImageSourcePropType> = {
  "theme:technology": art_themes_1,
  "theme:consumer": art_themes_2,
  "theme:hard-assets": art_themes_3,
  "theme:defense": art_themes_4,
  "theme:healthcare": art_themes_5,
  "theme:finance": art_themes_6,
  "theme:energy": art_themes_7,
} satisfies Partial<Record<BasketTag, ImageSourcePropType>>;

export const INVESTOR_ART: Record<string, ImageSourcePropType> = {
  "nancy-pelosi-tracker": art_investors_3,
  "warren-buffett-tracker": art_investors_4,
  "cathie-wood-tracker": art_investors_1,
  "leopold-aschenbrenner-tracker": art_investors_2,
};

/**
 * Logos and prices for the stocks a set of baskets holds, in one read. The
 * catalog names its holdings by ticker; our instruments carry the marks.
 */
export const useHoldingInstruments = (templates: readonly Basket[], perBasket = 5) => {
  const tickers = useMemo(
    () => [
      ...new Set(
        templates.flatMap((t) =>
          byWeight(t.allocations)
            .slice(0, perBasket)
            .map((a) => a.ticker),
        ),
      ),
    ],
    [templates, perBasket],
  );
  const read = useInstrumentsByTicker(tickers);
  return useMemo(
    () => new Map((read.data?.instruments ?? []).map((i) => [i.ticker, i])),
    [read.data],
  ) as ReadonlyMap<string, Instrument>;
};

/** The heaviest holdings, overlapped, with a count of the rest: the web's `Holdings`. */
export const AssetStack = ({
  template,
  instruments,
  limit = 4,
  size = 28,
}: {
  template: Basket;
  instruments: ReadonlyMap<string, Instrument>;
  limit?: number;
  size?: number;
}) => {
  const assets = byWeight(template.allocations);
  const rest = assets.length - limit;
  return (
    <View
      style={s.stack}
      accessibilityLabel={`Top holdings: ${assets
        .slice(0, limit)
        .map((a) => a.ticker)
        .join(", ")}`}
    >
      {assets.slice(0, limit).map((a, i) => (
        <View
          key={a.assetId}
          style={[s.ring, { zIndex: limit - i, marginLeft: i === 0 ? 0 : -size * 0.32, borderRadius: size }]}
        >
          <StockLogo ticker={a.ticker} size={size} uri={instruments.get(a.ticker)?.logoUrl ?? undefined} />
        </View>
      ))}
      {rest > 0 && (
        <View
          style={[
            s.ring,
            s.more,
            { width: size + 4, height: size + 4, borderRadius: size, marginLeft: -size * 0.32 },
          ]}
        >
          <RNText style={s.moreText}>+{rest}</RNText>
        </View>
      )}
    </View>
  );
};

/** A section's heading on the grey page, with an action at its right. */
export const SectionHead = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => (
  <View style={s.head}>
    <View style={s.headText}>
      <RNText style={s.headTitle}>{title}</RNText>
      {sub !== undefined && <RNText style={s.headSub}>{sub}</RNText>}
    </View>
    {action}
  </View>
);

/** A label and its value, in a card's grey panel. */
export const Fact = ({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) => (
  <View style={s.fact}>
    <RNText style={s.factKey}>{k}</RNText>
    {typeof v === "string" ? (
      <RNText style={[s.factValue, tone !== undefined && { color: tone }]} numberOfLines={2}>
        {v}
      </RNText>
    ) : (
      v
    )}
  </View>
);

const s = StyleSheet.create({
  stack: { flexDirection: "row", alignItems: "center" },
  ring: { borderWidth: 2, borderColor: color.surface, backgroundColor: color.surface },
  more: { alignItems: "center", justifyContent: "center", backgroundColor: color.tile },
  moreText: { fontFamily: font.medium, fontSize: 10.5, color: color.muted },
  head: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.screen,
  },
  headText: { flex: 1, gap: 3 },
  headTitle: { fontFamily: font.medium, fontSize: 18, letterSpacing: -0.36, color: color.ink },
  headSub: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: color.muted },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md },
  factKey: { fontFamily: font.regular, fontSize: 13.5, color: color.muted },
  factValue: {
    flexShrink: 1,
    textAlign: "right",
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.ink,
  },
});
