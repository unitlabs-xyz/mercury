import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
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
import { SendSubmissionUncertain, useMoney, useSendAction } from "../src/api";
import { Haptics } from "../src/haptics";
import { SOLANA_ADDRESS, setScanned, useScanned } from "../src/scan";
import { AmountWell, Button, Icon, IconButton, Note, PressableScale, Text, useBottomGap } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * Sending USDC, set as the web's Send panel: the amount in a white well with
 * Max beside it, the address in a matching well, the one rule that cannot be
 * undone, then the single action.
 *
 * Three steps, as the web's: the form, a review that spells out exactly what
 * will be signed, then the result. The server builds the transfer and checks
 * it by simulation; the embedded wallet signs; the relay broadcasts. An
 * unclear outcome is said as one — check Activity before sending again —
 * because a second try could be a second transfer.
 */
export default function Send() {
  const router = useRouter();
  const bottom = useBottomGap();
  const available = Number(useMoney().data?.balanceUsd ?? 0);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const action = useSendAction();

  const amount = Number(text) || 0;
  const overdrawn = amount > available;
  const address = to.trim();
  const badAddress = address.length > 0 && !SOLANA_ADDRESS.test(address);
  /* The server takes at most six decimals, USDC's own precision. */
  const validAmount = /^\d+(?:\.\d{1,6})?$/.test(text) && amount > 0;
  const ready = validAmount && !overdrawn && address.length > 0 && !badAddress;
  const uncertain = action.error instanceof SendSubmissionUncertain;

  const send = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.mutate(
      { amount: text, to: address },
      {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      },
    );
  };

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
              <Text variant="title">
                {action.isSuccess ? "USDC sent" : reviewing ? "Review transfer" : "Send USDC"}
              </Text>
              {!action.isSuccess && (
                <RNText style={s.lede}>
                  {reviewing
                    ? "Check it once more. Your wallet signs when you send."
                    : `${usd(available)} available. Solana network only.`}
                </RNText>
              )}
            </View>

            {action.isSuccess ? (
              <View style={[s.card, s.done]}>
                <View style={s.tick}>
                  <Icon name="check" size={20} color={color.up} strokeWidth={2.4} />
                </View>
                <RNText style={s.doneTitle}>
                  {action.data.status === "confirmed" ? "Transfer confirmed" : "Transfer submitted"}
                </RNText>
                <RNText style={s.doneBody}>
                  {`${usd(amount)} to ${address.slice(0, 6)}…${address.slice(-6)}`}
                  {action.data.status === "pending" ? ". Confirmation is still pending." : "."}
                </RNText>
                <PressableScale
                  activeScale={0.97}
                  onPress={() => void Linking.openURL(`https://solscan.io/tx/${action.data.signature}`)}
                >
                  <RNText style={s.pasteText}>View on Solscan ›</RNText>
                </PressableScale>
              </View>
            ) : reviewing ? (
              <View style={[s.card, s.body]}>
                <View style={s.review}>
                  <Line k="Amount" v={`${usd(amount)} USDC`} />
                  <Line k="To" v={address} mono />
                  <Line k="Network" v="Solana" />
                  <Line k="Network fee" v="A little SOL, from your wallet" />
                </View>
                <Note tone="warn">Sending is final. Nobody can reverse it, including us.</Note>
                {action.error !== null && (
                  <Note tone={uncertain ? "warn" : "down"}>{action.error.message}</Note>
                )}
              </View>
            ) : (
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
            )}
          </ScrollView>

          <View style={[s.footer, { paddingBottom: bottom }]}>
            {action.isSuccess ? (
              <Button label="Done" onPress={() => router.back()} />
            ) : reviewing ? (
              <View style={s.row}>
                <View style={s.fill}>
                  <Button
                    label="Back"
                    variant="secondary"
                    disabled={action.isPending}
                    onPress={() => {
                      action.reset();
                      setReviewing(false);
                    }}
                  />
                </View>
                <View style={s.wide}>
                  <Button
                    label={action.walletReady ? `Send ${usd(amount)}` : "Getting your wallet ready"}
                    busy={action.isPending}
                    /* After an uncertain submission, never offer the same transfer again. */
                    disabled={!action.walletReady || uncertain}
                    onPress={send}
                  />
                </View>
              </View>
            ) : (
              <Button
                label={ready ? `Review send of ${usd(amount)}` : "Review send"}
                disabled={!ready}
                onPress={() => setReviewing(true)}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const Line = ({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) => (
  <View style={s.line}>
    <RNText style={s.lineKey}>{k}</RNText>
    <RNText style={[s.lineValue, mono && s.mono]} selectable>
      {v}
    </RNText>
  </View>
);

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
  row: { flexDirection: "row", gap: space.sm },
  wide: { flex: 1.6 },
  review: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.md },
  line: { gap: 4 },
  lineKey: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  lineValue: { fontFamily: font.medium, fontSize: 14.5, color: color.ink },
  mono: { fontFamily: "Menlo", fontSize: 13, lineHeight: 19 },
  done: { alignItems: "center", padding: space.lg, gap: space.sm },
  tick: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.upChip,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: {
    marginTop: space.xs,
    fontFamily: font.medium,
    fontSize: 20,
    letterSpacing: -0.4,
    color: color.ink,
  },
  doneBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: color.muted,
    textAlign: "center",
  },
});
