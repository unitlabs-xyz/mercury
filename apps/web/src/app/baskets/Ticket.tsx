import type { ManagedBasketPortfolio } from "@mercury/types";
import { usd } from "@mercury/view";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { RailCard, RailHead } from "../../ui/ds";
import { Alert, Check } from "../../ui/icons";
import { AmountWell } from "../stock/Ticket";

interface EnrollmentRailProps {
  name: string;
  assetCount: number;
  portfolio: Pick<ManagedBasketPortfolio, "portfolioId" | "smartAccounts"> | null;
  signedIn: boolean;
  busy: boolean;
  checking?: boolean | undefined;
  blocked?: boolean | undefined;
  error?: string | undefined;
  onReview: () => void;
}

/** Same rail dimensions as the Invest ticket; only its state and copy change. */
export const EnrollmentRail = ({
  name,
  assetCount,
  portfolio,
  signedIn,
  busy,
  checking = false,
  blocked = false,
  error,
  onReview,
}: EnrollmentRailProps) => {
  const enrolled = portfolio !== null;
  const address = portfolio?.smartAccounts
    .find((account) => account.accountId.startsWith("solana:"))
    ?.accountId.split(":").at(-1);
  return (
    <RailCard label="Invest in strategy">
      <RailHead
        title={`${enrolled ? "Fund" : "Enroll in"} ${name}`}
        meta={enrolled ? "Enrolled" : "Solana"}
      />
      <div className="mt-5 min-h-[102px] rounded-lg bg-ds-panel p-4 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-ds-ink">
            {enrolled
              ? "Your Glider portfolio is ready"
              : signedIn
                ? "Your own portfolio, not a basket token"
                : "Sign in to enroll"}
          </p>
          {address && (
            <a
              href={`https://solscan.io/account/${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View smart account ${address} on Solscan`}
              className="shrink-0 rounded-sm font-mono text-[11px] text-ds-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-link"
            >
              {address.slice(0, 4)}…{address.slice(-4)} ↗
            </a>
          )}
        </div>
        <p className="mt-2 leading-relaxed text-ds-muted">
          {error ??
            (enrolled
              ? "Fund it with USDC on Solana. Your assets stay in your own smart account."
              : signedIn
                ? "Sign to create your own Glider smart account. No USDC is invested during enrollment; network fees may apply."
                : "Connect your Solana wallet to create a Glider portfolio for this strategy.")}
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between text-[12px]">
        <span className="text-ds-muted">Target assets</span>
        <span className="font-medium text-ds-ink">{assetCount}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="text-ds-muted">Funding</span>
        <span className="font-medium text-ds-ink">{enrolled ? "USDC on Solana" : "After enrollment"}</span>
      </div>
      <Button
        variant="primary"
        size="lg"
        onClick={onReview}
        disabled={!signedIn || busy || checking || blocked}
        className="mt-6 w-full"
      >
        {enrolled
          ? "Fund with USDC"
          : checking
            ? "Checking portfolio…"
            : blocked
              ? "Portfolio unavailable"
              : busy
                ? "Preparing enrollment…"
                : !signedIn
                  ? "Sign in to enroll"
                  : "Review enrollment"}
      </Button>
    </RailCard>
  );
};

interface EnrollmentSheetProps {
  open: boolean;
  name: string;
  assetCount: number;
  walletReady: boolean;
  busy: boolean;
  completed: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

export const EnrollmentSheet = ({
  open,
  name,
  assetCount,
  walletReady,
  busy,
  completed,
  error,
  onClose,
  onConfirm,
}: EnrollmentSheetProps) => (
  <Dialog open={open} onClose={onClose} labelledBy="basket-enrollment-title" className="max-w-[520px]">
    {completed ? (
      <div className="px-6 py-10 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <h2 id="basket-enrollment-title" className="mt-4 text-[20px] font-medium text-ds-ink">
          Portfolio ready
        </h2>
        <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-[1.45] text-ds-muted">
          Your {name} portfolio is enrolled. Funding with USDC is a separate step you can review next.
        </p>
        <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">
          Done
        </Button>
      </div>
    ) : (
      <>
        <div className="px-6 pt-6 pb-6">
          <h2 id="basket-enrollment-title" className="text-[20px] font-medium text-ds-ink">
            Enroll in {name}
          </h2>
          <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
            Review this step before signing with your Solana wallet.
          </p>
          <dl className="mt-6 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ds-muted">Strategy</dt>
              <dd className="text-right font-medium text-ds-ink">{name}</dd>
            </div>
            <div className="mt-3 flex justify-between gap-4">
              <dt className="text-ds-muted">Composition</dt>
              <dd className="font-medium text-ds-ink">{assetCount} target assets</dd>
            </div>
            <div className="mt-3 flex justify-between gap-4">
              <dt className="text-ds-muted">Ownership</dt>
              <dd className="text-right font-medium text-ds-ink">Your Glider smart account</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
            No USDC is invested now. Enrollment creates your own portfolio; you can fund it afterward. Your
            wallet may ask you to sign, and network fees may apply.
          </p>
          {!walletReady && (
            <p className="mt-3 text-[12px] text-ds-muted">
              Waiting for your Solana wallet before enrollment can continue.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn"
            >
              <Alert className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2.5 border-t border-ds-divider px-6 py-4">
          <Button size="lg" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={busy}
            disabled={!walletReady}
            onClick={onConfirm}
            className="flex-[1.6]"
          >
            Enroll now
          </Button>
        </div>
      </>
    )}
  </Dialog>
);

interface FundingSheetProps {
  open: boolean;
  name: string;
  amount: string;
  onAmount: (amount: string) => void;
  cash: number | null;
  cashUnavailable?: boolean;
  portfolio: ManagedBasketPortfolio;
  review: boolean;
  busy: boolean;
  walletReady: boolean;
  receipt: { signature: string; status: "confirmed" | "pending" } | null;
  error?: string | undefined;
  onReview: () => void;
  onBack: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

/** Reviewed USDC transfer; a confirmed send is not yet a completed Glider rebalance. */
export const FundingSheet = ({
  open,
  name,
  amount,
  onAmount,
  cash,
  cashUnavailable = false,
  portfolio,
  review,
  busy,
  walletReady,
  receipt,
  error,
  onReview,
  onBack,
  onConfirm,
  onClose,
}: FundingSheetProps) => {
  const account = portfolio.smartAccounts.find((item) => item.accountId.startsWith("solana:"));
  const destination = account?.depositAccountId ?? account?.accountId;
  const address = destination?.split(":").at(-1) ?? "Unavailable";
  const source = portfolio.ownerAccountId.split(":").at(-1) ?? "Unavailable";
  const validAmount = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
  const overCash = cash !== null && validAmount && Number(amount) > cash;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="basket-funding-title" className="max-w-[520px]">
      {receipt ? (
        <div className="px-6 py-10 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
            <Check className="size-5" />
          </span>
          <h2 id="basket-funding-title" className="mt-4 text-[20px] font-medium text-ds-ink">
            {receipt.status === "confirmed" ? "USDC transfer confirmed" : "USDC transfer submitted"}
          </h2>
          <p className="mx-auto mt-3 max-w-[40ch] text-[14px] leading-[1.45] text-ds-muted">
            {receipt.status === "confirmed"
              ? "The transfer is on Solana. Glider may hold USDC until the next rebalance; asset positions are not confirmed yet."
              : "The transfer is pending on Solana. Check your wallet before sending again; asset positions are not confirmed yet."}
          </p>
          <p className="mt-3 break-all text-[11px] text-ds-muted">Transaction: {receipt.signature}</p>
          <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="px-6 pt-6 pb-6">
            <h2 id="basket-funding-title" className="text-[20px] font-medium text-ds-ink">
              {review ? "Review USDC transfer" : `Fund ${name}`}
            </h2>
            <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
              {review
                ? "Your wallet will sign this transfer after you confirm."
                : "Send USDC from your wallet to your Glider portfolio on Solana."}
            </p>
            {review ? (
              <dl className="mt-6 space-y-3 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-ds-muted">Amount</dt>
                  <dd className="font-medium text-ds-ink">{amount} USDC</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ds-muted">Network</dt>
                  <dd className="font-medium text-ds-ink">Solana mainnet</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ds-muted">Network cost</dt>
                  <dd className="font-medium text-ds-ink">SOL network fee paid by your wallet</dd>
                </div>
                <div>
                  <dt className="text-ds-muted">Source wallet</dt>
                  <dd className="mt-1 break-all font-mono text-[12px] text-ds-ink">{source}</dd>
                </div>
                <div>
                  <dt className="text-ds-muted">Glider portfolio destination</dt>
                  <dd className="mt-1 break-all font-mono text-[12px] text-ds-ink">{address}</dd>
                </div>
              </dl>
            ) : (
              <AmountWell raw={amount} onRaw={onAmount} />
            )}
            <p className="mt-3 text-[12px] text-ds-muted">
              {cash === null
                ? cashUnavailable
                  ? "Wallet cash is unavailable right now."
                  : "Checking available cash…"
                : `${usd(cash)} available in your wallet`}
            </p>
            <p
              className={`mt-2 min-h-[18px] text-[12px] ${overCash ? "text-ds-chip-down" : "text-ds-muted"}`}
              aria-live="polite"
            >
              {overCash ? (
                <>
                  More than your cash.{" "}
                  <Link to="/money" className="font-medium text-ds-ink underline underline-offset-2">
                    Add cash
                  </Link>
                </>
              ) : validAmount && cash !== null ? (
                "Amount is within your USDC balance."
              ) : null}
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
              This sends USDC, not a basket token. Glider may hold it as cash until a rebalance executes. You
              need enough SOL for network fees and account rent.
            </p>
            {!walletReady && (
              <p className="mt-3 text-[12px] text-ds-muted">Waiting for your Solana wallet.</p>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn"
              >
                <Alert className="mt-px size-3.5 shrink-0" />
                <span>{error} Check your wallet balance before trying again.</span>
              </p>
            )}
          </div>
          <div className="flex gap-2.5 border-t border-ds-divider px-6 py-4">
            <Button size="lg" onClick={review ? onBack : onClose} disabled={busy} className="flex-1">
              {review ? "Back" : "Cancel"}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              disabled={
                !validAmount || cash === null || overCash || !destination || !walletReady || Boolean(error)
              }
              onClick={review ? onConfirm : onReview}
              className="flex-[1.6]"
            >
              {review ? "Sign and send USDC" : "Review transfer"}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
};
