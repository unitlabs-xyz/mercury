import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { TabScene } from "../../src/ui/TabScene";
import { GROUPS, filterEvents, groupByDay, toCsv, toEvent, type Group } from "@mercury/view";
import { useRouter } from "expo-router";
import { useActivityFeed } from "../../src/api";
import { useActions } from "../../src/actions/Actions";
import { EventRow, EventRowSkeleton } from "../../src/activity/EventRow";
import {
  activeActivityCount,
  resetActivityFilters,
  setActivityMeta,
  sortEvents,
  useActivityFilters,
} from "../../src/activity/filters";
import { Button, Chip, Icon, IconButton, PressableScale, Surface, Text } from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

/** The web reads a hundred; so does this, and filters them on the phone. */
const FEED = 100;
/** Rows shown before "Show more": a screenful and a half, then on request. */
const PAGE = 30;

/**
 * Activity, as the web's page: every event in one white card, a grey panel
 * inside it, the days as small headings and the events as 60-high rows that
 * open in place to their details and the transaction behind them.
 *
 * The filters are the web's, phone-shaped: the type is a row of chips, search
 * sits above it beside a Filter button, and the year, month and order live in
 * a sheet behind that, as Invest's do.
 */
function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const openActions = useActions();
  const router = useRouter();
  const more = useActivityFilters();
  const feed = useActivityFeed(FEED);
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  /* Only a pull shows the spinner. The feed refetches itself every few seconds,
     and handing that to the control made iOS pull the page down on its own. */
  const [pulling, setPulling] = useState(false);
  const pull = () => {
    setPulling(true);
    void feed.refetch().finally(() => setPulling(false));
  };

  const events = useMemo(() => (feed.data?.items ?? []).map(toEvent), [feed.data]);
  const filtered = useMemo(
    () => sortEvents(filterEvents(events, group, more.year, more.month, query), more.sort),
    [events, group, more, query],
  );
  /* By amount, days stop meaning anything: one list, under one heading. */
  const days = useMemo(
    () =>
      more.sort === "largest"
        ? [{ date: "largest", label: "Largest first", events: filtered.slice(0, shown) }]
        : groupByDay(filtered.slice(0, shown)),
    [filtered, shown, more.sort],
  );

  /* Tell the sheet which years there are, and how many events its filters leave. */
  const years = useMemo(() => [...new Set(events.map((e) => e.date.slice(0, 4)))].sort().reverse(), [events]);
  useEffect(() => {
    setActivityMeta({ years, count: filtered.length });
  }, [years, filtered.length]);

  const loading = feed.isPending && feed.data === undefined;
  const active = activeActivityCount(more);

  const reset = () => {
    setGroup("all");
    setQuery("");
    resetActivityFilters();
  };

  /* The web downloads a file; a phone hands the same CSV to the share sheet. */
  const exportCsv = () => void Share.share({ message: toCsv(filtered), title: "Mercury activity" });

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} />}
      >
        {/* The title, its count and the export share one line; the description
            takes the full width under them rather than wrapping beside the button. */}
        <View style={s.head}>
          <View style={s.titleLine}>
            <Text variant="title">Activity</Text>
            <IconButton icon="download" label="Share as CSV" onPress={exportCsv} />
          </View>
          <RNText style={s.lede}>
            Every buy, sale, dividend and transfer, each with its proof on Solana.
          </RNText>
        </View>

        <View style={s.searchRow}>
          <View style={s.search}>
            <Icon name="search" size={16} color={color.muted} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setShown(PAGE);
              }}
              placeholder="Search events"
              placeholderTextColor={color.faint}
              selectionColor={color.brand}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <PressableScale
            onPress={() => router.push("/activity-filters")}
            activeScale={0.96}
            style={s.filterButton}
            accessibilityRole="button"
            accessibilityLabel={active > 0 ? `Filter and sort, ${active} on` : "Filter and sort"}
          >
            <Surface />
            <Icon name="sliders" size={16} color={color.ink} strokeWidth={1.7} />
            {active > 0 && (
              <View style={s.badge}>
                <RNText style={s.badgeText}>{active}</RNText>
              </View>
            )}
          </PressableScale>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          style={s.chipRow}
        >
          {GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={g.label}
              selected={group === g.key}
              onPress={() => {
                setGroup(g.key);
                setShown(PAGE);
              }}
            />
          ))}
        </ScrollView>

        <View style={s.card}>
          <View style={s.panel}>
            {loading ? (
              <EventRowSkeleton rows={6} />
            ) : feed.isError && events.length === 0 ? (
              <Blank
                title="We could not load your activity"
                body="Nothing is missing; we just could not reach it. Pull down to try again."
              />
            ) : events.length === 0 ? (
              <Blank
                title="Nothing has happened yet"
                body="Every buy, sell, dividend and transfer will show here, each with the transaction behind it one tap away."
                action={<Button size="md" label="Add cash to start" onPress={() => openActions("addCash")} />}
              />
            ) : filtered.length === 0 ? (
              <Blank
                title="Nothing matches that"
                body="Try a different word, or widen the filter."
                action={<Button size="md" variant="secondary" label="Clear filters" onPress={reset} />}
              />
            ) : (
              days.map((day) => (
                <View key={day.date}>
                  <RNText style={s.day}>{day.label}</RNText>
                  <View style={s.rows}>
                    {day.events.map((e, i) => (
                      <EventRow key={e.signature ?? `${e.date}-${e.title}-${i}`} event={e} expandable />
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>

          {filtered.length > shown && (
            <View style={s.more}>
              <Button
                size="md"
                variant="secondary"
                label={`Show ${Math.min(PAGE, filtered.length - shown)} more`}
                onPress={() => setShown((n) => n + PAGE)}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** An empty panel: one line and, where it helps, one action. */
const Blank = ({ title, body, action }: { title: string; body: string; action?: ReactNode }) => (
  <View style={s.blank}>
    <RNText style={s.blankTitle}>{title}</RNText>
    <RNText style={s.blankBody}>{body}</RNText>
    {action !== undefined && <View style={s.blankAction}>{action}</View>}
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  /* Clears the floating tab bar. */
  scroll: { paddingBottom: 116 },
  head: { paddingHorizontal: space.screen, paddingBottom: space.md },
  titleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  /* One line under the title saying what the page is for, on every tab. */
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted, marginTop: 4 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.screen },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  /* The search field's height, round: Filter beside search, the sheet behind it. */
  filterButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#E9E9E5",
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.medium, fontSize: 10, color: color.onBand },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink, padding: 0 },
  chipRow: { flexGrow: 0, marginTop: space.md },
  chips: { gap: 6, paddingHorizontal: space.screen },
  /* The web's list: a white card, a grey panel inside it, the rows on the panel. */
  card: {
    marginTop: space.md,
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs },
  day: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 14,
    color: color.muted,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 5,
  },
  rows: { gap: space.xs },
  more: { padding: space.md, alignItems: "center" },
  blank: { alignItems: "center", paddingHorizontal: space.lg, paddingVertical: 48 },
  blankTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "center" },
  blankBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: color.muted,
    textAlign: "center",
    marginTop: space.md,
    maxWidth: 300,
  },
  blankAction: { marginTop: space.screen },
});

export default function Activity() {
  return (
    <TabScene index={3}>
      <ActivityScreen />
    </TabScene>
  );
}
