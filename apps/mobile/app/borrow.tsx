import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { borrowChoices, pct, pickRow, planBorrow, usd, type BorrowTab } from "@mercury/view";
import { useBorrow, useBorrowAction, type Borrow } from "../src/api";
import { Haptics } from "../src/haptics";
import {
  AmountWell,
  Button,
  Chip,
  Icon,
  IconButton,
  Note,
  Segmented,
  Skeleton,
  StatusChip,
  Text,
  useBottomGap,
} from "../src/ui";
import { color, font, radius, space } from "../src/theme";

type Tab = BorrowTab;

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "borrow", label: "Borrow" },
  { key: "repay", label: "Repay" },
  { key: "pledge", label: "Add" },
  { key: "withdraw", label: "Withdraw" },
];

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
 * The figures are read from Kamino through our API, and what each action may
 * do is the web's own arithmetic, from `@mercury/view`. The server checks it
 * again, builds the transactions, and pays the network fee; the phone signs.
 */
export default function BorrowScreen() {
  const router = useRouter();
  const bottom = useBottomGap();
  const borrow = useBorrow();
  const action = useBorrowAction();
  const b = borrow.data;
  const [tab, setTab] = useState<Tab>("borrow");
  const [text, setText] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);
  /* Max, held as the exact figure rather than the rounded one on screen. */
  const [atMax, setAtMax] = useState(false);

  const debt = b?.debtUsd ?? 0;
  const cash = b?.cashUsd ?? 0;
  /* Borrowing chooses which stock to pledge only when there is a choice to make. */
  const picks = borrowChoices(b, tab);
  const chosen = tab === "repay" ? undefined : pickRow(picks, ticker);
  /* The most does not depend on the amount, so it can be read before it. */
  const most = planBorrow(b, tab, chosen, 0).max;
  const value = atMax ? most : Number(text) || 0;
  const plan = planBorrow(b, tab, chosen, value);
  const unit = plan.inTokens ? `${chosen?.ticker ?? ""}x` : "USDC";

  const note =
    tab === "borrow"
      ? b === undefined
        ? undefined
        : `Up to ${usd(plan.max)} at our safety target · about ${pct(b.borrowApy * 100, 1)} a year`
      : tab === "repay"
        ? `${usd(debt)} owed · ${usd(cash)} cash to repay from`
        : chosen === undefined
          ? tab === "pledge"
            ? "You have no stock Kamino accepts free in your wallet."
            : "Nothing is pledged yet."
          : tab === "pledge"
            ? `${chosen.depositableTokens.toFixed(4)} ${chosen.ticker}x free · ${usd(chosen.depositableUsd)}`
            : `${chosen.depositedTokens.toFixed(4)} ${chosen.ticker}x pledged · up to ${plan.max.toFixed(4)} can come back`;

  const verb = { borrow: "Borrow", repay: "Repay", pledge: "Pledge", withdraw: "Withdraw" }[tab];
  const health = b ? HEALTH[b.health] : undefined;
  const busy = action.isPending;
  const canSubmit =
    plan.intent !== null && value > 0 && plan.blocked === null && !plan.paused && !busy && action.walletReady;

  const pick = (next: Tab) => {
    setTab(next);
    setText("");
    setAtMax(false);
    setTicker(null);
    action.reset();
  };

  const submit = () => {
    if (plan.intent === null) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.mutate(plan.intent, {
      onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  };

  const label = !action.walletReady
    ? "Getting your wallet ready"
    : value > 0 && !plan.inTokens
      ? `${verb} ${usd(value)}`
      : value > 0
        ? `${verb} ${value.toFixed(4)} ${unit}`
        : verb;

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
                    <Figure label="Can still borrow" value={usd(b.borrowableUsd)} />
                    <Figure label="Pledged" value={usd(b.collateralUsd)} />
                    <Figure
                      label="Safe until"
                      value={b.safeUntilDrop === null ? "—" : `a ${pct(b.safeUntilDrop * 100, 0)} fall`}
                    />
                  </View>
                )}
              </View>
            </View>

            {/* What to do */}
            {action.isSuccess ? (
              <View style={[s.card, s.action, s.done]}>
                <View style={s.doneMark}>
                  <Icon name="check" size={20} color={color.up} strokeWidth={2.4} />
                </View>
                <RNText style={s.doneTitle}>Done</RNText>
                <RNText style={s.muted}>Confirmed on chain. Your position is updating.</RNText>
              </View>
            ) : (
              <View style={[s.card, s.action]}>
                <Segmented options={TABS} value={tab} onChange={pick} fill />

                {plan.paused && b !== undefined ? (
                  <Note tone="warn">
                    {`${tab === "borrow" ? "Borrowing" : "Withdrawals"} paused until the loan is back inside the limit. Prices fell, so your loan is past the 80% limit. Repay ${usd(b.overTargetUsd)}, or pledge more stock, to unlock both.`}
                  </Note>
                ) : (
                  <>
                    {tab !== "repay" && picks.length > 1 && (
                      <View style={s.chips}>
                        {picks.map((r) => (
                          <Chip
                            key={r.ticker}
                            label={r.ticker}
                            selected={chosen?.ticker === r.ticker}
                            onPress={() => {
                              setTicker(r.ticker);
                              setText("");
                              setAtMax(false);
                            }}
                          />
                        ))}
                      </View>
                    )}

                    <AmountWell
                      label={
                        plan.inTokens
                          ? `${chosen?.ticker ?? "Stock"} to ${tab === "pledge" ? "pledge" : "take back"}`
                          : `Amount to ${verb.toLowerCase()}`
                      }
                      value={text}
                      onChange={(next) => {
                        setAtMax(false);
                        setText(next);
                      }}
                      unit={unit}
                      tokens={plan.inTokens}
                      note={note}
                      invalid={plan.blocked !== null && value > 0}
                    />

                    {plan.max > 0 && (
                      <View style={s.chips}>
                        {plan.presets.map((p) => {
                          const isMax = p.v === plan.max && plan.inTokens;
                          const v = presetText(p.v, tab, plan.inTokens);
                          return (
                            <Chip
                              key={p.label}
                              label={p.label}
                              selected={isMax ? atMax : !atMax && text === v}
                              onPress={() => {
                                setAtMax(isMax);
                                setText(v);
                              }}
                            />
                          );
                        })}
                      </View>
                    )}

                    {plan.preview !== null && value > 0 && plan.blocked === null && (
                      <View style={s.panel}>
                        {tab === "borrow" && <Line k="Paid into" v="Your cash, in USDC" />}
                        <Line k="Owed after" v={usd(plan.preview.debt)} />
                        <Line
                          k="Safe until"
                          v={
                            plan.preview.drop === null
                              ? "Nothing owed"
                              : `a ${pct(plan.preview.drop * 100, 0)} fall`
                          }
                        />
                        {plan.preview.note !== undefined && (
                          <RNText style={s.muted}>{plan.preview.note}</RNText>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </ScrollView>

          <View style={[s.footer, { paddingBottom: bottom }]}>
            {action.isSuccess ? (
              <Button label="Done" onPress={() => router.back()} />
            ) : (
              <>
                {value > 0 && !busy && (plan.blocked !== null || action.error !== null) && (
                  <Note tone={plan.blocked !== null ? "warn" : "down"}>
                    {plan.blocked ??
                      (action.error !== null && action.error.message.length > 240
                        ? `${action.error.message.slice(0, 240)}…`
                        : (action.error?.message ?? ""))}
                  </Note>
                )}
                <Button label={label} busy={busy} disabled={!canSubmit} onPress={submit} />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const floorTo = (v: number, places: number) =>
  (Math.floor(v * 10 ** places) / 10 ** places).toFixed(places).replace(/\.?0+$/, "");

/**
 * What a preset puts in the field.
 *
 * Tokens show six places, rounded down. Max in tokens is then held apart as
 * the exact figure (`atMax`): rounding 0.01909536 up gives a hair more than is
 * pledged, and the screen would refuse its own button; exact, a withdrawal of
 * everything goes out as "all" and leaves no dust. A borrow rounds down, so
 * Max never crosses the target; a repay rounds to the cent, close enough to
 * the debt to count as repaying all of it.
 */
const presetText = (v: number, tab: Tab, inTokens: boolean) =>
  inTokens ? floorTo(v, 6) : tab === "borrow" ? floorTo(v, 2) : v.toFixed(2);

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
  done: { alignItems: "center", paddingVertical: space.xl, gap: space.sm },
  doneMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.upChip,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { fontFamily: font.medium, fontSize: 20, letterSpacing: -0.4, color: color.ink },
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
