import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import type { EventKind } from "@mercury/view";
import { color } from "../theme";

/*
 * The web's activity marks (`portfolio/Feed.tsx`, from activity.svg), path for
 * path: a tinted 24-unit circle with a stroked glyph, drawn here at 36.
 * Sending and buying turn around for receiving and selling; borrowing reuses
 * the cash arrows, collateral the trend line; the amber ones wait on you.
 */
const SEND = { bg: "#F4F2EC", ink: "#393830" };
const DIVIDEND = { bg: "#E4F3EC", ink: "#007242" };
const BUY = { bg: "#E5F4F5", ink: "#007682" };
const QUEUED = { bg: "#FDF3D9", ink: "#925A0A" };
const INTEREST = { bg: "#E2F4E9", ink: "#007242" };

const SEND_UP = (
  <>
    <Path d="M12 7.6665V16.6665" />
    <Path d="M16 11.3335C16 11.3335 13.054 7.3335 12 7.3335C10.9459 7.3335 8 11.3335 8 11.3335" />
  </>
);
const BUY_TREND = (
  <Path d="M8.4722 10.02L11.4141 10.02M7 15L9.7488 12.293C9.8546 12.189 10.0198 12.177 10.139 12.265L12.2619 13.836C12.387 13.928 12.5614 13.91 12.6653 13.794L16.6424 9.351M15.0542 9H16.4653C16.7393 9 16.9629 9.22 16.9686 9.496L17 11.032" />
);
const DIVIDEND_CYCLE = (
  <>
    <Path d="M8.3882 7.2779L8.3882 13.3886C8.3882 15.4514 9.8798 16.9995 11.9991 16.9995" />
    <Path d="M15.6108 16.7216L15.6108 10.6109C15.6108 8.5481 14.1192 7 11.9999 7" />
    <Path d="M7 8.3887C7 8.3887 8.0228 6.9999 8.3888 6.9999C8.7548 6.9999 9.7776 8.3887 9.7776 8.3887" />
    <Path d="M14.2217 15.6107C14.2217 15.6107 15.2445 16.9995 15.6105 16.9995C15.9765 16.9995 16.9993 15.6107 16.9993 15.6107" />
  </>
);

const GLYPH: Record<EventKind, { tone: { bg: string; ink: string }; draw: ReactNode }> = {
  send: { tone: SEND, draw: SEND_UP },
  receive: { tone: DIVIDEND, draw: <G transform="rotate(180 12 12)">{SEND_UP}</G> },
  dividend: { tone: DIVIDEND, draw: DIVIDEND_CYCLE },
  buy: { tone: BUY, draw: BUY_TREND },
  basket: { tone: BUY, draw: BUY_TREND },
  sell: { tone: SEND, draw: <G transform="scale(1 -1) translate(0 -24)">{BUY_TREND}</G> },
  queued: {
    tone: QUEUED,
    draw: (
      <>
        <Circle cx="12" cy="12" r="6" />
        <Path d="M12 9.6001V12.0001L13.2 13.2001" />
      </>
    ),
  },
  interest: { tone: INTEREST, draw: <Path d="M12 7V17M17 12H7" /> },
  borrow: { tone: DIVIDEND, draw: <G transform="rotate(180 12 12)">{SEND_UP}</G> },
  repay: { tone: SEND, draw: SEND_UP },
  pledge: { tone: SEND, draw: BUY_TREND },
  unpledge: { tone: BUY, draw: BUY_TREND },
  loan_alert: {
    tone: QUEUED,
    draw: (
      <>
        <Path d="M12 7.5V13" />
        <Path d="M12 16.2V16.3" />
      </>
    ),
  },
};

/** A kind with no asset behind it — a queued order, interest — as its own mark. */
export const KindGlyph = ({ kind, size = 36 }: { kind: EventKind; size?: number }) => {
  const { tone, draw } = GLYPH[kind];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="12" fill={tone.bg} />
      <G stroke={tone.ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}>
        {draw}
      </G>
    </Svg>
  );
};

const SOLANA =
  "m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z";

/**
 * Solana notched into a coin's corner, cut out by a white ring: the web's USDC
 * mark. "Added cash" is the one row where the chain is the point — the same
 * ticker on the wrong network is the mistake to keep people from making.
 */
export const SolanaNotch = () => (
  <View style={s.notch}>
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d={SOLANA} fill={color.ink} />
    </Svg>
  </View>
);

const s = StyleSheet.create({
  notch: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
