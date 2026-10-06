import { useEffect, useRef, useState, type ComponentProps } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import type { Tabs } from "expo-router";
import { Haptics } from "../haptics";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  Easing,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";

/* What `Tabs` hands a custom bar. expo-router does not export the type by name. */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/*
 * One curve for the whole bar, so the segment, the label and the glyphs arrive
 * together. Eased, not sprung: a spring overshoots, and past 1 the closing
 * tab's label went to a negative width and the glyphs beside it jumped.
 */
const MOVE = { duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;

/** Where the bar sits, shared with anything drawn over it (the + menu). */
export const useBarGeometry = () => {
  const insets = useSafeAreaInsets();
  return { bottom: Math.max(insets.bottom - 8, space.md), side: space.screen - 4, height: HEIGHT };
};

/**
 * The tab bar: a dark pill of icons, the current tab opened out into a light
 * segment that names it, and the + beside the pill rather than inside it.
 *
 * Only the current tab carries a label. Four labels at a phone's width either
 * truncate or shrink to 10px, and the icons are learnt in a day; the one word
 * that matters is where you are, and that one is always spelled out.
 *
 * Changing tab runs one value, `t`, from 0 to 1 on a spring: the tab being left
 * closes by `t` while the one being entered opens by it, and nothing between
 * them moves. Their two widths always sum to the same, so the pill never
 * changes length — and going from the first tab to the last is one move, not a
 * trip through every tab on the way.
 */
export const TabBar = ({
  state,
  descriptors,
  navigation,
  icons,
  onPlus,
}: BottomTabBarProps & { icons: Record<string, IconName>; onPlus: () => void }) => {
  const { bottom, side } = useBarGeometry();
  const from = useSharedValue(state.index);
  const to = useSharedValue(state.index);
  const t = useSharedValue(1);
  const [inner, setInner] = useState(0);

  /* The tab being left, kept on this side: an animated value read back here can
     lag the UI thread by a frame and name the wrong tab. */
  const previous = useRef(state.index);

  useEffect(() => {
    if (previous.current === state.index) return;
    from.value = previous.current;
    to.value = state.index;
    previous.current = state.index;
    /* The reset is the first step of the animation, not a separate write: two
       writes in one frame can reach the UI thread as one, and the spring then
       starts at 1 and never moves. */
    t.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, MOVE));
  }, [state.index, from, to, t]);

  const count = state.routes.length;
  /* The open tab takes whatever the stops leave. Zero until the pill has been measured. */
  const open = inner === 0 ? 0 : inner - STOP * (count - 1) - GAP * (count - 1);

  return (
    <View style={[s.wrap, { bottom, left: side, right: side }]} pointerEvents="box-none">
      <View style={s.pill} onLayout={(e) => setInner(e.nativeEvent.layout.width - PAD * 2)}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === "string" ? options.title : route.name;

          const go = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Slot
              key={route.key}
              index={i}
              from={from}
              to={to}
              t={t}
              open={open}
              focused={focused}
              label={label}
              icon={icons[route.name] ?? "grid"}
              onPress={go}
            />
          );
        })}
      </View>

      <PressableScale
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        style={s.plus}
      >
        <Icon name="plus" size={22} color={color.onBand} strokeWidth={2} />
      </PressableScale>
    </View>
  );
};

const Slot = ({
  index,
  from,
  to,
  t,
  open,
  focused,
  label,
  icon,
  onPress,
}: {
  index: number;
  from: SharedValue<number>;
  to: SharedValue<number>;
  t: SharedValue<number>;
  open: number;
  focused: boolean;
  label: string;
  icon: IconName;
  onPress: () => void;
}) => {
  /* The label's natural width, read once from an invisible copy, so it can open from zero to exactly that. */
  const [textWidth, setTextWidth] = useState(0);

  /**
   * How open this tab is: 1 for the current one, 0 for any tab not in the move.
   * Handed the values rather than reading them itself: a style only re-runs for
   * shared values its own body reads, and one read inside a helper goes unseen.
   */
  const near = (f: number, d: number, p: number) => {
    "worklet";
    const q = Math.min(Math.max(p, 0), 1);
    if (index === d) return f === d ? 1 : q;
    if (index === f) return 1 - q;
    return 0;
  };

  const slot = useAnimatedStyle(() =>
    open === 0 ? {} : { width: interpolate(near(from.value, to.value, t.value), [0, 1], [STOP, open]) },
  );
  const ground = useAnimatedStyle(() => ({ opacity: near(from.value, to.value, t.value) }));
  const lit = useAnimatedStyle(() => ({ opacity: near(from.value, to.value, t.value) }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - near(from.value, to.value, t.value) }));
  const words = useAnimatedStyle(() => {
    const p = near(from.value, to.value, t.value);
    return { width: textWidth * p, marginLeft: 7 * p, opacity: p * p };
  });

  return (
    <Animated.View style={[open === 0 ? (focused ? s.slotOpen : s.slotStop) : null, slot]}>
      <PressableScale
        haptic={false}
        onPress={onPress}
        /* No press scale: the pill moving is the answer to the tap, and a
           scale settling after it read as a pulse. */
        activeScale={1}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={s.tab}
      >
        <Animated.View style={[s.ground, ground]} />
        <View style={s.glyph}>
          <Animated.View style={[s.layer, dim]}>
            <Icon name={icon} size={19} color={INACTIVE} strokeWidth={1.8} />
          </Animated.View>
          <Animated.View style={[s.layer, lit]}>
            <Icon name={icon} size={19} color={color.ink} strokeWidth={1.8} />
          </Animated.View>
        </View>
        <Animated.View style={[s.words, words]}>
          {/* At its full width throughout, clipped by the box opening around it,
              so the word never re-wraps or truncates mid-move. */}
          <RNText style={[s.label, textWidth > 0 && { width: textWidth }]} numberOfLines={1}>
            {label}
          </RNText>
        </Animated.View>
      </PressableScale>
      {/* Measured, never seen: the width the label opens to. */}
      <RNText
        style={[s.label, s.measure]}
        onLayout={(e) => setTextWidth(Math.ceil(e.nativeEvent.layout.width))}
        accessible={false}
      >
        {label}
      </RNText>
    </Animated.View>
  );
};

/* White at 55%: legible on the ink, and plainly not the one that is selected. */
const INACTIVE = "rgba(255,255,255,0.55)";
const HEIGHT = 60;
const PAD = 6;
const GAP = 2;
/* A closed tab: room for the glyph and a thumb, no more. */
const STOP = 52;

const s = StyleSheet.create({
  wrap: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 10 },
  pill: {
    flex: 1,
    height: HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    padding: PAD,
    gap: GAP,
    borderRadius: radius.pill,
    backgroundColor: color.band,
  },
  /* Before the pill is measured: the same layout, without the motion. */
  slotStop: { width: STOP },
  slotOpen: { flex: 1 },
  tab: {
    height: HEIGHT - PAD * 2,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ground: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, backgroundColor: color.surface },
  glyph: { width: 19, height: 19 },
  layer: { ...StyleSheet.absoluteFill },
  words: { overflow: "hidden" },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.28, color: color.ink },
  measure: { position: "absolute", opacity: 0, left: -999 },
  plus: {
    width: HEIGHT,
    height: HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: color.band,
    alignItems: "center",
    justifyContent: "center",
  },
});
