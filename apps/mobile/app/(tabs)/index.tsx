import { StyleSheet, Text, View } from "react-native";
import { usd, usdSigned, pct } from "@mercury/view";
import { Card, Screen } from "../../src/Screen";
import { c, t } from "../../src/tokens";

/*
 * Figures are hard-coded for now and formatted by `@mercury/view` — the same
 * `usd` the web header calls. That is the thing worth proving on day one: the
 * shared package is consumable from React Native, so the two clients will round
 * and sign money identically rather than nearly identically.
 */
const NET_WORTH = 8073.11;
const TODAY = 39.32;
const TODAY_PCT = 0.32;

export default function Portfolio() {
  return (
    <Screen title="Portfolio">
      <Card>
        <Text style={s.label}>Net worth</Text>
        <Text style={s.hero}>{usd(NET_WORTH)}</Text>
        <View style={s.row}>
          <Text style={[s.move, { color: TODAY >= 0 ? c.up : c.down }]}>{usdSigned(TODAY)}</Text>
          <Text style={s.muted}>{pct(TODAY_PCT)} today</Text>
        </View>
      </Card>
      <Card>
        <Text style={s.label}>Next</Text>
        <Text style={s.muted}>
          Holdings, the chart and the issuer comparison. This screen reads from the API once Privy signs in on
          a device.
        </Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: t.label, fontWeight: "500", color: c.ink },
  hero: { marginTop: 8, fontSize: t.hero, fontWeight: "600", color: c.ink, letterSpacing: -0.8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  move: { fontSize: t.body, fontWeight: "500" },
  muted: { fontSize: t.body, color: c.muted, lineHeight: 21 },
});
