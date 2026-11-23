import { lazy, Suspense, useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import {
  linkedLine,
  linkErrorCopy,
  shortAddress,
  useAccountWallets,
  useRenameWallet,
  useUnlinkWallet,
  walletName,
  type AccountWallet,
} from "../../api/wallets";

/*
 * Linking needs AppKit, which is half again on the first download. Loaded when
 * this panel opens, never with the pages that only import `Panels`. See
 * `app/money/FundFromChainWithWallet.tsx`.
 */
const LinkWalletSection = lazy(() => import("./LinkWalletSection"));

/** Matches the server's limit on a name (`LABEL_MAX` in routes/wallets.ts). */
const LABEL_MAX = 40;

/**
 * Settings → Linked wallets.
 *
 * Solana wallets someone already holds, linked beside the Mercury wallet with
 * one signed message. Linking lets Mercury show what they hold and owe; it
 * never lets Mercury move anything. Unlinking stops all of it at once,
 * warnings included, which the confirm step says in as many words.
 */
export const LinkedWallets = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const account = useAccountWallets();
  const [unlinking, setUnlinking] = useState<AccountWallet | null>(null);

  const sub =
    account.data === undefined
      ? "Wallets you already hold, beside your Mercury wallet."
      : linkedLine(account.data);

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="linked-wallets-title">
      {unlinking === null ? (
        <>
          <PanelHeader id="linked-wallets-title" title="Linked wallets" sub={sub} onClose={onClose} />
          <div className="flex flex-col gap-6 px-6 pt-6 pb-8">
            {account.isPending ? (
              <p className="text-[14px] text-ds-muted">Loading…</p>
            ) : account.isError ? (
              <p className="text-[14px] text-ds-muted">
                Couldn't load your wallets.{" "}
                <button
                  type="button"
                  className="text-ds-ink underline"
                  onClick={() => void account.refetch()}
                >
                  Try again
                </button>
              </p>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-black/[0.06] rounded-xl outline-1 outline-black/10">
                  {account.data.wallets.map((w) => (
                    <WalletRow key={w.id} wallet={w} onUnlink={() => setUnlinking(w)} />
                  ))}
                </ul>
                <Suspense fallback={<p className="text-[14px] text-ds-muted">Loading…</p>}>
                  <LinkWalletSection wallets={account.data.wallets} limit={account.data.limit} />
                </Suspense>
                <p className="text-[13px] leading-[1.45] text-ds-muted text-pretty">
                  Linking lets Mercury show a wallet's holdings and loans. It never lets Mercury move funds:
                  anything you do from a linked wallet is approved in that wallet.
                </p>
              </>
            )}
          </div>
        </>
      ) : (
        <ConfirmUnlink wallet={unlinking} onBack={() => setUnlinking(null)} onClose={onClose} />
      )}
    </SidePanel>
  );
};

const WalletRow = ({ wallet, onUnlink }: { wallet: AccountWallet; onUnlink: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wallet.label ?? "");
  const rename = useRenameWallet();

  const save = (e: FormEvent) => {
    e.preventDefault();
    const label = draft.trim();
    rename.mutate(
      { id: wallet.id, label: label.length === 0 ? null : label },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={LABEL_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={shortAddress(wallet.address)}
            aria-label="Wallet name"
            className="h-8 min-w-0 flex-1 rounded-lg px-3 text-[14px] text-ds-ink outline-1 outline-black/15 focus:outline-black/40"
          />
          <Button type="submit" variant="primary" loading={rename.isPending}>
            Save
          </Button>
          <Button onClick={() => setEditing(false)} disabled={rename.isPending}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ds-ink">{walletName(wallet)}</p>
            <p className="truncate text-[13px] text-ds-muted">
              {wallet.isPrimary ? "Your Mercury wallet" : shortAddress(wallet.address)}
            </p>
          </div>
          {!wallet.isPrimary && (
            <div className="flex shrink-0 items-center gap-3 text-[13px]">
              <button
                type="button"
                className="text-ds-muted hover:text-ds-ink"
                onClick={() => {
                  setDraft(wallet.label ?? "");
                  setEditing(true);
                }}
              >
                Rename
              </button>
              <button type="button" className="text-ds-muted hover:text-ds-ink" onClick={onUnlink}>
                Unlink
              </button>
            </div>
          )}
        </div>
      )}
      {rename.isError && <p className="text-[13px] text-ds-muted">{linkErrorCopy(rename.error)}</p>}
    </li>
  );
};

/**
 * Two ways to stop following a wallet, said plainly. Unlink keeps what Mercury
 * recorded, so linking it again brings it back; deleting it cannot be undone.
 */
const ConfirmUnlink = ({
  wallet,
  onBack,
  onClose,
}: {
  wallet: AccountWallet;
  onBack: () => void;
  onClose: () => void;
}) => {
  const unlink = useUnlinkWallet();
  const go = (deleteHistory: boolean) =>
    unlink.mutate({ id: wallet.id, deleteHistory }, { onSuccess: onBack });

  return (
    <>
      <PanelHeader
        id="linked-wallets-title"
        title={`Unlink ${walletName(wallet)}`}
        sub={shortAddress(wallet.address)}
        onClose={onClose}
        onBack={onBack}
      />
      <div className="flex flex-col gap-5 px-6 pt-6 pb-8 text-[14px] leading-[1.45] text-ds-muted text-pretty">
        <p>
          Mercury will stop tracking this wallet. Its holdings, activity and loans disappear from Mercury, and{" "}
          <span className="text-ds-ink">
            if it has a loan, Mercury won't warn you if it gets close to liquidation.
          </span>
        </p>
        <p>The wallet itself and everything in it stay exactly as they are.</p>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            loading={unlink.isPending && !unlink.variables?.deleteHistory}
            disabled={unlink.isPending}
            onClick={() => go(false)}
          >
            Unlink
          </Button>
          <p className="text-[13px]">Link it again any time and its history comes back.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            loading={unlink.isPending && unlink.variables?.deleteHistory === true}
            disabled={unlink.isPending}
            onClick={() => go(true)}
          >
            Unlink and delete history
          </Button>
          <p className="text-[13px]">
            Deletes everything Mercury recorded about this wallet: costs, activity and loan history. This
            can't be undone.
          </p>
        </div>

        {unlink.isError && <p className="text-[13px]">{linkErrorCopy(unlink.error)}</p>}
      </div>
    </>
  );
};
