import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Haptics } from "../haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale at the bottom of the press. */
  activeScale?: number;
  /** A light tap on press. Off for anything that fires its own. */
  haptic?: boolean;
}

/**
 * Everything tappable goes through here.
 *
 * A phone answers a touch; a web page answers a click. The difference is that
 * the finger is already covering what it pressed, so the only confirmation
 * left is the shape moving under it and the taptic engine. `opacity` — React
 * Native's default — says "disabled" rather than "pressed".
 */
export const PressableScale = ({
  children,
  style,
  activeScale = 0.96,
  disabled,
  haptic = true,
  onPress,
  ...rest
}: PressableScaleProps) => {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (disabled !== true) scale.value = withSpring(activeScale, { damping: 18, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (disabled !== true && haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
};
