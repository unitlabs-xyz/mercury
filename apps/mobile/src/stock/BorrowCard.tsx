import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { pct, usd } from "@mercury/view";
import { useBorrow } from "../api";
import { Button, Text } from "../ui";
import { color, font, radius, space } from "../theme";

/**
 * What this stock is worth as collateral: the web stock page's "Borrow against
 * it" card. A holder sees what they could borrow now and how far it could fall;
 * someone who does not hold it sees what every $1,000 of it would lend. Opens
 * the borrow screen with this stock already chosen.
 */
export const BorrowCard = ({ ticker, name }: { ticker: string; name: string }) => {
  const router = useRouter();
  const borrow = useBorrow();
  const b = borrow.data;
  if (b === undefined) return null;

  const row = b.collateral.find((r) => r.isStock && r.ticker === ticker);
  if (row === undefined) {
    return (
      <View style={s.card}>
        <RNText style={s.title}>Borrow against it</RNText>
        <Text variant="small" tone="muted" style={s.note}>
          Kamino does not accept {name} as collateral, so you cannot borrow against it.
        </Text>
      </View>
    );
  }

  const target = row.ltv * b.safetyTarget;
  const holds = row.depositedTokens > 0 || row.depositableTokens > 0;
  const loan = 1000 * target;
  const tone =
    row.liquidationDistance === null
      ? color.ink
      : row.liquidationDistance < 0.1
        ? color.down
        : row.liquidationDistance < 0.2
          ? color.warn
          : color.up;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <RNText style={s.title}>Borrow against it</RNText>
        <RNText style={s.meta}>{pct(b.borrowApy * 100, 1)} a year</RNText>
      </View>
      <RNText style={s.figure}>{holds ? usd(row.borrowableUsd) : usd(loan, 0)}</RNText>
      <Text variant="small" tone="muted">
        {holds
          ? `You can borrow against your ${name}, without selling it`
          : `Loan against every $1,000 of ${name} you hold`}
      </Text>

      <View style={s.panel}>
        <Fact k="Lends up to" v={`${pct(target * 100, 1)}`} sub={`Kamino's max ${pct(row.ltv * 100, 0)}`} />
        <Fact k="Safe unless it falls" v={pct(row.cushionAtTarget * 100, 0)} />
        {holds && row.depositedTokens > 0 && <Fact k="Pledged" v={usd(row.depositedUsd)} />}
        {holds &&
          row.depositedTokens > 0 &&
          row.liquidationPrice !== null &&
          row.liquidationDistance !== null && (
            <Fact
              k="Sold if it reaches"
              v={usd(row.liquidationPrice)}
              sub={`${pct(row.liquidationDistance * 100, 0)} away`}
              tint={tone}
            />
          )}
        {!holds && <Fact k="Interest" v={`${usd(loan * b.borrowApy, 0)} a year`} sub="On the full loan" />}
      </View>

      {holds && row.borrowableUsd > 0.005 && (
        <View style={s.action}>
          <Button
            label={`Borrow against ${ticker}`}
            variant="secondary"
            onPress={() => router.push({ pathname: "/borrow", params: { ticker } })}
          />
        </View>
      )}
    </View>
  );
};

const Fact = ({ k, v, sub, tint }: { k: string; v: string; sub?: string; tint?: string }) => (
  <View style={s.fact}>
    <RNText style={s.factKey}>{k}</RNText>
    <RNText style={[s.factValue, tint !== undefined && { color: tint }]}>{v}</RNText>
    {sub !== undefined && <RNText style={s.factSub}>{sub}</RNText>}
  </View>
);

const s = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.screen },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  note: { marginTop: 6, lineHeight: 18 },
  figure: {
    fontFamily: font.medium,
    fontSize: 24,
    letterSpacing: -0.6,
    color: color.ink,
    marginTop: 12,
    marginBottom: 4,
  },
  panel: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: color.tile,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  fact: { width: "50%", paddingVertical: 8, gap: 3 },
  factKey: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.12, color: color.muted },
  factValue: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  factSub: { fontFamily: font.regular, fontSize: 11.5, color: color.muted },
  action: { marginTop: 14 },
});
