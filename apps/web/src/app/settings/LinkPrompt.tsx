import { useState } from "react";
import { useAccountWallets } from "../../api/wallets";
import { Button } from "../../ui/Button";
import { bannerShown, dismissBanner } from "../move/move-lines";
import { usePanels } from "../Panels";

const storage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** Kept beside the move reminder's, by a name no wallet id can take. */
const PROMPT = "link-prompt";

/**
 * The way into linking for someone who has only the Mercury wallet.
 *
 * Linking lives in Settings, and with nothing linked Home shows no wallet
 * cards and no switcher, so a person who arrived holding stocks in Phantom had
 * no sign it could be shown here at all. One quiet line on Home says so and
 * opens Settings → Linked wallets. Gone once anything is linked (Home then
 * shows every wallet), and for 30 days once dismissed, this browser only.
 * Never shown before the list of wallets has loaded, so it doesn't flash for
 * somebody who has linked wallets already.
 */
export const LinkPrompt = () => {
  const panels = usePanels();
  const account = useAccountWallets();
  const [shown, setShown] = useState(() => bannerShown(PROMPT, Date.now(), storage()));
  const wallets = account.data?.wallets;
  if (!shown || wallets === undefined || wallets.some((w) => !w.isPrimary)) return null;

  return (
    <section
      aria-label="Link a wallet you already have"
      className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:px-6"
    >
      <p className="flex-1 text-[13px] leading-[1.45] text-ds-ink">
        Already hold stocks or a loan in Phantom or another Solana wallet? Link it to see everything here,
        with its P&L and loan health. Mercury can&rsquo;t move funds from it without your approval.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            dismissBanner(PROMPT, Date.now(), storage());
            setShown(false);
          }}
        >
          Not now
        </Button>
        <Button variant="primary" onClick={panels.linkedWallets}>
          Link a wallet
        </Button>
      </div>
    </section>
  );
};
