import { Dimensions, StyleSheet, Text as RNText, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Mark, Text } from "../src/ui";
import { color, font, space } from "../src/theme";

const { width } = Dimensions.get("screen");

/**
 * The door.
 *
 * Laid out the way the reference app's welcome screen is: the art runs
 * full-bleed rather than sitting in a card, the headline is stacked bottom-left
 * over the page's own ground, and the action is the last thing above the home
 * indicator. The top half belongs to the artwork.
 *
 * The art is drawn rather than photographed — the mark, oversized and cropped
 * by the right edge, over a brand gradient. A stock photograph would say
 * nothing this does not, and would weigh three megabytes.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <View style={s.art}>
        <LinearGradient
          colors={["#0A3238", "#0F7480", "#2AA0A8"]}
          locations={[0, 0.58, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Cropped by the right edge on purpose: a mark set whole and centred
            is a splash screen, and this is a surface somebody is about to act
            on. */}
        <View style={s.markSlot} pointerEvents="none">
          <Mark size={width * 1.15} color="rgba(255,255,255,0.14)" />
        </View>
      </View>

      {/* Reaches the page colour well before the headline starts. The gradient
          runs right through where the type sits, and a light wash was not
          enough — the type wins here, and the art keeps the top half. */}
      <LinearGradient
        colors={["rgba(243,243,243,0)", "rgba(243,243,243,0.86)", "rgba(243,243,243,0.99)", color.page]}
        locations={[0, 0.3, 0.52, 1]}
        style={s.scrim}
        pointerEvents="none"
      />

      <View style={[s.content, { paddingBottom: Math.max(insets.bottom, 18) + 16 }]}>
        {/* Two lines, flush left, so the headline reads as a block against the
            art rather than as a caption under it. */}
        <RNText style={s.heading}>Your wealth.{"\n"}Onchain.</RNText>

        <Text variant="body" tone="muted" style={s.sub}>
          Real US stocks, settled on Solana and held in a wallet only you control.
        </Text>

        <View style={s.actions}>
          <Button label="Continue with email" onPress={() => router.push("/sign-in")} />
          <Text variant="small" tone="muted" style={s.fine}>
            No seed phrase to write down. Export the wallet whenever you like.
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  art: { position: "absolute", top: 0, left: 0, right: 0, height: "66%", overflow: "hidden" },
  markSlot: { position: "absolute", right: -width * 0.42, top: "6%" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" },

  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.screen, gap: space.md },
  heading: { fontFamily: font.bold, fontSize: 44, lineHeight: 48, letterSpacing: -1.6, color: color.ink },
  sub: { maxWidth: 320 },
  actions: { gap: space.md, marginTop: space.lg },
  fine: { textAlign: "center", paddingHorizontal: space.md },
});
