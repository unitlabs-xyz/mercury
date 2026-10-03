import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { BlurView } from "expo-blur";
import { Haptics } from "../haptics";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Icon, PressableScale, useBarGeometry, type IconName } from "../ui";
import { color, font, radius, space } from "../theme";

/** What to open: the menu over the bar, or Add cash in its sheet. */
type Pane = "menu" | "addCash";

const Actions = createContext<(view?: Pane) => void>(() => undefined);

/** Opens the quick actions, on the menu or straight onto one action. */
export const useActions = () => useContext(Actions);

/**
 * The quick actions, behind the tab bar's + and the home screen's buttons.
 *
 * The menu grows out of the + itself. The page frosts over rather than going
 * dark, so what you were looking at stays in view behind it; the + turns into
 * a close mark; and the actions rise above it as separate frosted pills, the
 * nearest first and each one above a beat later, so they stack up out of the
 * button instead of appearing as a card.
 *
 * Add cash is a task with an address to copy, so it opens in the system sheet
 * (the `add-cash` route) rather than in this menu.
 */
export const ActionsProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const open = useCallback(
    (next: Pane = "menu") => (next === "menu" ? setMenu(true) : router.push("/add-cash")),
    [router],
  );

  return (
    <Actions.Provider value={open}>
      <View style={s.fill}>
        {children}
        <Menu
          open={menu}
          onClose={() => setMenu(false)}
          onPick={(then) => {
            setMenu(false);
            then();
          }}
        />
      </View>
    </Actions.Provider>
  );
};

const Menu = ({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (then: () => void) => void;
}) => {
  const router = useRouter();
  const { bottom, side, height } = useBarGeometry();
  /* Mounted while open and through the close, so it can animate out. */
  const [shown, setShown] = useState(open);
  const t = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setShown(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    } else {
      t.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
        if (done === true) runOnJS(setShown)(false);
      });
    }
  }, [open, t]);

  const frost = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 0.5], [0, 1], "clamp") }));
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(t.value, [0, 1], [0, 135])}deg` }],
  }));

  if (!shown) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, frost]}>
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        {/* A wash over the blur, so the page behind reads as set aside, not just soft. */}
        <View style={[StyleSheet.absoluteFill, s.wash]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <View style={[s.stack, { right: side, bottom: bottom + height + 14 }]} pointerEvents="box-none">
        {/* Every door the web has. Borrow and Send open their screens, which say
            plainly that the phone cannot complete them yet. */}
        <Pill t={t} order={5} icon="card" title="Card" onPress={() => onPick(() => router.push("/card"))} />
        <Pill
          t={t}
          order={4}
          icon="arrowUp"
          tilt
          title="Send"
          onPress={() => onPick(() => router.push("/send"))}
        />
        <Pill
          t={t}
          order={3}
          icon="key"
          title="Borrow"
          onPress={() => onPick(() => router.push("/borrow"))}
        />
        <Pill
          t={t}
          order={2}
          icon="blocks"
          title="Baskets"
          onPress={() => onPick(() => router.push("/baskets"))}
        />
        <Pill
          t={t}
          order={1}
          icon="plus"
          title="Add cash"
          onPress={() => onPick(() => router.push("/add-cash"))}
        />
        <Pill
          t={t}
          order={0}
          icon="trend"
          title="Buy a stock"
          onPress={() => onPick(() => router.navigate("/invest"))}
        />
      </View>

      {/* The + again, over the real one, turning into a close mark. */}
      <PressableScale
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        style={[s.close, { right: side, bottom, width: height, height }]}
      >
        <Animated.View style={turn}>
          <Icon name="plus" size={22} color={color.onBand} strokeWidth={2} />
        </Animated.View>
      </PressableScale>
    </View>
  );
};

/**
 * One action: a frosted pill, right-aligned over the +. `order` counts up from
 * the button, and each pill starts its fade and rise a little after the one
 * beneath it, so the stack builds upward.
 */
const Pill = ({
  t,
  order,
  icon,
  tilt,
  title,
  onPress,
  soon,
}: {
  t: SharedValue<number>;
  order: number;
  icon: IconName;
  tilt?: boolean;
  title: string;
  onPress?: () => void;
  soon?: boolean;
}) => {
  /* Six of them: a tighter beat than three had, so the last still lands promptly. */
  const start = order * 0.09;
  const enter = useAnimatedStyle(() => {
    const p = interpolate(t.value, [start, Math.min(start + 0.5, 1)], [0, 1], "clamp");
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * (16 + order * 6) }, { scale: 0.94 + 0.06 * p }],
    };
  });

  const face = (
    <>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.pillTint]} />
      <RNText style={[s.pillText, soon === true && s.soonText]}>{title}</RNText>
      {soon === true && (
        <View style={s.soon}>
          <RNText style={s.soonLabel}>Soon</RNText>
        </View>
      )}
      <View style={[s.glyph, soon === true && s.glyphSoon]}>
        <Icon
          name={icon}
          size={18}
          color={color.onBand}
          strokeWidth={1.8}
          style={tilt === true ? s.tilt : undefined}
        />
      </View>
    </>
  );

  return (
    <Animated.View style={enter}>
      {/* Send is shown so it is known to be coming, and not pressable: the web's
          panel stops short of sending, and a control that does nothing invites the tap. */}
      {soon === true ? (
        <View style={s.pill} accessibilityLabel={`${title}, coming soon`}>
          {face}
        </View>
      ) : (
        <PressableScale onPress={onPress} activeScale={0.96} style={s.pill} accessibilityRole="button">
          {face}
        </PressableScale>
      )}
    </Animated.View>
  );
};

const s = StyleSheet.create({
  fill: { flex: 1 },
  wash: { backgroundColor: "rgba(243,243,243,0.55)" },
  stack: { position: "absolute", alignItems: "flex-end", gap: 8 },
  pill: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingLeft: space.screen,
    paddingRight: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  pillTint: { backgroundColor: "rgba(255,255,255,0.62)" },
  pillText: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, letterSpacing: -0.3, color: color.ink },
  soonText: { color: color.muted },
  soon: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: radius.sm,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  soonLabel: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.band,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphSoon: { opacity: 0.35 },
  tilt: { transform: [{ rotate: "45deg" }] },
  close: {
    position: "absolute",
    borderRadius: radius.pill,
    backgroundColor: color.band,
    alignItems: "center",
    justifyContent: "center",
  },
});
