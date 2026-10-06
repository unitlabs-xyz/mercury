import { useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import type { HistoryRange } from "@mercury/types";
import { usePortfolioHistory } from "../api";
import { Chip, DotChart, Icon, Skeleton } from "../ui";
import { color, font, radius, space } from "../theme";

const RANGES: readonly HistoryRange[] = ["1D", "1W", "1M"];

/**
 * The account's value over a day, a week or a month: the web home's chart.
 *
 * Only recorded readings are drawn, as on the web. The server snapshots each
 * account hourly and withholds a lone reading, so a new account gets the empty
 * state rather than a line from one point. Appending the live total to close
 * the last hour was tried on the web and reverted: the two are read apart, and
 * where they disagree the line ends in a cliff.
 */
export const ValueChart = () => {
  const [range, setRange] = useState<HistoryRange>("1W");
  const history = usePortfolioHistory(range);
  const values = (history.data?.points ?? []).map((p) => Number(p.valueUsd));

  return (
    <View style={s.wrap}>
      {history.isPending ? (
        <Skeleton width="100%" height={160} />
      ) : values.length > 1 ? (
        <DotChart values={values} height={160} />
      ) : (
        <View style={s.empty} accessibilityRole="image" accessibilityLabel="Not enough history yet">
          <Icon name="clock" size={16} color={color.muted} />
          <RNText style={s.emptyTitle}>Not enough history yet</RNText>
          <RNText style={s.emptyBody}>
            We record your balance every hour. The chart appears once there are a couple of readings.
          </RNText>
        </View>
      )}
      <View style={s.ranges}>
        {RANGES.map((r) => (
          <Chip key={r} label={r} selected={range === r} onPress={() => setRange(r)} />
        ))}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: space.md, marginTop: space.sm },
  ranges: { flexDirection: "row", gap: 6 },
  empty: {
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  emptyBody: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: color.muted,
    textAlign: "center",
  },
});
