import { useState } from "react";
import { Button } from "../../ui/Button";
import { usePanels } from "../Panels";
import { bannerShown, dismissBanner } from "./move-lines";

const storage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/**
 * The reminder at the top of a linked wallet's page, kept light: managing
 * funds here means approving each step in the wallet's own app, and moving
 * them to the Mercury wallet makes it one tap. Dismissed, it stays away for
 * that wallet for 30 days; this browser only, which is all a reminder needs.
 */
export const MoveBanner = ({ walletId, name }: { walletId: string; name: string }) => {
  const panels = usePanels();
  const [shown, setShown] = useState(() => bannerShown(walletId, Date.now(), storage()));
  // Another wallet chosen: its own reminder, read afresh.
  const [forWallet, setForWallet] = useState(walletId);
  if (forWallet !== walletId) {
    setForWallet(walletId);
    setShown(bannerShown(walletId, Date.now(), storage()));
  }
  if (!shown) return null;

  return (
    <section
      aria-label="Move to your Mercury wallet"
      className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:px-6"
    >
      <p className="flex-1 text-[13px] leading-[1.45] text-ds-ink">
        Managing funds here means approving each step in {name}. Move them to your Mercury wallet for one-tap
        trading.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            dismissBanner(walletId, Date.now(), storage());
            setShown(false);
          }}
        >
          Dismiss
        </Button>
        <Button variant="primary" onClick={panels.move}>
          Move funds
        </Button>
      </div>
    </section>
  );
};
