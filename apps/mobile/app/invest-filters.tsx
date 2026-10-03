import type { ReactNode } from "react";
import { StyleSheet, Switch, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import {
  DEFAULT_FILTERS,
  RANGES,
  SORTS,
  resetFilters,
  setFilters,
  useFilters,
  useListMeta,
} from "../src/invest/filters";
import { Button, Chip, PanelHeader, Segmented } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * Filter and sort, in the system's sheet: the range every row's chart and move
 * follows, the order, the sector, and whether to show only what you own.
 *
 * Every change applies at once to the list behind the sheet, and the button
 * says how many stocks it now holds, so there is no "apply" step to forget and
 * no surprise when the sheet goes.
 *
 * Sized to its content with no scroll view: a form sheet gives its content no
 * height to flex into, so a scrolling body collapsed under the header. The
 * options are chips so the whole set fits.
 */
export default function InvestFilters() {
  const router = useRouter();
  const f = useFilters();
  const { sectors, count } = useListMeta();
  const changed = f.range !== DEFAULT_FILTERS.range || f.sector !== "all" || f.sort !== "default" || f.owned;

  return (
    <View style={s.root}>
      <PanelHeader title="Filter and sort" onClose={() => router.back()} />
      <View style={s.body}>
        <Section title="Show changes over">
          <Segmented options={RANGES} value={f.range} onChange={(range) => setFilters({ range })} fill />
        </Section>

        <Section title="Sort by">
          <View style={s.wrap}>
            {SORTS.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                selected={f.sort === o.key}
                onPress={() => setFilters({ sort: o.key })}
              />
            ))}
          </View>
        </Section>

        {sectors.length > 1 && (
          <Section title="Sector">
            <View style={s.wrap}>
              <Chip
                label="All sectors"
                selected={f.sector === "all"}
                onPress={() => setFilters({ sector: "all" })}
              />
              {sectors.map((x) => (
                <Chip key={x} label={x} selected={f.sector === x} onPress={() => setFilters({ sector: x })} />
              ))}
            </View>
          </Section>
        )}

        <View style={[s.panel, s.toggle]}>
          <View style={s.toggleText}>
            <RNText style={s.toggleTitle}>Only stocks I own</RNText>
            <RNText style={s.hint}>Hide everything you do not hold yet.</RNText>
          </View>
          <Switch
            value={f.owned}
            onValueChange={(owned) => setFilters({ owned })}
            trackColor={{ true: color.ink, false: color.divider }}
          />
        </View>
      </View>

      <View style={s.footer}>
        <View style={s.clear}>
          <Button
            size="md"
            variant="secondary"
            label="Clear all"
            disabled={!changed}
            onPress={resetFilters}
          />
        </View>
        <View style={s.show}>
          <Button
            size="md"
            label={count === 1 ? "Show 1 stock" : `Show ${count} stocks`}
            onPress={() => router.back()}
          />
        </View>
      </View>
    </View>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={s.section}>
    <RNText style={s.sectionTitle}>{title}</RNText>
    {children}
  </View>
);

const s = StyleSheet.create({
  root: { backgroundColor: color.surface, paddingTop: space.md },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.lg },
  section: { gap: space.sm },
  sectionTitle: { fontFamily: font.medium, fontSize: 13, color: color.muted },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs },
  toggleTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  toggle: { flexDirection: "row", alignItems: "center", padding: space.md, gap: space.md },
  toggleText: { flex: 1, gap: 2 },
  hint: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  footer: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  clear: { flex: 1 },
  show: { flex: 1.6 },
});
