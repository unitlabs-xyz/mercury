import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useSignedIn, type ActivityItem } from "./hooks";
import { LIVE } from "./live";

/**
 * The inbox behind the bell.
 *
 * The badge's count is polled on the account reads' policy, and costs no RPC:
 * the server answers it from one indexed count. The list is fetched only while
 * the panel is open, because nobody reads it otherwise.
 */
export type NoticeKind = "money_in" | "dividend" | "loan_alert";

export interface Notification {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly activity: ActivityItem;
}

type Inbox = { items: Notification[]; unread: number };

const KEY = ["api", "notifications"] as const;
const UNREAD_KEY = [...KEY, "unread"] as const;

/** Nothing at zero, then the count, then "9+". */
export const badgeText = (unread: number): string | null =>
  unread <= 0 ? null : unread > 9 ? "9+" : String(unread);

/** Where clicking an item goes: its receipt, or the page the loan lives on. */
export const destinationOf = (n: Notification): { readonly receipt: string } | { readonly path: string } =>
  n.kind === "loan_alert" ? { path: "/portfolio" } : { receipt: n.activity.id };

export const useUnreadCount = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => apiFetch<{ unread: number }>("/v1/notifications/unread"),
    enabled: signedIn,
    ...LIVE,
    select: (r) => r.unread,
  });
};

export const useNotifications = (open: boolean) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<Inbox>("/v1/notifications"),
    enabled: signedIn && open,
    staleTime: 0,
  });
};

/** Read at once on screen; the server catches up. A failure comes back unread on the next fetch. */
export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onMutate: (id) => {
      const now = new Date().toISOString();
      qc.setQueryData<Inbox>(KEY, (prev) =>
        prev === undefined
          ? prev
          : {
              unread: prev.items.some((n) => n.id === id && n.readAt === null)
                ? prev.unread - 1
                : prev.unread,
              items: prev.items.map((n) => (n.id === id && n.readAt === null ? { ...n, readAt: now } : n)),
            },
      );
      qc.setQueryData<{ unread: number }>(UNREAD_KEY, (prev) =>
        prev === undefined ? prev : { unread: Math.max(0, prev.unread - 1) },
      );
    },
    // Also refreshes the badge: its key starts with this one.
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

/** `upTo` is the newest item the panel showed, so nothing that arrived since is marked. */
export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upTo: string) =>
      apiFetch("/v1/notifications/read-all", { method: "POST", body: JSON.stringify({ upTo }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};
