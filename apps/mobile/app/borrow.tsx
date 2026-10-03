import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { pct, usd } from "@mercury/view";
import { useBorrow, useMoney, type Borrow } from "../src/api";
import {
  AmountWell,
  Button,
  Chip,
  IconButton,
  Note,
  Segmented,
  Skeleton,
  StatusChip,
  Text,
  useBottomGap,
} from "../src/ui";
import { color, font, radius, space } from "../src/theme";

type Tab = "borrow" | "repay" | "pledge" | "withdraw";

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "borrow", label: "Borrow" },
  { key: "repay", label: "Repay" },
  { key: "pledge", label: "Add" },
  { key: "withdraw", label: "Withdraw" },
];

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/** The web's words for each state of a loan. */
const HEALTH: Record<Borrow["health"], { tone: "up" | "warn" | "down"; label: string }> = {
  healthy: { tone: "up", label: "Healthy" },
  over_limit: { tone: "warn", label: "Over target" },
  margin_call: { tone: "down", label: "Repay soon" },
  liquidation: { tone: "down", label: "Being sold" },
};

/**
 * Borrowing against your stocks, as the web's borrow panel lays it out: where
 * the loan stands, then the four things you can do — borrow, repay, add
 * collateral, take collateral back — each an amount and what it changes.
 *
 * The figures are real, read from Kamino through our API. The actions are not
 * connected on the phone yet: the transaction path behind them is the next
 * piece of work, so the button says so rather than pretending to submit.
 */
export default function BorrowScreen() {
  const router = useRouter();
  const bottom = useBottomGap();
  const borrow = useBorrow();
  const cash = num(useMoney().data?.balanceUsd);
  const b = borrow.data;
  const [tab, setTab] = useState<Tab>("borrow");
  const [text, setText] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const amount = Number(text) || 0;
  const debt = num(b?.debtUsd);
  const rows = useMemo(() => (b?.collateral ?? []).filter((r) => r.isStock), [b]);
  const pledgeable = rows.filter((r) => num(r.depositableUsd) > 0);
  const pledged = rows.filter((r) => num(r.depositedUsd) > 0);
  const picks = tab === "pledge" ? pledgeable : tab === "withdraw" ? pledged : [];
  const chosen = picks.find((r) => r.ticker === ticker) ?? picks[0];

  const max =
    tab === "borrow"
      ? num(b?.borrowableUsd)
      : tab === "repay"
        ? Math.min(debt, cash)
        : tab === "pledge"
          ? num(chosen?.depositableUsd)
          : num(chosen?.depositedUsd);

  const note =
    tab === "borrow"
      ? `Up to ${usd(num(b?.borrowableUsd))} at our safety target${b?.borrowApy !== undefined ? ` · about ${pct(num(b.borrowApy) * 100, 1)} a year` : ""}`
      : tab === "repay"
        ? `${usd(debt)} owed · ${usd(cash)} cash to repay from`
        : chosen === undefined
          ? tab === "pledge"
            ? "You have no stock Kamino accepts yet."
            : "Nothing is pledged yet."
          : tab === "pledge"
            ? `${usd(num(chosen.depositableUsd))} of ${chosen.ticker} you could pledge`
            : `${usd(num(chosen.depositedUsd))} of ${chosen.ticker} pledged`;

  const verb = { borrow: "Borrow", repay: "Repay", pledge: "Pledge", withdraw: "Withdraw" }[tab];
  const health = b ? HEALTH[b.health] : undefined;

  const pick = (next: Tab) => {
    setTab(next);
    setText("");
    setTicker(null);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.head}>
              <Text variant="title">Borrow</Text>
              <RNText style={s.lede}>
                Cash against your stocks, without selling them. Repay whenever you like.
              </RNText>
            </View>

            {/* Where the loan stands */}
            <View style={s.card}>
              <View style={s.cardHead}>
                <RNText style={s.label}>Your loan</RNText>
                {debt > 0 && health !== undefined && (
                  <StatusChip tone={health.tone} size="md">
                    {health.label}
                  </StatusChip>
                )}
              </View>
              <View style={s.panel}>
                {borrow.isPending ? (
                  <View style={s.gap}>
                    <Skeleton width="60%" height={16} />
                    <Skeleton width="40%" height={16} />
                  </View>
                ) : b === undefined ? (
                  <RNText style={s.muted}>Could not reach Kamino. Your shares are not affected.</RNText>
                ) : (
                  <View style={s.figures}>
                    <Figure label="Borrowed" value={usd(debt)} />
                    <Figure label="Can still borrow" value={usd(num(b.borrowableUsd))} />
                    <Figure label="Pledged" value={usd(num(b.collateralUsd))} />
                    <Figure
                      label="Safe until"
                      value={b.safeUntilDrop === null ? "—" : `a ${pct(b.safeUntilDrop * 100, 0)} fall`}
                    />
                  </View>
                )}
              </View>
            </View>

            {/* What to do */}
            <View style={[s.card, s.action]}>
              <Segmented options={TABS} value={tab} onChange={pick} fill />

              {picks.length > 0 && (
                <View style={s.chips}>
                  {picks.map((r) => (
                    <Chip
                      key={r.ticker}
                      label={r.ticker}
                      selected={chosen?.ticker === r.ticker}
                      onPress={() => setTicker(r.ticker)}
                    />
                  ))}
                </View>
              )}

              <AmountWell
                label={
                  tab === "pledge" || tab === "withdraw"
                    ? `${chosen?.ticker ?? "Stock"} to ${tab === "pledge" ? "pledge" : "withdraw"}`
                    : `Amount to ${verb.toLowerCase()}`
                }
                value={text}
                onChange={setText}
                unit={tab === "pledge" || tab === "withdraw" ? "USD" : "USDC"}
                max={max > 0 ? max : undefined}
                note={note}
                invalid={amount > max && amount > 0}
              />

              {tab === "borrow" && (
                <View style={s.panel}>
                  <Line k="Paid into" v="Your cash, in USDC" />
                  <Line k="Owed after" v={usd(debt + amount)} />
                  <Line k="Held as collateral" v="Your pledged stocks stay yours" />
                </View>
              )}
              {tab === "repay" && (
                <View style={s.panel}>
                  <Line k="Owed after" v={usd(Math.max(0, debt - amount))} />
                  <Line k="Cash after" v={usd(Math.max(0, cash - amount))} />
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: bottom }]}>
            <Note tone="warn">
              Borrowing from the phone is not connected yet; the backend for it comes next. It already works
              in the web app.
            </Note>
            <Button label={amount > 0 ? `${verb} ${usd(amount)}` : verb} disabled />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const Figure = ({ label, value }: { label: string; value: string }) => (
  <View style={s.fig}>
    <RNText style={s.figLabel}>{label}</RNText>
    <RNText style={s.figValue} numberOfLines={1}>
      {value}
    </RNText>
  </View>
);

const Line = ({ k, v }: { k: string; v: string }) => (
  <View style={s.line}>
    <RNText style={s.lineKey}>{k}</RNText>
    <RNText style={s.lineVal}>{v}</RNText>
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.lg, gap: space.md },
  head: { paddingHorizontal: space.screen, gap: 4 },
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.md },
  gap: { gap: 8 },
  muted: { fontFamily: font.regular, fontSize: 13, color: color.muted },
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: space.md },
  fig: { width: "50%", gap: 4, paddingRight: space.sm },
  figLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  figValue: { fontFamily: font.medium, fontSize: 18, letterSpacing: -0.36, color: color.ink },
  action: { padding: space.md, gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  lineKey: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  lineVal: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "right", flexShrink: 1 },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    gap: space.md,
    backgroundColor: color.page,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
});
