import type { ReactNode } from "react";
import { actingLabel, actionBlockedCopy, useActingWallet } from "../api/acting-wallet";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";

/**
 * Stands in for an action's sheet while the chosen wallet cannot take it:
 * every wallet at once is for looking, and a linked wallet cannot act yet.
 *
 * Opened and closed exactly as the sheet would be, so every place that opens
 * one opens this instead without knowing. Switching to the Mercury wallet
 * from here shows the sheet itself, still open, as if it had been there all
 * along. The server refuses the same requests; this is so nobody fills in a
 * form only to be told no at the end.
 */
export const ActionGate = ({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) => {
  const { acting, choose } = useActingWallet();
  const blocked = actionBlockedCopy(acting);
  if (blocked === null) return <>{children}</>;

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="action-gate-title">
      <PanelHeader
        id="action-gate-title"
        title="Switch wallets to continue"
        sub={`Showing ${actingLabel(acting)}`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-5 px-6 pt-6 pb-8">
        <p className="text-[14px] leading-[1.45] text-ds-muted text-pretty">{blocked}</p>
        <Button variant="primary" size="lg" onClick={() => choose(null)}>
          Switch to your Mercury wallet
        </Button>
      </div>
    </SidePanel>
  );
};
