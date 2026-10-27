import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usd } from "@mercury/view";
import { Bell, Cog } from "../ui/icons";
import {
  badgeText,
  destinationOf,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type Notification,
} from "../api/notifications";
import { usePanels } from "./Panels";
import { relTime } from "./portfolio/ui";

/**
 * Global chrome, the same on every app screen: the inbox behind the bell, and
 * the settings placeholder, which still says it is not built: a control that
 * does nothing when pressed reads as broken rather than as unfinished.
 */
type Panel = "alerts" | "settings";

const SETTINGS = {
  title: "Not built yet",
  body: "Your profile, security, and exporting the wallet to somewhere else will live here.",
};

/*
 * Under the button on a wide screen. On a phone the bell is not at the screen's
 * right edge, so a panel hung from it ran off the left side: there it spans the
 * screen inside the 16px gutter, just under the sticky top bar.
 */
const PLACED =
  "absolute top-[calc(100%+10px)] right-0 z-40 max-sm:fixed max-sm:inset-x-4 max-sm:top-[66px] max-sm:w-auto";

export const HeaderChrome = () => {
  const [open, setOpen] = useState<Panel | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount().data ?? 0;
  const badge = badgeText(unread);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const button = (key: Panel) => {
    const Icon = key === "alerts" ? Bell : Cog;
    const active = open === key;
    const label =
      key === "alerts" ? (unread > 0 ? `Notifications, ${unread} unread` : "Notifications") : "Settings";
    return (
      <button
        key={key}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={active}
        onClick={() => setOpen(active ? null : key)}
        className={`relative grid size-9 place-items-center rounded-lg bg-white transition-colors max-sm:size-10 ${
          active ? "text-ds-ink" : "text-ds-muted hover:text-ds-ink"
        }`}
      >
        <Icon className="size-4" />
        {key === "alerts" && badge !== null && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-ds-ink px-1 text-[10px] leading-none font-medium text-white tabular-nums"
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {button("alerts")}
      {button("settings")}

      {open === "alerts" && <Inbox onClose={() => setOpen(null)} />}
      {open === "settings" && (
        <div
          role="dialog"
          aria-label="Settings"
          className={`${PLACED} w-[300px] rounded-xl bg-white px-5 py-4 outline-1 outline-black/10`}
        >
          <p className="text-[14px] leading-none font-medium text-ds-ink">{SETTINGS.title}</p>
          <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted text-pretty">{SETTINGS.body}</p>
        </div>
      )}
    </div>
  );
};

const Inbox = ({ onClose }: { onClose: () => void }) => {
  const list = useNotifications(true);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const panels = usePanels();
  const navigate = useNavigate();

  const items = list.data?.items ?? [];
  const unread = list.data?.unread ?? 0;
  const newest = items[0];

  const go = (n: Notification) => {
    if (n.readAt === null) markRead.mutate(n.id);
    onClose();
    const to = destinationOf(n);
    if ("receipt" in to) panels.receipt(to.receipt);
    else navigate(to.path);
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className={`${PLACED} w-[360px] rounded-xl bg-white outline-1 outline-black/10`}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Notifications</p>
        <button
          type="button"
          disabled={unread === 0 || newest === undefined || markAll.isPending}
          onClick={() => newest && markAll.mutate(newest.createdAt)}
          className="text-[13px] text-ds-muted hover:text-ds-ink disabled:opacity-40 disabled:hover:text-ds-muted"
        >
          Mark all as read
        </button>
      </div>

      {list.isPending ? (
        <p className="px-5 pb-4 text-[14px] text-ds-muted">Loading…</p>
      ) : list.isError ? (
        <div className="px-5 pb-4 text-[14px] text-ds-muted">
          Couldn't load your notifications.{" "}
          <button type="button" className="text-ds-ink underline" onClick={() => void list.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 pb-4 text-[14px] leading-[1.45] text-ds-muted text-pretty">
          Nothing yet. Money arriving, dividends and loan warnings will show up here.
        </p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto pb-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => go(n)}
                className="flex w-full items-start gap-3 px-5 py-2.5 text-left hover:bg-black/[0.03]"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.readAt === null ? "bg-ds-ink" : "bg-transparent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[14px] ${n.readAt === null ? "font-medium text-ds-ink" : "text-ds-muted"}`}
                  >
                    {n.activity.title}
                    {n.readAt === null && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.activity.subtitle && (
                    <span className="block truncate text-[13px] text-ds-muted">{n.activity.subtitle}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {n.activity.amountUsd !== null && (
                    <span className="block text-[13px] text-ds-ink tabular-nums">
                      {usd(n.activity.amountUsd)}
                    </span>
                  )}
                  <span className="block text-[12px] text-ds-muted">{relTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
