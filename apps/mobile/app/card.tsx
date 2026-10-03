import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, IconButton, Mark, Segmented, StatusChip, Text } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

type Finish = "basic" | "silver" | "gold" | "platinum";

/**
 * The web's card finishes (`cards/CardArt.tsx`), stop for stop. A metal card is
 * a highlight travelling across a surface, so each is a swept gradient rather
 * than a flat fill.
 */
const FINISHES: Record<Finish, readonly [string, string, ...string[]]> = {
  basic: ["#1b5f86", "#2f8fc0", "#7fc6e8", "#2a7ba8", "#5aa9d4", "#1f6b93"],
  silver: ["#eeedea", "#cfccc4", "#f8f7f4", "#bfbbb2", "#e7e5e0", "#c8c4ba", "#f2f1ee"],
  gold: ["#f3e6c4", "#d9bd77", "#fbf4dd", "#c9a84f", "#eeddb0", "#cfae58", "#f7efd8"],
  platinum: ["#f4f3f0", "#d8d5cd", "#fbfaf8", "#c9c5bb", "#eeece7", "#d2cec4", "#f6f5f2"],
};

/** The plans, as the web's card page lists them. */
const PLANS: Record<Finish, { name: string; rows: readonly [string, string][] }> = {
  basic: {
    name: "Basic",
    rows: [
      ["Annual fee", "Free"],
      ["Monthly limit", "$2,000"],
      ["Credit mode cashback", "0.5%"],
      ["Airport lounges", "—"],
    ],
  },
  silver: {
    name: "Silver",
    rows: [
      ["Annual fee", "$99 a year"],
      ["Monthly limit", "$20,000"],
      ["Credit mode cashback", "1%"],
      ["Airport lounges", "1 free visit a year"],
    ],
  },
  gold: {
    name: "Gold",
    rows: [
      ["Annual fee", "$249 a year"],
      ["Monthly limit", "$200,000"],
      ["Credit mode cashback", "1.5%"],
      ["Airport lounges", "4 free visits a year"],
    ],
  },
  platinum: {
    name: "Platinum",
    rows: [
      ["Annual fee", "$999 a year"],
      ["Monthly limit", "$750,000"],
      ["Credit mode cashback", "2%"],
      ["Airport lounges", "Unlimited"],
    ],
  },
};

const TIERS = (Object.keys(PLANS) as Finish[]).map((key) => ({ key, label: PLANS[key].name }));

const MODES: readonly { title: string; icon: "wallet" | "key"; lines: readonly string[] }[] = [
  {
    title: "Cash mode",
    icon: "wallet",
    lines: [
      "Spend the cash in your account",
      "No hidden spread, no FX games",
      "Settles instantly from your balance",
    ],
  },
  {
    title: "Credit mode",
    icon: "key",
    lines: [
      "Borrow against your stocks at the moment you tap",
      "Your shares stay invested",
      "Your position stays whole",
    ],
  },
];

const STEPS: readonly [string, string][] = [
  ["Turn it on in the app", "Your virtual card is ready the moment you are approved."],
  ["Build a portfolio", "Buy shares of real companies and funds. They stay yours and stay invested."],
  ["Tap on your terms", "Choose cash or credit at the till. Switch whenever you like."],
];

/**
 * The Mercury card, ahead of launch: the card itself in each plan's finish,
 * what it does and what each plan costs — and, plainly, that it is not here
 * yet. Nothing on this page takes an application.
 */
export default function Card() {
  const router = useRouter();
  const [finish, setFinish] = useState<Finish>("platinum");
  const plan = PLANS[finish];

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <CardArt finish={finish} tier={plan.name} />
            <View style={s.tiers}>
              <Segmented options={TIERS} value={finish} onChange={setFinish} fill onPage />
            </View>
          </View>

          <View style={s.intro}>
            <StatusChip tone="warn" size="md">
              Coming soon
            </StatusChip>
            <Text variant="title" style={s.headline}>
              Spend without selling
            </Text>
            <RNText style={s.body}>
              A Visa card on your Mercury account. Pay with your cash, or borrow against your stocks at the
              moment you tap, so your shares stay invested while you spend.
            </RNText>
          </View>

          {/* The chosen plan */}
          <View style={s.card}>
            <RNText style={[s.label, s.cardHead]}>{`${plan.name} plan`}</RNText>
            <View style={s.panel}>
              {plan.rows.map(([k, v]) => (
                <View key={k} style={s.fact}>
                  <RNText style={s.factKey}>{k}</RNText>
                  <RNText style={s.factVal}>{v}</RNText>
                </View>
              ))}
            </View>
          </View>

          {/* Two ways to pay */}
          <View style={s.modes}>
            {MODES.map((m) => (
              <View key={m.title} style={[s.card, s.mode]}>
                <View style={s.modeIcon}>
                  <Icon name={m.icon} size={17} color={color.ink} strokeWidth={1.7} />
                </View>
                <RNText style={s.label}>{m.title}</RNText>
                {m.lines.map((l) => (
                  <View key={l} style={s.line}>
                    <Icon name="check" size={13} color={color.up} strokeWidth={2.2} style={s.check} />
                    <RNText style={s.lineText}>{l}</RNText>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* How it works */}
          <View style={[s.card, s.how]}>
            <RNText style={s.label}>How it will work</RNText>
            {STEPS.map(([title, body], k) => (
              <View key={title} style={s.step}>
                <View style={s.stepNo}>
                  <RNText style={s.stepNoText}>{k + 1}</RNText>
                </View>
                <View style={s.fill}>
                  <RNText style={s.stepTitle}>{title}</RNText>
                  <RNText style={s.stepBody}>{body}</RNText>
                </View>
              </View>
            ))}
          </View>

          <View style={s.cta}>
            <Button label="Coming soon" disabled />
            <RNText style={s.note}>
              The card is not available yet. When it opens, it will show up here first. Plans and terms may
              change before launch.
            </RNText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** The card, at the real thing's proportions, in the chosen plan's finish. */
const CardArt = ({ finish, tier }: { finish: Finish; tier: string }) => {
  const light = finish !== "basic";
  const ink = light ? color.ink : color.onBand;
  return (
    <View style={s.art}>
      <LinearGradient
        colors={FINISHES[finish]}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />
      {/* The sheen: light from the top left, a shade at the far corner. */}
      <LinearGradient
        colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0)", "rgba(27,26,23,0.12)"]}
        locations={[0, 0.42, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.artInner}>
        <View style={s.brand}>
          <Mark size={20} color={ink} />
          <RNText style={[s.brandText, { color: ink }]}>Mercury</RNText>
        </View>
        <View style={s.artBottom}>
          <RNText style={[s.chipLabel, { color: ink }]}>•••• 4821</RNText>
          <View style={s.visaBlock}>
            <RNText style={[s.visa, { color: ink }]}>VISA</RNText>
            <RNText style={[s.tier, { color: ink }]}>{tier.toUpperCase()}</RNText>
          </View>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.xxl, gap: space.md },
  hero: { paddingHorizontal: space.screen, gap: space.lg },
  art: {
    aspectRatio: 1.586,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(27,26,23,0.08)",
  },
  artInner: { flex: 1, padding: "7%", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontFamily: font.bold, fontSize: 17, letterSpacing: -0.3 },
  artBottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  chipLabel: { fontFamily: "Menlo", fontSize: 13, opacity: 0.7, letterSpacing: 1 },
  visaBlock: { alignItems: "flex-end" },
  /* Diatype has no italic, so the wordmark's slant is drawn rather than asked for. */
  visa: {
    fontFamily: font.bold,
    fontSize: 30,
    letterSpacing: -0.9,
    lineHeight: 32,
    transform: [{ skewX: "-12deg" }],
  },
  tier: { fontFamily: font.medium, fontSize: 9, letterSpacing: 1.5, opacity: 0.7, marginTop: 2 },
  tiers: {},
  intro: { paddingHorizontal: space.screen, paddingTop: space.sm, gap: space.sm },
  headline: { marginTop: 4 },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: color.muted },
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  cardHead: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.md },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.md },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  factKey: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  factVal: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "right", flexShrink: 1 },
  modes: { gap: space.md },
  mode: { padding: space.screen, gap: space.sm },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  line: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  check: { marginTop: 3 },
  lineText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  how: { padding: space.screen, gap: space.lg - 8 },
  step: { flexDirection: "row", gap: 13 },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNoText: { fontFamily: font.medium, fontSize: 12, color: color.ink },
  stepTitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, color: color.ink, marginTop: 3 },
  stepBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted, marginTop: 4 },
  cta: { paddingHorizontal: space.screen, paddingTop: space.sm, gap: space.md },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted, textAlign: "center" },
});
