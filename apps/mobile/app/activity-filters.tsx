import type { ReactNode } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { MONTH_OPTIONS, TYPE_OPTIONS, type Group } from "@mercury/view";
import {
  ACTIVITY_SORTS,
  activeActivityCount,
  resetActivityFilters,
  setActivityFilters,
  useActivityFilters,
  useActivityMeta,
} from "../src/activity/filters";
import { Button, Chip, PanelHeader, SelectRow } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

/**
 * Filter and sort the feed, in the system's sheet, as Invest's is: the order
 * as chips, then what to show — type, year, month, the web page's three
 * dropdowns — as rows that open the system's pull-down menu. Every change
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

        <Section title="Show">
          <View style={s.panel}>
            <SelectRow
              label="Type"
              value={f.group}
              options={TYPE_OPTIONS}
              onChange={(group) => setActivityFilters({ group: group as Group })}
            />
            <SelectRow
              label="Year"
              value={f.year}
              options={[{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))]}
              onChange={(year) => setActivityFilters({ year })}
            />
            <SelectRow
              label="Month"
              value={f.month}
              options={MONTH_OPTIONS}
              onChange={(month) => setActivityFilters({ month })}
              last
            />
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
  /* One grey group of rows, as a Settings list is grouped. */
  panel: { borderRadius: radius.md, backgroundColor: color.tile },
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
