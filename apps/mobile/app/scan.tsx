import { useRef, useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Haptics } from "../src/haptics";
import { addressFrom, setScanned } from "../src/scan";
import { Button, IconButton } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * Scan a wallet's QR code for its address.
 *
 * Takes the first code that holds a Solana address, bare or as a Solana Pay
 * link, hands it back to Send and closes. A code that is not an address says
 * so on screen instead of filling the field with something that would fail.
 */
export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [wrong, setWrong] = useState(false);
  /* The camera reports the same code many times a second; act on the first. */
  const done = useRef(false);

  const onCode = (data: string) => {
    if (done.current) return;
    const address = addressFrom(data);
    if (address === null) {
      setWrong(true);
      return;
    }
    done.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setScanned(address);
    router.back();
  };

  if (permission === null) return <View style={s.root} />;

  if (!permission.granted) {
    return (
      <View style={[s.root, s.ask, { paddingTop: insets.top + space.lg }]}>
        <RNText style={s.askTitle}>Allow the camera to scan</RNText>
        <RNText style={s.askBody}>
          Mercury only uses it to read a wallet&apos;s QR code. Nothing is recorded or kept.
        </RNText>
        <View style={s.askButtons}>
          <Button label="Allow camera" onPress={() => void requestPermission()} />
          <Button label="Not now" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
      <View style={[s.top, { paddingTop: insets.top + space.sm }]}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      {/* The frame says where to point; everything outside it is dimmed. */}
      <View style={s.center} pointerEvents="none">
        <View style={s.frame} />
        <RNText style={s.caption}>
          {wrong ? "That code is not a Solana address. Try another." : "Point at a wallet's QR code"}
        </RNText>
      </View>
    </View>
  );
}

const FRAME = 248;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", left: space.screen, right: space.screen, flexDirection: "row" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: space.lg },
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
  },
  caption: {
    fontFamily: font.medium,
    fontSize: 15,
    color: color.onBand,
    textAlign: "center",
    paddingHorizontal: space.xl,
  },
  ask: { backgroundColor: color.page, paddingHorizontal: space.screen, gap: space.md },
  askTitle: { fontFamily: font.medium, fontSize: 24, color: color.ink },
  askBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.muted },
  askButtons: { gap: space.sm, marginTop: space.md },
});
