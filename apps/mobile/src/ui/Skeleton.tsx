import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { color, radius } from "../theme";

/**
 * A figure that has not arrived yet.
 *
 * Drawn at the size of the thing it stands in for, so nothing shifts when the
 * real number lands. A spinner in its place would say "working" where this says
 * "a number goes here", and the second is what somebody opening a balance
 * screen needs to know.
 */
export const Skeleton = ({
  width,
  height = 14,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}) => {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 820 }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[s.bar, { width, height, borderRadius: Math.min(height / 2, radius.sm) }, style, animated]}
    />
  );
};

const s = StyleSheet.create({ bar: { backgroundColor: color.divider } });
