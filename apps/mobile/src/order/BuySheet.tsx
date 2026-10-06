import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import { Haptics } from "../haptics";
import { pct, refuseCopy, shares as fmtShares, usd } from "@mercury/view";
import { useRouter } from "expo-router";
import { PriceMoved, useMoney, useOrderAction, useQuote, type Quote } from "../api";
import { Button, Chip, Icon, IconButton, Note, Skeleton, StockLogo, Text, useBottomGap } from "../ui";
import { color, font, radius, space } from "../theme";

/** The four a first-time buyer actually reaches for. */
const PRESETS = [50, 100, 250, 500];

/* Fractions of the position when selling: a $50 chip does nothing on a $30
   holding. The web's ticket has the same four. */
const SELL_PRESETS = [0.25, 0.5, 0.75, 1] as const;

const num = (v: string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export interface BuySheetProps {
  onClose: () => void;
  ticker: string;
  name: string;
  logoUrl?: string | undefined;
  side?: "buy" | "sell";
  /** What the sellable part of the position is worth: owned, less what is
   *  pledged to a loan. The sell fractions are of this. */
  sellableUsd?: number | null;
}

/**
 * Buying, in the system's sheet: the `buy` route presents this as an iOS form
 * sheet, so the grabber, the spring and the swipe to dismiss are the system's.
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
export const BuySheet = ({
  onClose,
  ticker,
  name,
  logoUrl,
  side = "buy",
  sellableUsd = null,
}: BuySheetProps) => {
  const selling = side === "sell";
  const bottom = useBottomGap();
  const [text, setText] = useState(selling ? "" : "100");
  const [debounced, setDebounced] = useState(selling ? 0 : 100);
  /* "All": sell the whole sellable position in tokens, so dust is not left
     behind by a dollar figure that rounded. The amount is then only a label. */
  const [max, setMax] = useState(false);
  const [moved, setMoved] = useState<PriceMoved | null>(null);
  const input = useRef<TextInput>(null);

  const amount = Number(text.replace(/[^0-9.]/g, "")) || 0;
  const order = useOrderAction();
  const quote = useQuote(ticker, debounced, side, max);
  /*
   * What there is to spend. Checked here, not left to the chain: without it the
   * only thing standing between an empty wallet and a failed order is a
   * preflight rejection, which arrives after the signing prompt and reads like
   * a fault in the app rather than an empty account. The web's sheet has
   * guarded on this all along; this one did not, and the first real buy came
   * back as a wall of base64.
   */
  const available = Number(useMoney().data?.balanceUsd ?? 0);

  // One request per figure somebody settles on, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);

  const placed = order.data;
  const decision = moved?.decision ?? quote.data?.decision;
  /* A figure still being typed is not a figure to quote against. */
  const typing = debounced !== amount;
  /* A sale is not spending, so the cash balance has nothing to say about it;
     what bounds it is the part of the position that is not pledged. */
  const overBalance = selling
    ? !max && sellableUsd !== null && amount > sellableUsd + 0.005
    : amount > available;
  const canPlace =
    amount > 0 &&
    !overBalance &&
    !typing &&
    decision?.kind === "execute" &&
    order.walletReady &&
    !order.isPending;

  const buy = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoved(null);
    order.mutate(
      { ticker, side, usd: amount, ...(max ? { max: true } : {}) },
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.sheet, { paddingBottom: bottom }]}>
        {placed !== undefined ? (
          <Filled
            result={placed}
            name={name}
            ticker={ticker}
            logoUrl={logoUrl}
            amount={amount}
            selling={selling}
            onDone={onClose}
          />
        ) : (
          <>
            <View style={s.head}>
              <StockLogo ticker={ticker} uri={logoUrl} size={34} />
              <View style={s.fill}>
                <RNText style={s.title} numberOfLines={1}>
                  {selling ? "Sell" : "Buy"} {name}
                </RNText>
                <RNText style={s.sub}>
                  {selling
                    ? sellableUsd === null
                      ? ticker
                      : `${ticker} · ${usd(sellableUsd)} you can sell`
                    : `${ticker} · ${usd(available)} cash`}
                </RNText>
              </View>
              <IconButton icon="close" label="Close" size={36} onPress={onClose} />
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
                onChangeText={(raw) => {
                  setMax(false);
                  setText(raw.replace(/[^0-9.]/g, "").slice(0, 9));
                }}
                keyboardType="decimal-pad"
                autoFocus
                caretHidden
              />
            </Pressable>

            <View style={s.presets}>
              {selling
                ? SELL_PRESETS.map((f) => {
                    const value = sellableUsd === null ? "" : (sellableUsd * f).toFixed(2);
                    return (
                      <Chip
                        key={f}
                        label={f === 1 ? "All" : `${f * 100}%`}
                        selected={f === 1 ? max : !max && value !== "" && text === value}
                        onPress={() => {
                          if (value === "") return;
                          setMax(f === 1);
                          setText(value);
                        }}
                      />
                    );
                  })
                : PRESETS.map((p) => (
                    <Chip
                      key={p}
                      label={`$${p}`}
                      selected={amount === p}
                      onPress={() => setText(String(p))}
                    />
                  ))}
            </View>

            {/* A plain view, not a scroll view: the sheet is sized to what it holds,
                and a scroll view has no height of its own to offer it. */}
            <View style={s.body}>
              {overBalance ? (
                <Note tone="warn">
                  {selling
                    ? `More than you can sell. The most is ${usd(sellableUsd ?? 0)}.`
                    : `That is more than your ${usd(available)} cash. Add money first.`}
                </Note>
              ) : selling && sellableUsd !== null && sellableUsd <= 0 ? (
                <Note tone="warn">
                  All of this position is pledged to your loan. Repay some of it to sell.
                </Note>
              ) : amount <= 0 ? (
                <Text variant="small" tone="muted" style={s.hint}>
                  {selling
                    ? "Enter an amount, or pick a share of the position."
                    : "Enter an amount to see what it buys."}
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
                <Refused reason={decision.reason} side={decision.side} />
              ) : decision.kind === "offer_queue" ? (
                <Queued decision={decision} amount={amount} />
              ) : (
                <Preview
                  decision={decision}
                  quote={quote.data}
                  amount={amount}
                  moved={moved !== null}
                  selling={selling}
                />
              )}

              {order.isError && moved === null && (
                <View style={[s.result, s.resultDown, s.failed]}>
                  <RNText style={[s.resultTitle, s.downInk]}>Your order didn&apos;t go through</RNText>
                  {/* Capped. The server should never send a wall of text and
                      now does not, but a sheet that can be pushed off screen
                      by one bad string is a sheet with no floor under it. */}
                  <RNText style={[s.resultBody, s.downInk]}>
                    {order.error.message.length > 240
                      ? `${order.error.message.slice(0, 240)}…`
                      : order.error.message}
                  </RNText>
                  <RNText style={[s.resultBody, s.downInk]}>Check Activity before trying again.</RNText>
                </View>
              )}
            </View>

            <View style={s.footer}>
              <Button
                label={
                  overBalance
                    ? selling
                      ? "More than you hold"
                      : "Not enough cash"
                    : !order.walletReady
                      ? "Getting your wallet ready"
                      : moved !== null
                        ? `${selling ? "Sell" : "Buy"} at the new price`
                        : decision?.kind === "offer_queue"
                          ? "Wait for the open"
                          : decision?.kind === "refuse"
                            ? `Can't ${selling ? "sell" : "buy"} right now`
                            : order.isError
                              ? "Try again"
                              : selling
                                ? max
                                  ? "Sell all"
                                  : "Sell"
                                : "Buy"
                }
                busy={order.isPending}
                /* A queued decision blocks, as the web's does: the market is shut and
                   orders that wait for the open are not built yet, so the server
                   would refuse it after the signing prompt. */
                disabled={overBalance || !canPlace}
                onPress={buy}
              />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

/** What the money turns into, and what it costs to get there. */
const Preview = ({
  decision,
  quote,
  amount,
  moved,
  selling,
}: {
  decision: NonNullable<Quote["decision"]>;
  quote: Quote | undefined;
  amount: number;
  moved: boolean;
  selling: boolean;
}) => {
  if (decision.kind === "refuse") return <Refused reason={decision.reason} side={decision.side} />;
  if (decision.kind === "offer_queue") return <Queued decision={decision} amount={amount} />;

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

      {selling ? (
        <>
          {/* A sale's share count is not derived: it is the quantity being
              sold. What it lands, net of the charge, is the figure that matters. */}
          <Line label="You get" value={usd(num(quote?.proceeds) ?? (got ?? 0) * price)} strong />
          <Line label="You sell" value={got === null ? "—" : `${fmtShares(got)} shares`} />
          <Line label="Price a share" value={usd(price)} />
          {worst !== null && worst < price && got !== null && (
            <Line label="Least you'd get" value={usd(got * worst - fee)} muted />
          )}
          {fee > 0 && <Line label="Network charge" value={`−${usd(fee)}`} muted />}
        </>
      ) : (
        <>
          <Line label="You get" value={got === null ? "—" : `${fmtShares(got)} shares`} strong />
          <Line label="Price a share" value={usd(price)} />
          {worst !== null && worst !== price && <Line label="Most you'd pay" value={usd(worst)} muted />}
          {fee > 0 && (
            <>
              <Line label="Network charge" value={usd(fee)} muted />
              <Line label="Invested" value={usd(invested)} muted />
            </>
          )}
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
 * A refusal, in the reader's words: what happened and, where there is one, the
 * way out. The copy is the web's, from `@mercury/view`, so both clients say the
 * same sentence for the same reason.
 */
const Refused = ({ reason, side }: { reason: Parameters<typeof refuseCopy>[0]; side: "buy" | "sell" }) => {
  const copy = refuseCopy(reason, side);
  return (
    <View style={[s.result, s.resultDown]}>
      <RNText style={[s.resultTitle, s.downInk]}>{copy.title}</RNText>
      <RNText style={[s.resultBody, s.downInk]}>{copy.body}</RNText>
    </View>
  );
};

type QueueDecision = Extract<NonNullable<Quote["decision"]>, { kind: "offer_queue" }>;

/** "Monday at 9:30 AM ET": when the US market opens, in its own timezone. */
const opensAt = (iso: string | null) => {
  if (iso === null) return "When the US market opens";
  const d = new Date(iso);
  const day = d.toLocaleString("en-US", { weekday: "long", timeZone: "America/New_York" });
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  return `${day} at ${time} ET`;
};

/**
 * Worth waiting: the market is shut and this costs more than a real share
 * should. The web's advice, as the web gives it — not an offer to hold the
 * order, which is a trigger order and not built yet.
 */
const Queued = ({ decision, amount }: { decision: QueueDecision; amount: number }) => {
  const price = Number(decision.best.pricePerShare);
  const premium = Number(decision.premium) * 100;
  const fair = Number(decision.suggestedTriggerPricePerShare);
  return (
    <View style={s.lines}>
      <View style={[s.result, s.resultWarn]}>
        <View style={s.resultHead}>
          <Icon name="clock" size={15} color={color.warn} />
          <RNText style={[s.resultTitle, s.warnInk]}>Worth waiting</RNText>
        </View>
        <RNText style={[s.resultBody, s.warnInk]}>
          {`The US market is shut, and this is trading ${premium.toFixed(2)}% above the real share price, more than we think you should pay. The gap usually closes once the market opens.`}
        </RNText>
      </View>
      <Line label="You'd pay now" value={`${usd(price)} a share`} />
      <Line label="Worth paying" value={`${usd(fair)} a share`} muted />
      <Line label="Your amount" value={usd(amount)} muted />
      <Line label="Market opens" value={opensAt(decision.marketOpensAt)} muted />
      <Text variant="small" tone="muted">
        Your cash stays yours in the meantime, and keeps earning.
      </Text>
    </View>
  );
};

/**
 * The order, filled: what came back, read off the chain rather than the quote,
 * and what it cost. Done closes the sheet; Activity shows the row it made.
 */
const Filled = ({
  result,
  name,
  ticker,
  logoUrl,
  amount,
  selling,
  onDone,
}: {
  result: { shares: string; pricePerShare: string; usd: string; realisedPnlUsd?: string | null };
  name: string;
  ticker: string;
  logoUrl?: string | undefined;
  amount: number;
  selling: boolean;
  onDone: () => void;
}) => {
  const router = useRouter();
  const pnl = result.realisedPnlUsd == null ? null : Number(result.realisedPnlUsd);
  return (
    <View style={s.done}>
      <View style={s.doneMark}>
        <StockLogo ticker={ticker} uri={logoUrl} size={56} />
        <View style={s.doneTick}>
          <Icon name="check" size={13} color={color.surface} strokeWidth={3} />
        </View>
      </View>
      <RNText style={s.doneKicker}>{selling ? "Sold" : "Bought"}</RNText>
      <RNText style={s.doneTitle}>{`${fmtShares(result.shares)} shares of ${name}`}</RNText>
      <RNText style={s.doneSub}>{`at ${usd(result.pricePerShare)} a share`}</RNText>

      <View style={s.receipt}>
        {selling ? (
          <Line label="Came to" value={usd(result.usd)} />
        ) : (
          <>
            <Line label="You paid" value={usd(amount)} />
            <Line label="Went into shares" value={usd(result.usd)} muted />
          </>
        )}
        <Line label="Price a share" value={usd(result.pricePerShare)} muted />
        {/* A sale is the one moment a gain stops being a number on a screen
            and becomes money. Worth saying, in its colour. */}
        {pnl !== null && (
          <Line
            label={pnl < 0 ? "Realised loss" : "Realised gain"}
            value={usd(Math.abs(pnl))}
            tone={pnl < 0 ? "down" : "up"}
          />
        )}
      </View>

      <View style={s.doneActions}>
        <Button label="Done" onPress={onDone} />
        <Button
          label="See it in Activity"
          variant="secondary"
          onPress={() => {
            onDone();
            router.navigate("/activity");
          }}
        />
      </View>
    </View>
  );
};

const Line = ({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: "up" | "down";
}) => (
  <View style={s.line}>
    <RNText style={[s.lineLabel, muted === true && s.lineLabelMuted]}>{label}</RNText>
    <RNText
      style={[
        s.lineValue,
        strong === true && s.lineValueStrong,
        muted === true && s.lineValueMuted,
        tone !== undefined && { color: tone === "up" ? color.up : color.down },
      ]}
    >
      {value}
    </RNText>
  </View>
);

const s = StyleSheet.create({
  fill: { flex: 1 },
  /* White, as the web's dialogs are; the system draws the corners and the grabber. */
  sheet: { backgroundColor: color.surface, paddingTop: space.md },

  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingTop: 16,
  },
  title: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12.5, letterSpacing: -0.12, color: color.muted, marginTop: 3 },

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

  failed: { marginTop: space.md },
  result: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  resultDown: { backgroundColor: color.downChip },
  resultWarn: { backgroundColor: color.warnChip },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultTitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 19 },
  resultBody: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  downInk: { color: color.chipDown },
  warnInk: { color: color.chipWarn },
  doneKicker: { fontFamily: font.medium, fontSize: 13, color: color.up, marginTop: space.md },
  receipt: {
    alignSelf: "stretch",
    borderRadius: radius.md,
    backgroundColor: color.tile,
    padding: space.md,
    gap: 10,
    marginTop: space.lg,
  },
  doneActions: { alignSelf: "stretch", gap: space.sm, marginTop: space.lg },

  footer: { paddingHorizontal: space.screen, paddingTop: space.md },

  done: { alignItems: "center", paddingHorizontal: space.screen, paddingTop: 30 },
  doneMark: {},
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
});
