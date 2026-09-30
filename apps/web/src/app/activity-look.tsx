import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Clock, Grid, Plus, Refresh, Trend } from "../ui/icons";
import type { EventKind } from "./activity-data";

/** The mark and tint for each kind of event, shared by the feed and the dashboard. */
export const LOOK: Record<EventKind, { icon: ReactNode; tone: string }> = {
  buy: { icon: <Trend className="size-4" />, tone: "bg-brand-tint text-brand" },
  sell: { icon: <ArrowDown className="size-4" />, tone: "bg-chip text-ink-soft" },
  basket: { icon: <Grid className="size-4" />, tone: "bg-brand-tint text-brand" },
  dividend: { icon: <Refresh className="size-4" />, tone: "bg-up-tint text-up-deep" },
  receive: { icon: <ArrowDown className="size-4" />, tone: "bg-up-tint text-up-deep" },
  send: { icon: <ArrowUp className="size-4" />, tone: "bg-chip text-ink-soft" },
  interest: { icon: <Plus className="size-4" />, tone: "bg-up-tint text-up-deep" },
  queued: { icon: <Clock className="size-4" />, tone: "bg-warn-tint text-warn" },
};
