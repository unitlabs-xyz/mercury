import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { qrPath } from "@mercury/view";
import { color, radius } from "../theme";

/**
 * The address as a code another phone can read, from the same encoder the web
 * uses. Dark modules on white, the way round the spec requires: inverted codes
 * are read by some scanners and not others, and a wallet that cannot read this
 * one costs someone their deposit.
 */
export const QrBlock = ({ value, size = 112 }: { value?: string | null | undefined; size?: number }) => {
  const path = useMemo(() => (value ? qrPath(value) : null), [value]);

  /* No address yet: a placeholder that is plainly one, not something that looks scannable. */
  if (path === null) return <View style={[s.empty, { width: size, height: size }]} />;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.extent} ${path.extent}`}
      accessibilityLabel="Your Solana address as a QR code"
      style={s.code}
    >
      <Rect width={path.extent} height={path.extent} fill="#FFFFFF" />
      <Path d={path.d} fill={color.ink} />
    </Svg>
  );
};

const s = StyleSheet.create({
  code: { borderRadius: radius.md, overflow: "hidden" },
  empty: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.cardline,
    backgroundColor: color.tile,
  },
});
