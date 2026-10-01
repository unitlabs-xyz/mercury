import { StyleSheet, View } from "react-native";
import { usd, usdSigned, pct } from "@mercury/view";
import { Card, Screen, Text } from "../../src/ui";
import { color, space } from "../../src/theme";

/*
 * Figures are still fixed. The shape is what matters here: `usd`, `usdSigned`
 * and `pct` are the same functions the web header calls, so when this reads
 * from `GET /v1/portfolio` the two clients will already round and sign money
 * identically rather than nearly so.
 */
const NET_WORTH = 8073.11;
const TODAY = 39.32;
const TODAY_PCT = 0.32;
const STOCKS = 6038.38;
const CASH = 4534.73;
const DEBT = 2500;

export default function Portfolio() {
  const up = TODAY >= 0;
  return (
    <Screen title="Portfolio">
      <Card>
        <Text variant="label">Net worth</Text>
        <Text variant="hero" style={s.hero}>
          {usd(NET_WORTH)}
        </Text>
        <View style={s.move}>
          <Text variant="body" tone={up ? "up" : "down"}>
            {usdSigned(TODAY)}
          </Text>
          <Text variant="body" tone="muted">
            {pct(TODAY_PCT)} today
          </Text>
        </View>
      </Card>

      <Card>
        <Figure label="Invested" value={usd(STOCKS)} note="5 positions" />
        <Rule />
        <Figure label="Cash" value={usd(CASH)} note="Earning 4.1% a year" />
        <Rule />
        {/* Borrowed is shown as what it is: money you hold and money you owe. */}
        <Figure label="Borrowed" value={`−${usd(DEBT)}`} note="Safe unless your shares fall 68%" />
      </Card>
    </Screen>
  );
}

const Figure = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <View style={s.figure}>
    <Text variant="label" tone="muted">
      {label}
    </Text>
    <Text variant="figure" style={s.value}>
      {value}
    </Text>
    <Text variant="small" tone="muted">
      {note}
    </Text>
  </View>
);

const Rule = () => <View style={s.rule} />;

const s = StyleSheet.create({
  hero: { marginTop: space.sm },
  move: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  figure: { gap: 2 },
  value: { marginTop: 2 },
  rule: { height: 1, backgroundColor: color.divider, marginVertical: space.md },
});
