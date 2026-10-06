import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { radius } from "../theme";

/* Every skeleton's sweep is timed from one clock, so a screen of them moves
   as one sheet of light rather than a dozen bars each on its own beat. */
const PERIOD = 1300;
const started = Date.now();

/**
 * A figure that has not arrived yet.
 *
 * Drawn at the size of the thing it stands in for, so nothing shifts when the
 * real number lands. A light band sweeps across it, left to right, which reads
 * as "on its way" where a spinner reads only as "busy".
 */
export const Skeleton = ({
  width,
  height = 14,
  style,
  dark = false,
}: {
  width: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  /** On the ink band: a faint light bar, and a fainter sweep. */
  dark?: boolean;
}) => {
  const [w, setW] = useState(typeof width === "number" ? width : 0);
  const t = useSharedValue(((Date.now() - started) % PERIOD) / PERIOD);

  useEffect(() => {
    /* Picks up where the shared clock is, then loops the full width. */
    const from = t.value;
    const lap = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: PERIOD, easing: Easing.linear }),
    );
    t.value = withSequence(
      withTiming(1, { duration: PERIOD * (1 - from), easing: Easing.linear }),
      withRepeat(lap, -1, false),
    );
  }, [t]);

  /* The band enters from just off the left edge and leaves just off the right. */
  const band = Math.max(60, w * 0.6);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -band + t.value * (w + band) }] }));

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[s.bar, dark && s.dark, { width, height, borderRadius: Math.min(height / 2, radius.sm) }, style]}
    >
      {w > 0 && (
        <Animated.View style={[s.band, { width: band }, sweep]}>
          <LinearGradient
            colors={["rgba(255,255,255,0)", `rgba(255,255,255,${dark ? 0.1 : 0.75})`, "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  /* A shade under the grey panel, so a bar reads on white and on #F7F7F7 alike. */
  bar: { backgroundColor: "#ECECEC", overflow: "hidden" },
  dark: { backgroundColor: "rgba(255,255,255,0.08)" },
  band: { position: "absolute", top: 0, bottom: 0, left: 0 },
});
