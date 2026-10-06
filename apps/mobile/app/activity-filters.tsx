import type { ReactNode } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { MONTH_OPTIONS } from "@mercury/view";
import {
  ACTIVITY_SORTS,
  activeActivityCount,
  resetActivityFilters,
  setActivityFilters,
  useActivityFilters,
  useActivityMeta,
} from "../src/activity/filters";
import { Button, Chip, PanelHeader } from "../src/ui";
import { color, font, space } from "../src/theme";

/**
 * Filter and sort the feed, in the system's sheet, as Invest's is: the order,
 * then the year and month the web's page offers as dropdowns. Every change
 * applies at once behind the sheet, and the button says how many events are
 * left, so there is no apply step.
 */
export default function ActivityFilters() {
  const router = useRouter();
  const f = useActivityFilters();
  const { years, count } = useActivityMeta();
  const changed = activeActivityCount(f) > 0;

  return (
    <View style={s.root}>
      <PanelHeader title="Filter and sort" onClose={() => router.back()} />
      <View style={s.body}>
        <Section title="Sort by">
          <View style={s.wrap}>
            {ACTIVITY_SORTS.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                selected={f.sort === o.key}
                onPress={() => setActivityFilters({ sort: o.key })}
              />
            ))}
          </View>
        </Section>

        {years.length > 0 && (
          <Section title="Year">
            <View style={s.wrap}>
              <Chip
                label="All years"
                selected={f.year === "all"}
                onPress={() => setActivityFilters({ year: "all" })}
              />
              {years.map((y) => (
                <Chip
                  key={y}
                  label={y}
                  selected={f.year === y}
                  onPress={() => setActivityFilters({ year: y })}
                />
              ))}
            </View>
          </Section>
        )}

        <Section title="Month">
          <View style={s.wrap}>
            {MONTH_OPTIONS.map((m) => (
              <Chip
                key={m.value}
                label={m.value === "all" ? m.label : m.label.slice(0, 3)}
                selected={f.month === m.value}
                onPress={() => setActivityFilters({ month: m.value })}
              />
            ))}
          </View>
        </Section>
      </View>

      <View style={s.footer}>
        <View style={s.clear}>
          <Button
            size="md"
            variant="secondary"
            label="Clear all"
            disabled={!changed}
            onPress={resetActivityFilters}
          />
        </View>
        <View style={s.show}>
          <Button
            size="md"
            label={count === 1 ? "Show 1 event" : `Show ${count} events`}
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
