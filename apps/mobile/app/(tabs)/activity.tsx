import { useMemo, useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { GROUPS, filterEvents, groupByDay, toCsv, toEvent, type Group } from "@mercury/view";
import { useActivityFeed } from "../../src/api";
import { useActions } from "../../src/actions/Actions";
import { EventRow, EventRowSkeleton } from "../../src/activity/EventRow";
import { Button, Chip, Icon, IconButton, Text } from "../../src/ui";
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
 * The filters are the web's, phone-shaped: the type is a row of chips rather
 * than a dropdown, and search sits above it. Year and month are left to the
 * web, where there is room for them; a phone scrolls a hundred events faster
 * than it can work two more menus.
 */
export default function Activity() {
  const insets = useSafeAreaInsets();
  const openActions = useActions();
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
  const filtered = useMemo(() => filterEvents(events, group, "all", "all", query), [events, group, query]);
  const days = useMemo(() => groupByDay(filtered.slice(0, shown)), [filtered, shown]);

  const loading = feed.isPending && feed.data === undefined;
  const narrowed = group !== "all" || query.trim() !== "";
  const count = loading
    ? ""
    : narrowed
      ? `${filtered.length} of ${events.length}`
      : `${events.length} ${events.length === 1 ? "event" : "events"}`;

  const reset = () => {
    setGroup("all");
    setQuery("");
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
        <View style={s.head}>
          <View style={s.titleRow}>
            <Text variant="title">Activity</Text>
            <RNText style={s.count}>{count}</RNText>
          </View>
          <IconButton icon="download" label="Share as CSV" onPress={exportCsv} />
        </View>

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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingBottom: space.md,
  },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  count: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.screen,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
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
