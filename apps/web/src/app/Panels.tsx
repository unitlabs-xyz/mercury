import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddCash } from "./AddCash";
import { BorrowSheet, type Tab } from "./borrow/BorrowSheet";
import { Send } from "./Send";

const BORROW_TABS: readonly Tab[] = ["borrow", "repay", "pledge", "withdraw"];

/** The query keys a panel owns, so opening one never leaves another's behind. */
const KEYS = ["add", "send", "borrow", "ticker", "only"] as const;

/**
 * Opens and closes the app's side panels from anywhere, on top of whatever page
 * you are on: each panel is a query on the current URL (`?add=cash`,
 * `?send=usdc`, `?borrow=repay&ticker=SPY`; add `&only=1` to keep the borrow
 * panel to that one stock), so a button on Portfolio opens it
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

  const addSeen = useSeen(adding);
  const sendSeen = useSeen(sending);
  const borrowSeen = useSeen(borrowing);
  // The last tab asked for, so the borrow panel keeps its title while it slides away.
  const [lastTab, setLastTab] = useState<Tab>("borrow");
  if (borrowing && tab !== lastTab) setLastTab(tab);

  return (
    <>
      {addSeen && <AddCash open={adding} onClose={close} />}
      {sendSeen && <Send open={sending} onClose={close} />}
      {borrowSeen && (
        <BorrowSheet
          open={borrowing}
          onClose={close}
          initialTab={borrowing ? tab : lastTab}
          ticker={params.get("ticker") ?? undefined}
          only={params.get("only") === "1"}
        />
      )}
    </>
  );
};
