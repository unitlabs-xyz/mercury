import { linkedCount, linkErrorCopy, shortAddress, type AccountWallet } from "../../api/wallets";
import { Button } from "../../ui/Button";
import { walletConnectConfigured } from "../../wallet/appkit";
import { useLinkWallet } from "../../wallet/useLinkWallet";
import { useConnectFunder, useDisconnectFunder, useFunders } from "../../wallet/useFunder";
import { WalletBoundary } from "../../wallet/WalletBoundary";

/**
 * The way to link another: connect a Solana wallet through AppKit, then sign.
 * Two steps on purpose: the person sees which wallet is connected before they
 * are asked to sign anything for it.
 */
const LinkSection = ({ wallets, limit }: { wallets: readonly AccountWallet[]; limit: number }) => {
  const connected = useFunders().svm;
  const connect = useConnectFunder();
  const disconnect = useDisconnectFunder();
  const link = useLinkWallet();

  if (linkedCount(wallets) >= limit) {
    return <p className="text-[14px] text-ds-muted">Unlink a wallet to link another.</p>;
  }

  const alreadyHere = connected !== null && wallets.some((w) => w.address === connected.address);

  return (
    <div className="flex flex-col gap-3">
      {connected === null ? (
        <Button variant="primary" size="lg" onClick={() => connect("svm")}>
          Link a wallet
        </Button>
      ) : alreadyHere ? (
        <p className="text-[14px] text-ds-muted">
          {shortAddress(connected.address)} is already on your account. Connect a different wallet to link it.
        </p>
      ) : (
        <Button
          variant="primary"
          size="lg"
          loading={link.isPending}
          onClick={() => link.mutate(connected.address, { onSuccess: () => void disconnect() })}
        >
          Link {shortAddress(connected.address)}
        </Button>
      )}
      {connected !== null && (
        <button
          type="button"
          className="self-start text-[13px] text-ds-muted hover:text-ds-ink"
          disabled={link.isPending}
          onClick={() => {
            link.reset();
            void disconnect().then(() => connect("svm"));
          }}
        >
          Use another wallet
        </button>
      )}
      {link.isError && <p className="text-[13px] text-ds-muted">{linkErrorCopy(link.error)}</p>}
      {link.isSuccess && (
        <p className="text-[13px] text-ds-muted">
          {link.data.relinked ? "Linked again, with its history." : "Linked."} Its holdings will show in a
          moment.
        </p>
      )}
    </div>
  );
};

/**
 * The chunk boundary for linking, as `FundFromChainWithWallet` is for funding:
 * dynamically imported and nothing else, so AppKit loads with this and not
 * before.
 */
const LinkWalletSection = (props: { wallets: readonly AccountWallet[]; limit: number }) =>
  /*
   * Checked before anything touches AppKit: its hooks throw when it was never
   * created, which with no project ID took the whole page down rather than
   * saying linking isn't available.
   */
  !walletConnectConfigured ? (
    <p className="text-[14px] text-ds-muted">Linking a wallet isn't available here yet.</p>
  ) : (
    <WalletBoundary>
      <LinkSection {...props} />
    </WalletBoundary>
  );

export default LinkWalletSection;
