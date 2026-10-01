import type { ReactNode } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { usd } from "@mercury/view";
import { color, font, space } from "../theme";
import { Text } from "./Text";

export interface HeroBalanceProps {
  amount: number;
  label: string;
  /** Sits at the trailing edge of the label row — the day's move, a shimmer. */
  accessory?: ReactNode;
  masked?: boolean;
}

/**
 * The account's headline figure.
 *
 * The cents are set in the faint grey rather than the ink. Nobody reads a net
 * worth to two decimal places, but dropping them makes the figure jump by a
 * dollar as it rounds — so they stay, and recede. `usd` is the web header's own
 * formatter, so the two clients round identically rather than nearly so.
 */
export const HeroBalance = ({ amount, label, accessory, masked }: HeroBalanceProps) => {
  const text = usd(amount);
  const dot = text.lastIndexOf(".");
  const whole = dot === -1 ? text : text.slice(0, dot);
  const cents = dot === -1 ? "" : text.slice(dot);

  return (
    <View style={s.block}>
      <View style={s.labelRow}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        {accessory}
      </View>
      {masked === true ? (
        <RNText style={s.figure}>••••••</RNText>
      ) : (
        /* One line, shrinking to fit: a seven-figure account must not wrap the
           cents onto a second line, and must not be clipped either. */
        <RNText style={s.figure} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {whole}
          <RNText style={s.cents}>{cents}</RNText>
        </RNText>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  block: { gap: 6, paddingTop: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  figure: {
    fontFamily: font.medium,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -1.8,
    color: color.ink,
  },
  cents: { color: color.faint },
});

/** The day's move: a tinted percentage pill, then the dollars. */
export const MovePill = ({ pctText, usdText, up }: { pctText: string; usdText: string; up: boolean }) => (
  <View style={m.row}>
    <View style={[m.pill, up ? m.upTint : m.downTint]}>
      <RNText style={[m.pct, { color: up ? color.up : color.down }]}>{pctText}</RNText>
    </View>
    <RNText style={[m.usd, { color: up ? color.up : color.down }]}>{usdText}</RNText>
    <RNText style={m.today}>today</RNText>
  </View>
);

const m = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm },
  pill: { height: 24, paddingHorizontal: 9, justifyContent: "center", borderRadius: 7 },
  upTint: { backgroundColor: color.upChip },
  downTint: { backgroundColor: color.downChip },
  pct: { fontFamily: font.medium, fontSize: 12.5, letterSpacing: -0.2 },
  usd: { fontFamily: font.medium, fontSize: 12.5, letterSpacing: -0.2 },
  today: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.2, color: color.muted },
});
