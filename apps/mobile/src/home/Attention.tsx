import { StyleSheet, Text as RNText, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { pct, usd } from "@mercury/view";
import { Icon, PressableScale, type IconName } from "../ui";
import { color, font, radius, space } from "../theme";
import type { Borrow } from "../api";

/** The smallest order the server places; below it, the first step is adding cash. */
const MIN_ORDER = 5;

/**
 * The one thing on home that asks for something, and only when it should: a
 * loan near its limit, or the first step for an account that holds nothing.
 * On an ordinary day there is nothing to ask, so there is nothing here — the
 * hero and the holdings already say how the day went.
 *
 * A slim banner rather than a card: a tinted mark, what is wrong or next in
 * one line under a short title, and the button that answers it at the right.
 */
export const Attention = ({
  borrow,
  empty,
  cash,
  onBorrow,
  onInvest,
  onAddCash,
}: {
  borrow: Borrow | undefined;
  empty: boolean;
  cash: number;
  onBorrow: () => void;
  onInvest: () => void;
  onAddCash: () => void;
}) => {
  if (borrow !== undefined && borrow.debtUsd > 0 && borrow.health !== "healthy") {
    return (
      <Banner
        tone="warn"
        icon="alert"
        title={
          borrow.health === "over_limit"
            ? "Your loan is over target"
            : borrow.health === "margin_call"
              ? "Repay soon to keep your shares"
              : "Kamino is selling collateral"
        }
        body={
          borrow.safeUntilDrop === null
            ? `${usd(borrow.debtUsd)} borrowed`
            : `${usd(borrow.debtUsd)} borrowed · safe to a ${pct(borrow.safeUntilDrop * 100, 0)} fall`
        }
        action="Repay"
        onPress={onBorrow}
      />
    );
  }
  if (!empty) return null;
  const funded = cash >= MIN_ORDER;
  return funded ? (
    <Banner
      tone="up"
      icon="trend"
      title={`${usd(cash)} ready to invest`}
      body="Your first share from $5, or a basket of a whole theme."
      action="Invest"
      onPress={onInvest}
    />
  ) : (
    <Banner
      tone="up"
      icon="plus"
      title="Add cash to start"
      body="USDC on Solana lands in your account in seconds."
      action="Add cash"
      onPress={onAddCash}
    />
  );
};

const TONE = {
  warn: { bg: color.warnTint, mark: "rgba(255,255,255,0.7)", ink: color.warn },
  up: { bg: color.surface, mark: color.actBuyTint, ink: color.actBuy },
} as const;

const Banner = ({
  tone,
  icon,
  title,
  body,
  action,
  onPress,
}: {
  tone: keyof typeof TONE;
  icon: IconName;
  title: string;
  body: string;
  action: string;
  onPress: () => void;
}) => {
  const look = TONE[tone];
  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <PressableScale
        style={[s.banner, { backgroundColor: look.bg }]}
        activeScale={0.985}
        onPress={onPress}
        accessibilityRole="button"
      >
        <View style={[s.mark, { backgroundColor: look.mark }]}>
          <Icon name={icon} size={17} color={look.ink} strokeWidth={1.9} />
        </View>
        <View style={s.text}>
          <RNText style={[s.title, tone === "warn" && { color: look.ink }]} numberOfLines={1}>
            {title}
          </RNText>
          <RNText style={s.body} numberOfLines={2}>
            {body}
          </RNText>
        </View>
        <View style={[s.action, tone === "warn" ? s.actionWarn : s.actionInk]}>
          <RNText style={[s.actionText, tone === "warn" && { color: look.ink }]}>{action}</RNText>
        </View>
      </PressableScale>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  banner: {
    marginHorizontal: space.screen,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.xl,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 12,
  },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: font.medium, fontSize: 14.5, letterSpacing: -0.29, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted },
  action: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: "center" },
  actionInk: { backgroundColor: color.ink },
  actionWarn: { backgroundColor: "rgba(255,255,255,0.75)" },
  actionText: { fontFamily: font.medium, fontSize: 13, color: color.onBand },
});
