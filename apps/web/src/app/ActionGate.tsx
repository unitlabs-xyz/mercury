import type { ReactNode } from "react";
import { actingLabel, actionBlockedCopy, useActingWallet, type BlockedAction } from "../api/acting-wallet";
import { walletName } from "../api/wallets";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { ChevronRight } from "../ui/icons";

/**
 * Stands in for an action's sheet while the chosen wallet cannot take it:
 * every wallet at once is for looking, and a linked wallet cannot act yet.
 *
 * Opened and closed exactly as the sheet would be, so every place that opens
 * one opens this instead without knowing. Switching to the Mercury wallet
 * from here shows the sheet itself, still open, as if it had been there all
 * along. The server refuses the same requests; this is so nobody fills in a
 * form only to be told no at the end.
 *
 * A loan is the exception to switching: it is one wallet's own position, so
 * the Mercury wallet would show a different loan. A linked wallet's loan says
 * repaying it here is coming (step 8 builds the transaction for that wallet
 * to sign); every wallet at once asks whose loan is meant.
 */
export const ActionGate = ({
  open,
  onClose,
  what = "action",
  children,
}: {
  open: boolean;
  onClose: () => void;
  what?: BlockedAction;
  children: ReactNode;
}) => {
  const { acting, choose, wallets } = useActingWallet();
  const blocked = actionBlockedCopy(acting, what);
  if (blocked === null) return <>{children}</>;

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="action-gate-title">
      <PanelHeader
        id="action-gate-title"
        title={
          what === "loan" && acting.kind === "linked"
            ? `Repaying from ${walletName(acting.wallet)} is coming soon`
            : "Switch wallets to continue"
        }
        sub={`Showing ${actingLabel(acting)}`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-5 px-6 pt-6 pb-8">
        <p className="text-[14px] leading-[1.45] text-ds-muted text-pretty">{blocked}</p>

        {what === "loan" && acting.kind === "linked" ? (
          <Button variant="secondary" size="lg" onClick={() => choose(null)}>
            Show your Mercury wallet's loan instead
          </Button>
        ) : what === "loan" && acting.kind === "all" ? (
          <ul className="flex flex-col gap-1.5">
            {wallets.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => choose(w.isPrimary ? null : w.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-cardline px-4 py-3 text-left text-[14px] font-medium hover:bg-black/[0.03]"
                >
                  {walletName(w)}
                  <ChevronRight className="size-3.5 text-ds-muted" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Button variant="primary" size="lg" onClick={() => choose(null)}>
            Switch to your Mercury wallet
          </Button>
        )}
      </div>
    </SidePanel>
  );
};
