import { useCallback, useState } from "react";
import { Share, StyleSheet, Text as RNText, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMoney } from "../src/api";
import { Button, Note, PanelHeader, QrBlock } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * The address as two even lines. Left to wrap, 44 characters break wherever
 * the width runs out, leaving a long line over a stub; split in the middle it
 * reads as two halves to check against the other wallet.
 */
const halves = (address: string) => {
  const mid = Math.ceil(address.length / 2);
  return `${address.slice(0, mid)}\n${address.slice(mid)}`;
};

/** A button that says it worked for a moment after it did. */
const useFlag = () => {
  const [on, setOn] = useState(false);
  const flag = useCallback(() => {
    setOn(true);
    setTimeout(() => setOn(false), 1600);
  }, []);
  return [on, flag] as const;
};

/**
 * Adding cash, in the system's own sheet.
 *
 * Presented as a form sheet by the root stack, so it has iOS's grabber, its
 * spring, its swipe to dismiss and its dimming — the parts a hand-built sheet
 * gets nearly right and a thumb notices.
 *
 * The content is the web's Add cash panel: the rule that loses money if broken
 * comes first, then the code, large enough to scan from across a desk, with the
 * address under it rather than squeezed beside it, then the two ways to hand
 * it over.
 */
export default function AddCash() {
  const router = useRouter();
  const address = useMoney().data?.depositAddress ?? null;
  const [copied, flag] = useFlag();

  const copy = async () => {
    if (address === null) return;
    await Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flag();
  };

  const share = () => {
    if (address === null) return;
    void Share.share({ message: `My Mercury address: ${address}` });
  };

  return (
    <View style={s.root}>
      <PanelHeader
        title="Add cash"
        sub="It starts earning the moment it arrives."
        onClose={() => router.back()}
      />
      <View style={s.body}>
        <Note tone="warn">
          Solana network only, and USDC only. Anything sent on another network, or in another token, is lost.
        </Note>

        <View style={s.panel}>
          <View style={s.code}>
            <QrBlock value={address} size={196} />
          </View>
          <RNText style={s.caption}>Your Solana address</RNText>
          <RNText style={s.mono} selectable>
            {address === null ? "Loading your address…" : halves(address)}
          </RNText>
        </View>

        <View style={s.buttons}>
          <View style={s.half}>
            <Button
              size="md"
              icon={copied ? "check" : "copy"}
              label={copied ? "Copied" : "Copy address"}
              disabled={address === null}
              onPress={() => void copy()}
            />
          </View>
          <View style={s.half}>
            <Button size="md" variant="secondary" label="Share" disabled={address === null} onPress={share} />
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: color.surface, paddingTop: space.md, paddingBottom: space.md },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs },
  panel: {
    alignItems: "center",
    backgroundColor: color.tile,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.screen,
  },
  /* White behind the code to its own edge: the quiet zone is part of the code. */
  code: { padding: space.sm, borderRadius: radius.lg, backgroundColor: "#FFFFFF" },
  caption: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    color: color.muted,
    marginTop: space.lg,
  },
  mono: {
    fontFamily: "Menlo",
    fontSize: 13,
    lineHeight: 19,
    color: color.ink,
    textAlign: "center",
    marginTop: 6,
  },
  buttons: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  half: { flex: 1 },
});
