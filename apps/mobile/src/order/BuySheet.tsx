import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { pct, shares as fmtShares, usd } from "@mercury/view";
import { PriceMoved, useOrderAction, useQuote, type Quote } from "../api";
import { Button, Chip, Icon, PressableScale, Skeleton, StockLogo, Text } from "../ui";
import { color, font, radius, space } from "../theme";

/** The four a first-time buyer actually reaches for. */
const PRESETS = [50, 100, 250, 500];

const num = (v: string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export interface BuySheetProps {
  visible: boolean;
  onClose: () => void;
  ticker: string;
  name: string;
  logoUrl?: string | undefined;
}

/**
 * Buying, in a sheet.
 *
 * The amount leads and everything under it answers for that amount: a quote is
 * a price and a price is only true for a moment, so it is refetched rather than
 * remembered, and the figures below it move when it does.
 *
 * Three outcomes, as the server decides them. `execute` fills now. `offer_queue`
 * is the market being shut — the order is taken and runs at the open, which is
 * worth saying before somebody presses rather than after. `refuse` is a reason,
 * not an error: it is the system declining to trade on terms it does not like,
 * and the only useful thing to do with it is print it.
 */
export const BuySheet = ({ visible, onClose, ticker, name, logoUrl }: BuySheetProps) => {
  const [text, setText] = useState("100");
  const [debounced, setDebounced] = useState(100);
  const [moved, setMoved] = useState<PriceMoved | null>(null);
  const input = useRef<TextInput>(null);

  const amount = Number(text.replace(/[^0-9.]/g, "")) || 0;
  const order = useOrderAction();
  const quote = useQuote(ticker, debounced);

  // One request per figure somebody settles on, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);

  // A sheet reopened is a fresh order; the last one's result is not this one's.
  useEffect(() => {
    if (visible) {
      order.reset();
      setMoved(null);
    }
    // `order` is a new object every render; resetting on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const placed = order.data;
  const decision = moved?.decision ?? quote.data?.decision;
  const canPlace = amount > 0 && decision?.kind === "execute" && order.walletReady && !order.isPending;

  const buy = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoved(null);
    order.mutate(
      { ticker, side: "buy", usd: amount },
      {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: (e) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // A price that ran away is a question, not a failure: the new one goes
          // in front of the buyer and they decide again.
          if (e instanceof PriceMoved) setMoved(e);
        },
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.lift}
        pointerEvents="box-none"
      >
        <View style={s.sheet}>
          <View style={s.grabber} />

          {placed !== undefined ? (
            <Filled result={placed} name={name} ticker={ticker} logoUrl={logoUrl} onDone={onClose} />
          ) : (
            <>
              <View style={s.head}>
                <StockLogo ticker={ticker} uri={logoUrl} size={34} />
                <View style={s.fill}>
                  <RNText style={s.title} numberOfLines={1}>
                    Buy {name}
                  </RNText>
                  <RNText style={s.sub}>{ticker}</RNText>
                </View>
                <PressableScale
                  onPress={onClose}
                  accessibilityLabel="Close"
                  activeScale={0.9}
                  style={s.close}
                >
                  <Icon name="close" size={16} color={color.ink} />
                </PressableScale>
              </View>

              {/* The figure is the control. Tapping anywhere on it opens the pad,
                  which is why the real field is hidden behind it rather than
                  drawn as a box somebody has to find. */}
              <Pressable style={s.amountRow} onPress={() => input.current?.focus()}>
                <RNText style={s.currency}>$</RNText>
                <RNText style={s.amount}>{text === "" ? "0" : text}</RNText>
                <TextInput
                  ref={input}
                  style={s.hidden}
                  value={text}
                  onChangeText={(raw) => setText(raw.replace(/[^0-9.]/g, "").slice(0, 9))}
                  keyboardType="decimal-pad"
                  autoFocus
                  caretHidden
                />
              </Pressable>

              <View style={s.presets}>
                {PRESETS.map((p) => (
                  <Chip key={p} label={`$${p}`} selected={amount === p} onPress={() => setText(String(p))} />
                ))}
              </View>

              <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
                {amount <= 0 ? (
                  <Text variant="small" tone="muted" style={s.hint}>
                    Enter an amount to see what it buys.
                  </Text>
                ) : quote.data === undefined && quote.isPending ? (
                  <View style={s.lines}>
                    <Skeleton width="100%" height={16} />
                    <Skeleton width="72%" height={16} />
                  </View>
                ) : decision === undefined ? (
                  <Text variant="small" tone="down" style={s.hint}>
                    We could not price that just now.
                  </Text>
                ) : decision.kind === "refuse" ? (
                  <Refused detail={decision.detail} />
                ) : (
                  <Preview decision={decision} quote={quote.data} amount={amount} moved={moved !== null} />
                )}

                {order.isError && moved === null && (
                  <View style={s.failed}>
                    <Icon name="alert" size={15} color={color.down} />
                    <Text variant="small" style={s.failedText}>
                      {order.error.message}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View style={s.footer}>
                <Button
                  label={
                    !order.walletReady
                      ? "Getting your wallet ready"
                      : moved !== null
                        ? "Buy at the new price"
                        : decision?.kind === "offer_queue"
                          ? "Place for the open"
                          : "Buy"
                  }
                  busy={order.isPending}
                  disabled={!canPlace && decision?.kind !== "offer_queue"}
                  onPress={buy}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/** What the money turns into, and what it costs to get there. */
const Preview = ({
  decision,
  quote,
  amount,
  moved,
}: {
  decision: NonNullable<Quote["decision"]>;
  quote: Quote | undefined;
  amount: number;
  moved: boolean;
}) => {
  if (decision.kind === "refuse") return <Refused detail={decision.detail} />;

  const price = num(decision.best.pricePerShare) ?? 0;
  const got = num(decision.best.filledShares);
  const worst = num(decision.best.worstPricePerShare);
  const fee = Number(quote?.fee.usdc ?? 0);
  /* The charge comes out of the amount rather than being added to it, so
     somebody holding exactly $5 can still spend all of it. */
  const invested = amount - fee;

  return (
    <View style={s.lines}>
      {moved && (
        <View style={s.note}>
          <Icon name="alert" size={14} color={color.warn} />
          <Text variant="small" style={s.noteText}>
            The price moved while we were building your order. This is the new one.
          </Text>
        </View>
      )}

      {decision.kind === "offer_queue" && (
        <View style={s.note}>
          <Icon name="clock" size={14} color={color.warn} />
          <Text variant="small" style={s.noteText}>
            The market is closed. We'll run this at the open and tell you what it filled at.
          </Text>
        </View>
      )}

      <Line label="You get" value={got === null ? "—" : `${fmtShares(got)} shares`} strong />
      <Line label="Price a share" value={usd(price)} />
      {worst !== null && worst !== price && <Line label="Most you'd pay" value={usd(worst)} muted />}
      {fee > 0 && (
        <>
          <Line label="Network charge" value={usd(fee)} muted />
          <Line label="Invested" value={usd(invested)} muted />
        </>
      )}
      <Line label="Issued by" value={decision.best.issuer === "backed" ? "Backed" : "Ondo"} muted />
      {decision.best.priceImpact !== null && (
        <Line label="Price impact" value={pct(Number(decision.best.priceImpact) * 100)} muted />
      )}

      {decision.kind === "execute" && decision.warning !== null && (
        <View style={s.note}>
          <Icon name="alert" size={14} color={color.warn} />
          <Text variant="small" style={s.noteText}>
            {decision.warning}
          </Text>
        </View>
      )}
    </View>
  );
};

/**
 * A refusal, printed.
 *
 * The server declines on terms rather than failing, and the reason it gives is
 * already written for a reader — "below the minimum", "no route deep enough".
 * Rewriting it here would be a second, worse copy that drifts.
 */
const Refused = ({ detail }: { detail: string }) => (
  <View style={s.refused}>
    <Icon name="alert" size={15} color={color.warn} />
    <Text variant="small" style={s.refusedText}>
      {detail}
    </Text>
  </View>
);

const Filled = ({
  result,
  name,
  ticker,
  logoUrl,
  onDone,
}: {
  result: { shares: string; pricePerShare: string; usd: string };
  name: string;
  ticker: string;
  logoUrl?: string | undefined;
  onDone: () => void;
}) => (
  <View style={s.done}>
    <View style={s.doneMark}>
      <StockLogo ticker={ticker} uri={logoUrl} size={52} />
      <View style={s.doneTick}>
        <Icon name="check" size={13} color={color.surface} strokeWidth={3} />
      </View>
    </View>
    <RNText style={s.doneTitle}>
      {fmtShares(result.shares)} shares of {name}
    </RNText>
    <RNText style={s.doneSub}>
      {usd(result.usd)} at {usd(result.pricePerShare)} a share
    </RNText>
    <View style={s.doneAction}>
      <Button label="Done" onPress={onDone} />
    </View>
  </View>
);

const Line = ({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) => (
  <View style={s.line}>
    <RNText style={[s.lineLabel, muted === true && s.lineLabelMuted]}>{label}</RNText>
    <RNText style={[s.lineValue, strong === true && s.lineValueStrong, muted === true && s.lineValueMuted]}>
      {value}
    </RNText>
  </View>
);

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  lift: { flex: 1, justifyContent: "flex-end" },
  fill: { flex: 1 },
  sheet: {
    backgroundColor: color.page,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 14,
    maxHeight: "92%",
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.divider,
    alignSelf: "center",
    marginTop: 9,
  },

  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingTop: 16,
  },
  title: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.12, color: color.muted, marginTop: 3 },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  amountRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", paddingTop: 26 },
  currency: { fontFamily: font.medium, fontSize: 24, color: color.muted, marginTop: 8 },
  amount: { fontFamily: font.medium, fontSize: 52, letterSpacing: -2, color: color.ink, lineHeight: 60 },
  /* Present and focusable, but never seen: the figure above is the field. */
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },

  presets: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingTop: 14,
    paddingBottom: 6,
  },

  body: { paddingHorizontal: space.screen, marginTop: 10 },
  hint: { paddingVertical: space.md, textAlign: "center" },
  lines: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 16, gap: 11 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  lineLabel: { fontFamily: font.regular, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  lineLabelMuted: { color: color.muted },
  lineValue: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  lineValueStrong: { fontSize: 17, letterSpacing: -0.34 },
  lineValueMuted: { fontFamily: font.regular, color: color.muted },

  note: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  noteText: { flex: 1, color: color.warn, lineHeight: 18 },

  refused: {
    flexDirection: "row",
    gap: 9,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.warnTint,
  },
  refusedText: { flex: 1, color: color.warn, lineHeight: 18 },

  failed: {
    flexDirection: "row",
    gap: 9,
    marginTop: space.md,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.downTint,
  },
  failedText: { flex: 1, color: color.downDeep, lineHeight: 18 },

  footer: { paddingHorizontal: space.screen, paddingTop: space.md },

  done: { alignItems: "center", paddingHorizontal: space.screen, paddingTop: 30 },
  doneMark: { marginBottom: 18 },
  doneTick: {
    position: "absolute",
    right: -4,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.up,
    borderWidth: 2.5,
    borderColor: color.page,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: {
    fontFamily: font.medium,
    fontSize: 20,
    letterSpacing: -0.4,
    color: color.ink,
    textAlign: "center",
  },
  doneSub: { fontFamily: font.regular, fontSize: 14, letterSpacing: -0.14, color: color.muted, marginTop: 7 },
  doneAction: { alignSelf: "stretch", marginTop: 26 },
});
