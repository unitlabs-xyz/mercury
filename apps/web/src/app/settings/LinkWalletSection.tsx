import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { linkedCount, linkErrorCopy, shortAddress, type AccountWallet } from "../../api/wallets";
import { SAMPLE_NO_LOGIN, sampleConnectable } from "../../dev/sample";
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
 * Linking, walked through on sample data (`pnpm dev:sample`), where there is
 * no wallet to connect: each step the real one takes, with a stand-in for the
 * wallet's own pop-ups, against the sample's answers. Linking adds the sample
 * Phantom wallet, so Home changes as it would.
 */
const SampleLinkSection = ({ wallets, limit }: { wallets: readonly AccountWallet[]; limit: number }) => {
  const qc = useQueryClient();
  const [step, setStep] = useState<
    | { kind: "idle" }
    | { kind: "choosing" }
    | { kind: "connected"; address: string; name: string }
    | { kind: "signing"; address: string; name: string; challengeId: string; message: string }
    | { kind: "linked"; name: string }
  >({ kind: "idle" });
  const next = sampleConnectable();

  if (linkedCount(wallets) >= limit || (next === null && step.kind !== "linked")) {
    return <p className="text-[14px] text-ds-muted">Unlink a wallet to link another.</p>;
  }
  const note = (
    <p className="text-[12px] text-ds-muted">
      Sample mode: the wallet&rsquo;s own pop-ups are stood in for here.
    </p>
  );

  if (step.kind === "idle" || step.kind === "linked")
    return (
      <div className="flex flex-col gap-3">
        {step.kind === "linked" && (
          <p className="text-[13px] text-ds-muted">Linked {step.name}. Its holdings will show in a moment.</p>
        )}
        {next !== null && (
          <Button variant="primary" size="lg" onClick={() => setStep({ kind: "choosing" })}>
            Link a wallet
          </Button>
        )}
      </div>
    );

  if (step.kind === "choosing")
    return (
      <div className="flex flex-col gap-3">
        {note}
        <div className="rounded-xl border border-black/10 p-3">
          <p className="mb-2 text-[13px] font-medium text-ds-ink">Connect a wallet</p>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg bg-ds-panel px-3 py-2.5 text-[14px] text-ds-ink hover:bg-black/5"
            onClick={() => setStep({ kind: "connected", address: next!.address, name: next!.name })}
          >
            <span>{next!.name}</span>
            <span className="text-ds-muted">{shortAddress(next!.address)}</span>
          </button>
        </div>
        <button
          type="button"
          className="self-start text-[13px] text-ds-muted hover:text-ds-ink"
          onClick={() => setStep({ kind: "idle" })}
        >
          Cancel
        </button>
      </div>
    );

  if (step.kind === "connected")
    return (
      <div className="flex flex-col gap-3">
        {note}
        <p className="text-[13px] text-ds-muted">
          {step.name} is connected. Linking asks it to sign a message proving the wallet is yours.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() =>
            void apiFetch<{ challengeId: string; message: string }>("/v1/wallets/link/challenge", {
              method: "POST",
              body: JSON.stringify({ address: step.address }),
            }).then((c) =>
              setStep({ ...step, kind: "signing", challengeId: c.challengeId, message: c.message }),
            )
          }
        >
          Link {shortAddress(step.address)}
        </Button>
        <button
          type="button"
          className="self-start text-[13px] text-ds-muted hover:text-ds-ink"
          onClick={() => setStep({ kind: "idle" })}
        >
          Use another wallet
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {note}
      <div
        className="rounded-xl border border-black/10 p-3"
        role="dialog"
        aria-label={`${step.name} signature request`}
      >
        <p className="text-[13px] font-medium text-ds-ink">{step.name} · Sign message</p>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ds-panel p-3 text-[11px] leading-[1.5] text-ds-ink">
          {step.message}
        </pre>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setStep({ kind: "connected", address: step.address, name: step.name })}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() =>
              void apiFetch("/v1/wallets/link", {
                method: "POST",
                body: JSON.stringify({ challengeId: step.challengeId, signature: "sample" }),
              }).then(() => {
                setStep({ kind: "linked", name: step.name });
                // Every read changes: the list, Home's summary and cards, the switcher.
                void qc.invalidateQueries();
              })
            }
          >
            Sign
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * The chunk boundary for linking, as `FundFromChainWithWallet` is for funding:
 * dynamically imported and nothing else, so AppKit loads with this and not
 * before.
 */
const LinkWalletSection = (props: { wallets: readonly AccountWallet[]; limit: number }) =>
  SAMPLE_NO_LOGIN ? (
    <SampleLinkSection {...props} />
  ) : /*
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
