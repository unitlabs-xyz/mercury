import { useCallback, useState, type ReactNode } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text as RNText, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrivy } from "@privy-io/expo";
import { useMoney } from "../src/api";
import { Haptics } from "../src/haptics";
import { setPref, usePrefs } from "../src/prefs";
import { Button, Icon, IconButton, PressableScale, Text, type IconName } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/** The web's support address, so both clients send people to the same inbox. */
const SUPPORT = "mailto:support@trymercury.xyz";

/** "6xyD…z9fv": an address short enough for a row. */
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Settings, kept small on purpose: who you are, the wallet the account lives
 * in, the two preferences worth having, where to get help, and the way out.
 * The web's account menu holds the same few things; more can arrive when there
 * is something to set.
 */
export default function Settings() {
  const router = useRouter();
  const { user, logout } = usePrivy();
  const prefs = usePrefs();
  const address = useMoney().data?.depositAddress ?? null;
  const [copied, setCopied] = useState(false);

  const email =
    (user?.linked_accounts.find((a) => a.type === "email") as { address?: string } | undefined)?.address ??
    null;

  const copy = useCallback(async () => {
    if (address === null) return;
    await Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [address]);

  const signOut = () =>
    Alert.alert(
      "Sign out of Mercury?",
      "Your money stays in your wallet. Sign in again with the same email to see it.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void logout() },
      ],
    );

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.head}>
            <Text variant="title">Settings</Text>
          </View>

          {/* Who */}
          <View style={[s.card, s.profile]}>
            <View style={s.avatar}>
              <RNText style={s.avatarText}>{(email ?? "M").slice(0, 1).toUpperCase()}</RNText>
            </View>
            <View style={s.fill}>
              <RNText style={s.name} numberOfLines={1}>
                {email ?? "Signed in"}
              </RNText>
              <RNText style={s.sub}>Mercury account</RNText>
            </View>
          </View>

          <Group title="Wallet">
            <Row
              icon="wallet"
              title="Your Solana address"
              detail={address === null ? "Loading…" : short(address)}
              trailing={copied ? "Copied" : "Copy"}
              onPress={() => void copy()}
            />
            <Row
              icon="globe"
              title="View on Solscan"
              detail="Every transaction, on chain"
              chevron
              onPress={
                address === null
                  ? undefined
                  : () => void Linking.openURL(`https://solscan.io/account/${address}`)
              }
            />
          </Group>

          <Group title="Preferences">
            <Row
              icon="eyeOff"
              title="Hide balances on open"
              detail="For checking the app in company"
              toggle={{ value: prefs.hideBalances, onChange: (v) => setPref("hideBalances", v) }}
            />
            <Row
              icon="pulse"
              title="Haptic feedback"
              detail="A light tap when you press"
              toggle={{ value: prefs.haptics, onChange: (v) => setPref("haptics", v) }}
            />
          </Group>

          <Group title="Help">
            <Row
              icon="mail"
              title="Contact support"
              detail="support@trymercury.xyz"
              chevron
              onPress={() => void Linking.openURL(SUPPORT)}
            />
          </Group>

          <Group title="About">
            <Row icon="help" title="Version" trailing={Constants.expoConfig?.version ?? "—"} />
            <Row icon="shield" title="Network" trailing="Solana mainnet" />
          </Group>

          <View style={s.out}>
            <Button label="Sign out" variant="secondary" icon="signOut" onPress={signOut} />
            <RNText style={s.note}>Your holdings are in your own wallet, not with us.</RNText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={s.group}>
    <RNText style={s.groupTitle}>{title}</RNText>
    <View style={s.card}>
      <View style={s.panel}>{children}</View>
    </View>
  </View>
);

/**
 * One setting: an icon, what it is, a line of detail, and on the right a
 * value, a switch or a chevron. Pressable only when it does something.
 */
const Row = ({
  icon,
  title,
  detail,
  trailing,
  chevron,
  toggle,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  trailing?: string;
  chevron?: boolean;
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  onPress?: (() => void) | undefined;
}) => {
  const inner = (
    <>
      <View style={s.glyph}>
        <Icon name={icon} size={16} color={color.ink} strokeWidth={1.7} />
      </View>
      <View style={s.fill}>
        <RNText style={s.rowTitle}>{title}</RNText>
        {detail !== undefined && <RNText style={s.rowDetail}>{detail}</RNText>}
      </View>
      {trailing !== undefined && <RNText style={s.trailing}>{trailing}</RNText>}
      {toggle !== undefined && (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ true: color.ink, false: color.divider }}
        />
      )}
      {chevron === true && <Icon name="chevronRight" size={14} color={color.chevron} />}
    </>
  );
  /* A toggle row flips from anywhere on it, as iOS's own Settings rows do, not only from the switch. */
  const press = onPress ?? (toggle === undefined ? undefined : () => toggle.onChange(!toggle.value));
  if (press === undefined) return <View style={s.row}>{inner}</View>;
  return (
    <PressableScale
      onPress={press}
      activeScale={0.985}
      style={s.row}
      accessibilityRole={toggle === undefined ? "button" : "switch"}
      accessibilityState={toggle === undefined ? undefined : { checked: toggle.value }}
    >
      {inner}
    </PressableScale>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.xxl, gap: space.md },
  head: { paddingHorizontal: space.screen },
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  profile: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.band,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: font.medium, fontSize: 20, color: color.onBand },
  name: { fontFamily: font.medium, fontSize: 16, lineHeight: 20, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 2 },
  group: { gap: space.sm },
  groupTitle: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.muted,
    paddingHorizontal: space.screen + 4,
  },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs, gap: space.xs },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  glyph: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, color: color.ink },
  rowDetail: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted, marginTop: 2 },
  trailing: { fontFamily: font.medium, fontSize: 13, color: color.muted },
  out: { paddingHorizontal: space.screen, paddingTop: space.sm, gap: space.md },
  note: { fontFamily: font.regular, fontSize: 12, color: color.muted, textAlign: "center" },
});
