import { Image, StyleSheet, Text as RNText, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import hero from "../assets/images/hero.webp";
import { Button, Mark, useBottomGap } from "../src/ui";
import { color, font, space } from "../src/theme";

/* The landing page's ground (apps/landing/src/styles/global.css). */
const PAGE = "#EFEDE8";

/**
 * The door, after trymercury.xyz's hero: the site's light-and-field artwork
 * runs edge to edge across the top and fades into the same warm page, with
 * the headline, one line of what it is and the single action set on one left
 * edge below it.
 *
 * The artwork is the landing page's own file (apps/landing/src/assets/ui).
 * The type is the app's Diatype, so the first screen and every one after it
 * are set in the same face.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomGap();
  /* The artwork is a wide landscape (2000 by 840). Filling a portrait frame with
     it centred zooms into its flat grey middle, so it is drawn at the frame's
     height and anchored right, where the light breaks over the field. */
  const { height } = useWindowDimensions();
  const artHeight = Math.round(height * 0.56);

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <View style={[s.art, { height: artHeight }]}>
        <Image
          source={hero}
          style={[s.image, { height: artHeight, width: artHeight * (2000 / 840) }]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        {/* A shade at the top for the mark to sit on, and a fade at the foot into the page. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.28)", "rgba(0,0,0,0)"]}
          style={[s.shade, { height: insets.top + 90 }]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={["rgba(239,237,232,0)", "rgba(239,237,232,0.7)", PAGE]}
          locations={[0, 0.55, 1]}
          style={s.fade}
          pointerEvents="none"
        />
        <View style={[s.brand, { top: insets.top + space.sm }]}>
          <Mark size={30} color={color.onBand} />
          <RNText style={s.wordmark}>Mercury</RNText>
        </View>
      </View>

      <View style={[s.content, { paddingBottom: bottom }]}>
        <RNText style={s.heading}>The financial account built for the onchain world.</RNText>
        <RNText style={s.lead}>
          Hold your money, invest in stocks and ETFs, and access your wealth, all from a single wallet.
        </RNText>
        <View style={s.actions}>
          <Button label="Continue with email" onPress={() => router.push("/sign-in")} />
          <RNText style={s.fine}>No seed phrase to write down. Export the wallet whenever you like.</RNText>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE },
  art: { overflow: "hidden" },
  image: { position: "absolute", top: 0, right: 0 },
  shade: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 140 },
  brand: { position: "absolute", left: space.screen, flexDirection: "row", alignItems: "center", gap: 10 },
  wordmark: { fontFamily: font.bold, fontSize: 26, letterSpacing: -0.6, color: color.onBand },
  /* The words take the rest of the screen and sit at its foot, on one left edge. */
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.screen },
  heading: {
    fontFamily: font.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.1,
    color: color.ink,
  },
  lead: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.muted, marginTop: space.md },
  actions: { marginTop: space.xl, gap: space.md },
  fine: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted, textAlign: "center" },
});
