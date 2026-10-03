import { useState } from "react";
import { Linking, StyleSheet, Text as RNText, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import type { Event, EventKind } from "@mercury/view";
import { Icon, PressableScale, Skeleton, StatusChip, StockLogo, type IconName } from "../ui";
import { color, font, radius, space } from "../theme";

/**
 * USDC's mark, as the web's `activity-mark.tsx` picks it: the Solana token
 * list's own asset, the file every wallet on this chain already shows for this
 * mint. Cash is not a holding, so it never comes from the API's logo column.
 */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_LOGO = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${USDC_MINT}/logo.png`;

/* The web's `--color-ds-act-*` pairs: buying in teal, income in green, money
   going out in warm grey, and anything waiting in amber. */
const BUY = { bg: "#E5F4F5", fg: "#007682" };
const INCOME = { bg: "#E4F3EC", fg: "#007242" };
const OUT = { bg: "#F4F2EC", fg: "#393830" };
const WAIT = { bg: color.warnTint, fg: color.warn };

const LOOK: Record<EventKind, { bg: string; fg: string; icon: IconName }> = {
  buy: { ...BUY, icon: "trend" },
  basket: { ...BUY, icon: "grid" },
  sell: { ...OUT, icon: "arrowDown" },
  send: { ...OUT, icon: "arrowUp" },
  dividend: { ...INCOME, icon: "refresh" },
  receive: { ...INCOME, icon: "arrowDown" },
  interest: { ...INCOME, icon: "plus" },
  queued: { ...WAIT, icon: "clock" },
  // Money, so the same arrows cash uses. Borrowing is not a gain, so it takes
  // the neutral ground rather than the green a dividend gets.
  borrow: { ...OUT, icon: "arrowDown" },
  repay: { ...OUT, icon: "arrowUp" },
  // Collateral, not money: a lock going on and coming off.
  pledge: { ...OUT, icon: "lock" },
  unpledge: { ...INCOME, icon: "lock" },
  // The only row in the feed that is asking for something to be done.
  loan_alert: { ...WAIT, icon: "alert" },
};

/** The logo's diameter wherever one leads a row. */
export const MARK = 36;

/** "Today", "Yesterday", else "27 Sep" — the web's `relDay`, said shorter. */
export const whenLabel = (isoDate: string): string => {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const days = Math.round((Date.parse(isoDate) - today) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** What led the row: the asset's own art with the kind on it, or the kind alone. */
export const EventMark = ({ event }: { event: Event }) => {
  const look = LOOK[event.kind];
  const uri = event.logo ?? (event.mint === USDC_MINT ? USDC_LOGO : undefined);
  if (uri === undefined) {
    return (
      <View style={[s.art, { backgroundColor: look.bg }]}>
        <Icon name={look.icon} size={16} color={look.fg} strokeWidth={1.8} />
      </View>
    );
  }
  return (
    <View>
      <StockLogo ticker={event.title.slice(0, 1)} uri={uri} size={MARK} />
      <View style={[s.badge, { backgroundColor: look.bg }]}>
        <Icon name={look.icon} size={9} color={look.fg} strokeWidth={2.4} />
      </View>
    </View>
  );
};

/** "+$12.42", "−$200.00": one true sign. Green for anything not leaving, as the web colours it. */
const signed = (event: Event): string | null => {
  if (event.amount === null) return null;
  if (event.flow === "in") return `+${event.amount}`;
  if (event.flow === "out") return `−${event.amount}`;
  return event.amount;
};

/**
 * One event, the web's 60-high row: the mark, the title over a line of detail,
 * the amount at the right.
 *
 * `expandable` is the Activity tab's: a tap opens the row in place to its
 * details and the transaction behind it, as the web's list does. The home
 * screen's summary shows the day instead, and does not open.
 */
export const EventRow = ({
  event,
  masked = false,
  when = false,
  expandable = false,
}: {
  event: Event;
  masked?: boolean;
  when?: boolean;
  expandable?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const amount = signed(event);

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[s.wrap, open && s.wrapOpen]}>
      <PressableScale
        haptic={expandable}
        activeScale={expandable ? 0.99 : 1}
        disabled={!expandable}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole={expandable ? "button" : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
        style={s.row}
      >
        <EventMark event={event} />
        <View style={s.mid}>
          <View style={s.titleLine}>
            <RNText style={s.title} numberOfLines={1}>
              {event.title}
            </RNText>
            {event.pending && <StatusChip tone="warn">Pending</StatusChip>}
          </View>
          {event.sub !== "" && (
            <RNText style={s.sub} numberOfLines={1}>
              {event.sub}
            </RNText>
          )}
        </View>
        <View style={s.end}>
          {amount !== null && (
            <RNText style={[s.amount, event.flow !== "out" && s.credit]}>{masked ? "••••" : amount}</RNText>
          )}
          {when && <RNText style={s.when}>{whenLabel(event.date)}</RNText>}
        </View>
        {expandable && (
          <Icon
            name="chevronRight"
            size={13}
            color={color.muted}
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          />
        )}
      </PressableScale>

      {open && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={s.more}>
          {event.details.map((d) => (
            <View key={d.label} style={s.detail}>
              <RNText style={s.detailLabel}>{d.label}</RNText>
              <RNText
                style={[
                  s.detailValue,
                  d.tone === "up" && { color: color.up },
                  d.tone === "down" && { color: color.down },
                  d.tone === "muted" && { color: color.muted },
                ]}
              >
                {d.value}
              </RNText>
            </View>
          ))}
          {event.signature ? (
            <PressableScale
              onPress={() => void Linking.openURL(`https://solscan.io/tx/${event.signature}`)}
              activeScale={0.98}
              style={[s.chain, event.details.length > 0 && s.chainGap]}
              accessibilityRole="link"
            >
              <RNText style={s.sig} numberOfLines={1}>
                {event.signature}
              </RNText>
              <RNText style={s.link}>View on chain</RNText>
              <Icon name="chevronRight" size={11} color={color.link} />
            </PressableScale>
          ) : (
            <RNText style={[s.chain, s.sig, event.details.length > 0 && s.chainGap]}>
              Nothing on chain yet. The order rests until its price is met.
            </RNText>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
};

/**
 * Rows still loading, at the real rows' geometry — the same height, the same
 * padding, the same 36 mark — so nothing jolts when the feed lands.
 */
export const EventRowSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <View>
    {Array.from({ length: rows }, (_, i) => (
      <View key={i} style={s.row}>
        <Skeleton width={MARK} height={MARK} style={s.round} />
        <View style={[s.mid, s.lines]}>
          <Skeleton width="62%" height={13} />
          <Skeleton width="38%" height={11} />
        </View>
        <Skeleton width={56} height={13} />
      </View>
    ))}
  </View>
);

const s = StyleSheet.create({
  round: { borderRadius: MARK / 2 },
  lines: { gap: 6 },
  wrap: { borderRadius: radius.sm, overflow: "hidden" },
  wrapOpen: { backgroundColor: color.surface },
  row: { height: 60, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: 16 },
  art: { width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: "center", justifyContent: "center" },
  /* The kind, on the logo, cut out of the art by a ring of white. */
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 2,
    borderColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  mid: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  title: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.28,
    color: color.ink,
  },
  sub: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted, marginTop: 2 },
  end: { alignItems: "flex-end", gap: 3 },
  amount: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  credit: { color: color.up },
  when: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  more: { paddingLeft: 16 + MARK + space.md, paddingRight: 16, paddingBottom: 16, gap: space.md },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: space.lg },
  detailLabel: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  detailValue: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "right", flexShrink: 1 },
  chain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.md,
    backgroundColor: color.tile,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  chainGap: { marginTop: space.xs },
  sig: { flex: 1, fontFamily: "Menlo", fontSize: 12, color: color.muted },
  link: { fontFamily: font.medium, fontSize: 12, color: color.link },
});
