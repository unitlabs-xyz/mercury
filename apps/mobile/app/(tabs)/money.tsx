import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { pct, usd } from "@mercury/view";
import { useBorrow, useMoney, useSignedIn, type Borrow } from "../../src/api";
import { useActions } from "../../src/actions/Actions";
import { Button, Note, Skeleton, StatusChip, Text } from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/**
 * Cash, set as the web's Money page sets it: a white card that leads with what
 * you can spend on shares, its yield and the verbs, with the figures that
 * follow from it in a grey panel underneath; then where borrowing stands.
 *
 * Borrowing is read here and acted on in the web app for now: the phone shows
 * the loan, its room and how far prices could fall, which is what someone
 * checks on a phone, and leaves pledging and repaying to the screen built for
 * it rather than offering buttons that do not lead anywhere.
 */
export default function Money() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openActions = useActions();
  const signedIn = useSignedIn();
  const money = useMoney();
  const borrow = useBorrow();
  const m = money.data;
  const apr = num(m?.yieldApr);
  const b = borrow.data;

  /* Only a pull shows the spinner; the background polls must not move the page. */
  const [pulling, setPulling] = useState(false);
  const refresh = () => {
    setPulling(true);
    void Promise.all([money.refetch(), borrow.refetch()]).finally(() => setPulling(false));
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} />}
      >
        <View style={s.head}>
          <Text variant="title">Money</Text>
          <RNText style={s.lede}>
            Your cash earns while it waits. Invest it, or borrow against your stocks.
          </RNText>
        </View>

        {/* Cash */}
        <View style={s.card}>
          <View style={s.cash}>
            <RNText style={s.label}>Available to invest</RNText>
            {m ? (
              <RNText style={s.figure} numberOfLines={1} adjustsFontSizeToFit>
                {usd(m.balanceUsd)}
              </RNText>
            ) : (
              <Skeleton width={180} height={36} style={s.figureSkeleton} />
            )}
            <View style={s.earning}>
              <StatusChip tone="up" size="md">{`Earning ${pct(apr * 100)}`}</StatusChip>
              <RNText style={s.earningNote}>paid into this balance</RNText>
            </View>
            <View style={s.verbs}>
              <View style={s.verb}>
                <Button size="md" label="Invest" onPress={() => router.navigate("/invest")} />
              </View>
              <View style={s.verb}>
                <Button
                  size="md"
                  variant="secondary"
                  icon="plus"
                  label="Add cash"
                  onPress={() => openActions("addCash")}
                />
              </View>
            </View>
          </View>

          <View style={s.panel}>
            <Figure
              label="Interest this year"
              value={m ? usd(m.interestEarnedYtdUsd) : "—"}
              sub="Paid into your cash"
              up={m !== undefined && num(m.interestEarnedYtdUsd) > 0}
            />
            <Figure label="Yield" value={pct(apr * 100)} sub="A year, variable" />
            <Figure
              label="Spendable"
              value={b ? usd(num(b.spendableUsd)) : "—"}
              sub={b ? `Cash + ${usd(num(b.borrowableUsd), 0)} borrowing` : "Cash and borrowing"}
            />
          </View>
        </View>

        {signedIn && <Borrowing borrow={b} loading={borrow.isPending} failed={borrow.isError} />}
      </ScrollView>
    </View>
  );
}

/** One figure in the grey panel: a label, the number, a line saying what it is. */
const Figure = ({ label, value, sub, up }: { label: string; value: string; sub: string; up?: boolean }) => (
  <View style={s.fig}>
    <RNText style={s.figLabel}>{label}</RNText>
    <RNText style={[s.figValue, up === true && { color: color.up }]} numberOfLines={1}>
      {value}
    </RNText>
    <RNText style={s.figSub} numberOfLines={1}>
      {sub}
    </RNText>
  </View>
);

/** The web's own words for each state of a loan. */
const HEALTH: Record<Borrow["health"], { tone: "up" | "warn" | "down"; label: string }> = {
  healthy: { tone: "up", label: "Healthy" },
  over_limit: { tone: "warn", label: "Over target" },
  margin_call: { tone: "down", label: "Repay soon" },
  liquidation: { tone: "down", label: "Being sold" },
};

/**
 * Where borrowing stands: what is owed, the room left, what is pledged and how
 * far prices could fall before Kamino sells. Read-only on the phone.
 */
const Borrowing = ({
  borrow,
  loading,
  failed,
}: {
  borrow: Borrow | undefined;
  loading: boolean;
  failed: boolean;
}) => {
  const router = useRouter();
  const debt = num(borrow?.debtUsd);
  const owes = debt > 0;
  const health = borrow ? HEALTH[borrow.health] : undefined;

  return (
    <View style={s.card}>
      <View style={s.borrowHead}>
        <RNText style={s.label}>Borrow against your stocks</RNText>
        {owes && health !== undefined && (
          <StatusChip tone={health.tone} size="md">
            {health.label}
          </StatusChip>
        )}
      </View>

      {loading ? (
        <View style={s.panel}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={14} />
        </View>
      ) : failed || borrow === undefined ? (
        <View style={s.panelText}>
          <RNText style={s.muted}>Could not reach Kamino. Your shares are not affected.</RNText>
        </View>
      ) : (
        <>
          <View style={s.panel}>
            <Figure label="Borrowed" value={usd(debt)} sub={owes ? "Owed in USDC" : "Nothing owed"} />
            <Figure
              label="Can still borrow"
              value={usd(num(borrow.borrowableUsd))}
              sub="At our safety target"
            />
            <Figure label="Pledged" value={usd(num(borrow.collateralUsd))} sub="Held as collateral" />
            {owes && borrow.safeUntilDrop !== null && (
              <Figure
                label="Safe until"
                value={`a ${pct(borrow.safeUntilDrop * 100, 0)} fall`}
                sub="Before Kamino sells"
              />
            )}
          </View>
          <View style={s.noteWrap}>
            {borrow.health === "margin_call" || borrow.health === "liquidation" ? (
              <Note tone="down">
                Your loan is close to its limit. Repay or add collateral in the web app now.
              </Note>
            ) : (
              <RNText style={s.muted}>
                See what you could borrow, and how a loan would change your account.
              </RNText>
            )}
            <View style={s.openBorrow}>
              <Button
                size="md"
                variant="secondary"
                label="Open borrowing"
                onPress={() => router.push("/borrow")}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  /* Clears the floating tab bar. */
  scroll: { paddingBottom: 116, gap: space.md },
  head: { paddingHorizontal: space.screen, gap: 4 },
  /* One line under the title saying what the page is for, on every tab. */
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  /* The web's card: white, a 12 corner, and a grey panel set 4 in from its edge. */
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  cash: { paddingHorizontal: space.screen, paddingTop: space.screen, paddingBottom: space.screen },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.28, color: color.ink },
  figure: {
    fontFamily: font.medium,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.1,
    color: color.ink,
    marginTop: 8,
  },
  figureSkeleton: { marginTop: 10 },
  earning: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.md },
  earningNote: { fontFamily: font.regular, fontSize: 12, color: color.ink, opacity: 0.8 },
  verbs: { flexDirection: "row", gap: space.sm, marginTop: space.screen },
  verb: { flex: 1 },
  panel: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: space.screen,
    borderRadius: radius.md,
    backgroundColor: color.tile,
    paddingHorizontal: space.screen,
    paddingVertical: space.screen,
  },
  panelText: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.screen },
  fig: { width: "50%", paddingRight: space.md, gap: 4 },
  figLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  figValue: { fontFamily: font.medium, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: color.ink },
  figSub: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  borrowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen - 4,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  openBorrow: { marginTop: space.md },
  noteWrap: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm },
  muted: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
});
