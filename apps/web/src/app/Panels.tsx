import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MOVE_PARAM } from "@mercury/view";
import { ActionGate } from "./ActionGate";
import { ActivityReceipt } from "./ActivityReceipt";
import { AddCash } from "./AddCash";
import { BorrowSheet, type Tab } from "./borrow/BorrowSheet";
import { Send } from "./Send";
import { EarnSheet, type EarnTab } from "./money/EarnSheet";
import { LinkedWallets } from "./settings/LinkedWallets";
import { MoveSheet } from "./move/MoveSheet";

const BORROW_TABS: readonly Tab[] = ["borrow", "repay", "pledge", "withdraw"];

/** The query keys a panel owns, so opening one never leaves another's behind. */
export const KEYS = [
  "add",
  "send",
  "borrow",
  "ticker",
  "only",
  "event",
  "earn",
  "vault",
  "settings",
  MOVE_PARAM,
] as const;

/** Whether an address opens a panel: the page was opened to do something, such as a link from the phone. */
export const opensPanel = (search: string): boolean => {
  const params = new URLSearchParams(search);
  return KEYS.some((k) => params.has(k));
};

/**
 * Opens and closes the app's side panels from anywhere, on top of whatever page
 * you are on: each panel is a query on the current URL (`?add=cash`,
 * `?send=usdc`, `?borrow=repay&ticker=SPY`; add `&only=1` to keep the borrow
 * panel to that one stock; `?event=<id>` for an activity row's receipt;
 * `?settings=wallets` for linked wallets; `?move=1` to move a linked
 * wallet's tokens into the Mercury wallet), so a
 * button on Portfolio opens it
 * over Portfolio, a link can open it, and Back closes it.
 */
export const usePanels = () => {
  const [params, setParams] = useSearchParams();
  const set = (next: Record<string, string | undefined>) =>
    setParams(
      (p) => {
        for (const k of KEYS) p.delete(k);
        for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
        return p;
      },
      { replace: false },
    );
  return {
    params,
    addCash: () => set({ add: "cash" }),
    send: () => set({ send: "usdc" }),
    borrow: (tab: Tab = "borrow", ticker?: string) => set({ borrow: tab, ticker }),
    receipt: (id: string) => set({ event: id }),
    earn: (tab: EarnTab = "add", vault?: string) => set({ earn: tab, vault }),
    linkedWallets: () => set({ settings: "wallets" }),
    move: () => set({ [MOVE_PARAM]: "1" }),
    close: () =>
      setParams(
        (p) => {
          for (const k of KEYS) p.delete(k);
          return p;
        },
        { replace: true },
      ),
  };
};

/** True from the first time `open` is true: the panel then stays mounted so it can animate closed. */
const useSeen = (open: boolean) => {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen;
};

/**
 * The app's side panels, mounted once at the root inside the router and drawn
 * over any page. Each loads on first open, not before.
 */
export const GlobalPanels = () => {
  const { params, close } = usePanels();
  const adding = params.get("add") === "cash";
  const sending = params.get("send") !== null;
  const tab = params.get("borrow") as Tab | null;
  const borrowing = tab !== null && BORROW_TABS.includes(tab);
  const event = params.get("event");
  const earnParam = params.get("earn");
  const earning = earnParam === "add" || earnParam === "withdraw";
  const earnSeen = useSeen(earning);
  // The last side asked for, so the panel keeps its title while it slides away.
  const [lastEarn, setLastEarn] = useState<EarnTab>("add");
  if (earning && earnParam !== lastEarn) setLastEarn(earnParam);

  const moving = params.get(MOVE_PARAM) === "1";
  const moveSeen = useSeen(moving);
  const managingWallets = params.get("settings") === "wallets";
  const walletsSeen = useSeen(managingWallets);
  const addSeen = useSeen(adding);
  const sendSeen = useSeen(sending);
  const borrowSeen = useSeen(borrowing);
  const receiptSeen = useSeen(event !== null);
  // The last receipt asked for, so it keeps its contents while it fades away.
  const [lastEvent, setLastEvent] = useState<string | null>(event);
  if (event !== null && event !== lastEvent) setLastEvent(event);
  // The last tab asked for, so the borrow panel keeps its title while it slides away.
  const [lastTab, setLastTab] = useState<Tab>("borrow");
  if (borrowing && tab !== lastTab) setLastTab(tab);

  return (
    <>
      {addSeen && <AddCash open={adding} onClose={close} />}
      {/* Adding money is not gated: it lands in the Mercury wallet whichever wallet is shown. */}
      {sendSeen && (
        <ActionGate open={sending} onClose={close}>
          <Send open={sending} onClose={close} />
        </ActionGate>
      )}
      {borrowSeen && (
        <ActionGate open={borrowing} onClose={close} what="loan">
          <BorrowSheet
            open={borrowing}
            onClose={close}
            initialTab={borrowing ? tab : lastTab}
            ticker={params.get("ticker") ?? undefined}
            only={params.get("only") === "1"}
          />
        </ActionGate>
      )}
      {earnSeen && (
        <ActionGate open={earning} onClose={close}>
          <EarnSheet
            open={earning}
            onClose={close}
            tab={earning ? earnParam : lastEarn}
            vault={params.get("vault") ?? undefined}
          />
        </ActionGate>
      )}
      {/* Not gated: the sheet itself is for a linked wallet, and says so for any other. */}
      {moveSeen && <MoveSheet open={moving} onClose={close} />}
      {walletsSeen && <LinkedWallets open={managingWallets} onClose={close} />}
      {receiptSeen && <ActivityReceipt id={event ?? lastEvent} open={event !== null} onClose={close} />}
    </>
  );
};
