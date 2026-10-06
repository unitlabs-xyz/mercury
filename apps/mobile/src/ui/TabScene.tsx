import { useCallback, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/* How far a page travels on its way in. Enough to say which way, not a slide. */
const SHIFT = 28;
const IN = { duration: 260, easing: Easing.out(Easing.cubic) };

/* The tab last shown, so the next one knows which side it comes from. */
let current = 0;

/**
 * A tab's way in: it fades up from the side it lives on.
 *
 * This used to be the tab navigator's own scene interpolator, which animates
 * every tab's opacity with the native driver and detaches the ones not shown.
 * A transition cut short — a quick second tap, a reload mid-fade — could leave
 * a tab re-attached at opacity zero: a blank page under a bar that said Invest.
 * Here each tab runs its own fade on focus, and every path through it ends at
 * one, so the worst an interruption can do is skip the motion.
 */
export const TabScene = ({ index, children }: { index: number; children: ReactNode }) => {
  const opacity = useSharedValue(1);
  const x = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      const dir = Math.sign(index - current);
      current = index;
      if (dir === 0) return;
      opacity.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, IN));
      x.value = withSequence(withTiming(dir * SHIFT, { duration: 0 }), withTiming(0, IN));
    }, [index, opacity, x]),
  );

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value }] }));
  return <Animated.View style={[s.fill, style]}>{children}</Animated.View>;
};

const s = StyleSheet.create({ fill: { flex: 1 } });
