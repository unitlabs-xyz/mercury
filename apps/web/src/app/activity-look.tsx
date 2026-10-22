import type { ReactNode } from "react";
import { Alert, ArrowDown, ArrowUp, Clock, Grid, Lock, Plus, Refresh, Trend } from "../ui/icons";
import type { EventKind } from "@mercury/view";

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
  // Money, so the same arrows cash uses. Borrowing is not a gain, so it takes
  // the neutral chip rather than the green one a dividend gets.
  borrow: { icon: <ArrowDown className="size-4" />, tone: "bg-chip text-ink-soft" },
  repay: { icon: <ArrowUp className="size-4" />, tone: "bg-chip text-ink-soft" },
  // Collateral, not money: a lock going on and coming off.
  pledge: { icon: <Lock className="size-4" />, tone: "bg-chip text-ink-soft" },
  unpledge: { icon: <Lock className="size-4" />, tone: "bg-up-tint text-up-deep" },
  // The only row in the feed that is asking for something to be done.
  loan_alert: { icon: <Alert className="size-4" />, tone: "bg-warn-tint text-warn" },
  // Earn's own mark going in, as on its button; cash's arrow coming back.
  earn_deposit: { icon: <Trend className="size-4" />, tone: "bg-brand-tint text-brand" },
  earn_withdraw: { icon: <ArrowDown className="size-4" />, tone: "bg-chip text-ink-soft" },
};
