import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usd } from "@mercury/view";
import { useMoney } from "../src/api";
import { SOLANA_ADDRESS, setScanned, useScanned } from "../src/scan";
import { AmountWell, Button, Icon, IconButton, Note, PressableScale, Text, useBottomGap } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * Sending USDC, set as the web's Send panel: the amount in a white well with
 * Max beside it, the address in a matching well, the one rule that cannot be
 * undone, then the single action.
 *
 * The phone cannot send yet. Nothing on the server builds a transfer for a
 * wallet to sign — the web's panel stops at the same place — so the button
 * says the backend is coming rather than collecting an address it would drop.
 */
export default function Send() {
  const router = useRouter();
  const bottom = useBottomGap();
  const available = Number(useMoney().data?.balanceUsd ?? 0);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");

  const amount = Number(text) || 0;
  const overdrawn = amount > available;
  const badAddress = to.trim().length > 0 && !SOLANA_ADDRESS.test(to.trim());

  const paste = async () => setTo((await Clipboard.getStringAsync()).trim());

  /* An address the scanner found: take it once, then clear it so it cannot refill a later send. */
  const scanned = useScanned();
  useEffect(() => {
    if (scanned === null) return;
    setTo(scanned);
    setScanned(null);
  }, [scanned]);

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.head}>
              <Text variant="title">Send USDC</Text>
              <RNText style={s.lede}>{`${usd(available)} available. Solana network only.`}</RNText>
            </View>

            <View style={[s.card, s.body]}>
              <AmountWell
                label="Amount"
                value={text}
                onChange={setText}
                max={available}
                note={`${usd(available)} available to send`}
                invalid={overdrawn}
              />
              {overdrawn && <Note tone="down">{`More than you have. ${usd(available)} available.`}</Note>}

              <View style={s.panel}>
                <RNText style={s.label}>To</RNText>
                <View style={[s.well, badAddress && s.invalid]}>
                  <TextInput
                    value={to}
                    onChangeText={setTo}
                    placeholder="Solana address"
                    placeholderTextColor="rgba(101,101,101,0.7)"
                    selectionColor={color.brand}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    style={s.address}
                    accessibilityLabel="Destination Solana address"
                  />
                  {to.length === 0 && (
                    <PressableScale onPress={() => void paste()} haptic={false} style={s.paste}>
                      <RNText style={s.pasteText}>Paste</RNText>
                    </PressableScale>
                  )}
                  <PressableScale
                    onPress={() => router.push("/scan")}
                    style={s.scan}
                    accessibilityRole="button"
                    accessibilityLabel="Scan a QR code"
                  >
                    <Icon name="scan" size={18} color={color.ink} />
                  </PressableScale>
                </View>
                <RNText style={s.hint}>A wallet on Solana that accepts USDC</RNText>
              </View>
              {badAddress && <Note tone="down">That does not look like a Solana address.</Note>}

              <Note tone="warn">
                Sending is final. Check the address: nobody can reverse it, including us.
              </Note>
            </View>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: bottom }]}>
            <RNText style={s.soon}>
              Sending from the phone is not connected yet. The backend that builds the transfer comes next.
            </RNText>
            <Button
              label={amount > 0 && !overdrawn ? `Review send of ${usd(amount)}` : "Review send"}
              disabled
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.lg, gap: space.md },
  head: { paddingHorizontal: space.screen, gap: 4 },
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  card: { marginHorizontal: space.screen, borderRadius: radius.lg, backgroundColor: color.surface },
  body: { padding: space.md, gap: space.md },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs },
  label: {
    fontFamily: font.regular,
    fontSize: 14,
    color: color.muted,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: 10,
  },
  well: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  invalid: { borderColor: color.down },
  address: { flex: 1, fontFamily: "Menlo", fontSize: 13, color: color.ink, padding: 0 },
  paste: { paddingLeft: space.sm, paddingVertical: 6 },
  scan: {
    width: 34,
    height: 34,
    marginLeft: space.sm,
    marginRight: -8,
    borderRadius: radius.sm,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  pasteText: { fontFamily: font.medium, fontSize: 13, color: color.link },
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.muted,
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: space.sm,
  },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: color.page,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  soon: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted, textAlign: "center" },
});
