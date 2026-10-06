import { useMemo } from "react";
import { useActivityFeed } from "../api/hooks";
import { SAMPLE, SAMPLE_EVENTS } from "../dev/sample";
import type { Event } from "@mercury/view";
import { toEvent } from "@mercury/view";

/**
 * The account's events, newest first, in the screen model.
 */
export const useEvents = (): { events: readonly Event[]; loading: boolean; error: boolean } => {
  const feed = useActivityFeed();
  const events = useMemo(() => (SAMPLE ? SAMPLE_EVENTS : (feed.data?.items ?? []).map(toEvent)), [feed.data]);
  return { events, loading: !SAMPLE && feed.isLoading, error: !SAMPLE && feed.isError };
};
