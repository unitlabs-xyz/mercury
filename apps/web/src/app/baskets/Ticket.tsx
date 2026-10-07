import type {
  BasketExitAsset,
  BasketExitMode,
  ManagedBasketPortfolio,
  ManagedBasketPortfolioSnapshot,
  PreparedBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import { usd } from "@mercury/view";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { RailHead } from "../../ui/ds";
import { RailLine } from "../stock/Panels";
import { Alert, Check, Clock } from "../../ui/icons";
import { Skeleton } from "../portfolio/ui";
import { AmountWell } from "../stock/Ticket";
import { SwapPanel, TipLine, Well } from "../review";

const AMOUNT = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/;
const validUsdc = (amount: string) => AMOUNT.test(amount) && Number(amount) > 0;
const short = (address: string | undefined) =>
  address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Unavailable";

interface EnrollmentRailProps {
  name: string;
  assetCount: number;
  portfolio: Pick<ManagedBasketPortfolio, "portfolioId" | "smartAccounts"> | null;
  signedIn: boolean;
  walletMissing?: boolean | undefined;
  busy: boolean;
  checking?: boolean | undefined;
  lookupFailed?: boolean | undefined;
  blocked?: boolean | undefined;
  error?: string | undefined;
  amount: string;
  onAmount: (amount: string) => void;
  cash: number | null;
  onReview: () => void;
  onRetry: () => void;
}

/**
 * The strategy's ticket, set like the stock page's Buy card: the amount in a
 * well with presets, three lines of fact, one button. The steps behind the
 * button (a one-time set-up, then the transfer) are the sheet's to explain.
 */
export const EnrollmentRail = ({
  name,
  assetCount,
  portfolio,
  signedIn,
  walletMissing = false,
  busy,
  checking = false,
  lookupFailed = false,
  blocked = false,
  error,
  amount,
  onAmount,
  cash,
  onReview,
  onRetry,
}: EnrollmentRailProps) => {
  const enrolled = portfolio !== null;
  const address = portfolio?.smartAccounts
    .find((account) => account.accountId.startsWith("solana:"))
    ?.accountId.split(":")
    .at(-1);
  const valid = validUsdc(amount);
  const overCash = cash !== null && valid && Number(amount) > cash;
  const notice = checking
    ? null
    : lookupFailed
      ? "We couldn't check your portfolio."
      : walletMissing
        ? "Connect a Solana wallet to invest."
        : !signedIn
          ? "Sign in to invest."
          : blocked && !enrolled
            ? "This strategy isn't open to new portfolios right now."
            : (error ?? null);
  return (
    <section aria-label={`Invest in ${name}`} className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title={`Invest in ${name}`} meta={cash === null ? undefined : `${usd(cash)} cash`} />
      </div>
      {checking ? (
        <div className="mt-[11px] rounded-lg bg-ds-panel p-1" aria-label="Checking your portfolio">
          <Skeleton className="h-15 w-full rounded-md bg-white" />
          <Skeleton className="mt-1 h-9 w-full rounded-md" />
        </div>
      ) : (
        <AmountWell raw={amount} onRaw={onAmount} />
      )}
      {overCash && (
        <p className="mx-5 mt-2.5 text-[12px] leading-[1.45] text-ds-muted">
          More than your cash.{" "}
          <Link to="/money" className="font-medium text-ds-ink underline underline-offset-2">
            Add cash
          </Link>
        </p>
      )}
      <dl className="flex flex-col gap-3 px-5 pt-5">
        <RailLine k="Target assets">{assetCount}</RailLine>
        <RailLine k="Rebalancing">Daily</RailLine>
        <RailLine k="Your portfolio">
          {checking ? (
            "Checking…"
          ) : address ? (
            <a
              href={`https://solscan.io/account/${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View smart account ${address} on Solscan`}
              className="text-ds-link hover:underline"
            >
              {short(address)} ↗
            </a>
          ) : (
            "Set up on first deposit"
          )}
        </RailLine>
      </dl>
      {notice && <p className="mx-5 mt-4 text-[12px] leading-[1.45] text-ds-muted">{notice}</p>}
      <div className="px-5 pt-5 pb-5">
        <Button
          variant="primary"
          size="lg"
          onClick={lookupFailed ? onRetry : onReview}
          disabled={
            !signedIn ||
            walletMissing ||
            busy ||
            checking ||
            (blocked && !lookupFailed) ||
            (!lookupFailed && (!valid || overCash || cash === null))
          }
          className="w-full"
        >
          {checking
            ? "Checking portfolio…"
            : lookupFailed
              ? "Retry portfolio check"
              : busy
                ? "Setting up portfolio…"
                : valid
                  ? `Invest ${usd(Number(amount))}`
                  : "Invest"}
        </Button>
      </div>
    </section>
  );
};

/**
 * The two steps of a first deposit as a short timeline: a 24px mark joined to
 * the next by a hairline, the step at 14, a line at 12, and where it stands on
 * the right.
 */
const Steps = ({ current, amount }: { current: 1 | 2; amount: string }) => {
  const steps = [
    { label: "Set up your portfolio", sub: "One-time signature. No USDC moves." },
    { label: sendLabel(amount), sub: "Sign the transfer to your portfolio." },
  ];
  return (
    <ol className="flex flex-col gap-4" aria-label={`Step ${current} of 2`}>
      {steps.map((step, index) => {
        const n = index + 1;
        const state = n < current ? "done" : n === current ? "active" : "next";
        return (
          <li
            key={n}
            aria-current={state === "active" ? "step" : undefined}
            className="relative grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3"
          >
            {n < steps.length && (
              <span aria-hidden="true" className="absolute top-7 -bottom-3 left-[11.5px] w-px bg-black/10" />
            )}
            <span
              className={`grid size-6 place-items-center rounded-full text-[12px] leading-none font-medium ${
                state === "done"
                  ? "bg-ds-up-chip text-ds-up"
                  : state === "active"
                    ? "bg-ds-ink text-white"
                    : "bg-ds-panel text-ds-muted"
              }`}
            >
              {state === "done" ? <Check className="size-3" /> : n}
            </span>
            <span className="min-w-0 pt-[3px]">
              <span
                className={`block text-[14px] leading-[18px] ${state === "next" ? "text-ds-muted" : "font-medium text-ds-ink"}`}
              >
                {step.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{step.sub}</span>
            </span>
            <span className="pt-[5px] text-[12px] leading-none text-ds-muted">
              {state === "done" ? "Done" : state === "active" ? "Now" : "Next"}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const SheetError = ({ children }: { children: ReactNode }) => (
  <p
    role="alert"
    className="mx-5 mt-4 flex gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down"
  >
    <Alert className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

/**
 * The sheet's top, as on the stock order sheet: the basket's lead marks at 40,
 * the title at 20, one grey line under it.
 */
const SheetHead = ({ mark, title, sub }: { mark: ReactNode; title: string; sub?: string | undefined }) => (
  <div className="flex items-center gap-3 px-5 pt-5">
    <span className="shrink-0">{mark}</span>
    <div className="min-w-0">
      <h2 id="basket-invest-title" className="truncate text-[20px] leading-none font-medium text-ds-ink">
        {title}
      </h2>
      {sub && <p className="mt-2 truncate text-[14px] leading-none text-ds-muted">{sub}</p>}
    </div>
  </div>
);

/**
 * The amount chosen on the page, reviewed as a swap — dollars out of the
 * wallet on the left, the strategy's assets on the right — with the facts on
 * the same grey. A review, not a second ticket: Cancel goes back to change it.
 */
const Swap = ({
  amount,
  assetCount,
  children,
}: {
  amount: string;
  assetCount: number;
  children: ReactNode;
}) => (
  <div className="mt-5">
    <SwapPanel
      from={<Well label="You pay" value={validUsdc(amount) ? usd(Number(amount)) : "—"} unit="USDC" />}
      to={<Well label="You get" value={String(assetCount)} unit="assets" sub="At target weights" />}
    >
      <dl className="flex flex-col gap-3">{children}</dl>
    </SwapPanel>
  </div>
);

const REBALANCE_TIP =
  "Glider checks your portfolio against the target weights every day and trades back toward them.";

/** When the money is actually invested: worth seeing before signing, so it is a callout, not a footnote. */
const RebalanceNote = () => (
  <p className="mt-1 flex items-start gap-2 rounded-lg bg-ds-warn-chip px-4 py-3 text-[12px] leading-[1.45] text-ds-chip-warn">
    <Clock className="mt-px size-3.5 shrink-0" />
    Your USDC sits in your portfolio until Glider’s next daily rebalance, which buys the target assets.
  </p>
);

const SheetFoot = ({ children }: { children: ReactNode }) => (
  <div className="mt-4 flex gap-2.5 border-t border-ds-divider px-5 py-4">{children}</div>
);

const sendLabel = (amount: string) => (validUsdc(amount) ? `Send ${usd(Number(amount))}` : "Send USDC");

interface EnrollmentStepProps {
  name: string;
  mark: ReactNode;
  assetCount: number;
  amount: string;
  cash: number | null;
  walletReady: boolean;
  busy: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

/** Step 1 of a first deposit: one signature creates the user's own Glider portfolio. */
const EnrollmentStep = ({
  name,
  mark,
  assetCount,
  amount,
  cash,
  walletReady,
  busy,
  error,
  onClose,
  onConfirm,
}: EnrollmentStepProps) => (
  <>
    <SheetHead
      mark={mark}
      title={`Invest in ${name}`}
      sub={cash === null ? "Step 1 of 2" : `${usd(cash)} available · Step 1 of 2`}
    />
    <Swap amount={amount} assetCount={assetCount}>
      <TipLine
        k="Your portfolio"
        tip="Your own smart account on Glider. The assets are held in it for you, not pooled into one basket token."
      >
        New
      </TipLine>
      <TipLine k="Rebalancing" tip={REBALANCE_TIP}>
        Daily
      </TipLine>
    </Swap>
    <div className="px-5 pt-5">
      <Steps current={1} amount={amount} />
    </div>
    {!walletReady && <p className="mx-5 mt-4 text-[12px] text-ds-muted">Waiting for your wallet…</p>}
    {error && <SheetError>{error}</SheetError>}
    <SheetFoot>
      <Button size="lg" onClick={onClose} disabled={busy} className="flex-1">
        Cancel
      </Button>
      <Button
        variant="primary"
        size="lg"
        loading={busy}
        disabled={!walletReady || !validUsdc(amount) || (cash !== null && Number(amount) > cash)}
        onClick={onConfirm}
        className="flex-[1.6]"
      >
        Set up portfolio
      </Button>
    </SheetFoot>
  </>
);

interface RebalanceSheetProps {
  open: boolean;
  name: string;
  assetCount: number;
  busy: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

export const RebalanceSheet = ({
  open,
  name,
  assetCount,
  busy,
  error,
  onClose,
  onConfirm,
}: RebalanceSheetProps) => (
  <Dialog open={open} onClose={onClose} labelledBy="basket-rebalance-title" className="max-w-[520px]">
    <div className="px-6 pt-6 pb-6">
      <h2 id="basket-rebalance-title" className="text-[20px] font-medium text-ds-ink">
        Rebalance {name}
      </h2>
      <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
        Glider will work toward this strategy’s target weights in your smart account. This can trade assets
        and incur network and swap fees.
      </p>
      <dl className="mt-6 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-ds-muted">Target assets</dt>
          <dd className="font-medium text-ds-ink">{assetCount}</dd>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <dt className="text-ds-muted">Execution</dt>
          <dd className="font-medium text-ds-ink">Starts asynchronously</dd>
        </div>
      </dl>
      <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
        Your holdings may differ from target weights until the operation completes. A short cooldown may apply
        after submission.
      </p>
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
      <Button variant="primary" size="lg" loading={busy} onClick={onConfirm} className="flex-[1.6]">
        Confirm rebalance
      </Button>
    </div>
  </Dialog>
);

interface FundingStepProps {
  name: string;
  mark: ReactNode;
  assetCount: number;
  /** Set when this follows set-up in the same sheet: the sub line says step 2. */
  firstDeposit: boolean;
  amount: string;
  cash: number | null;
  portfolio: ManagedBasketPortfolio;
  busy: boolean;
  walletReady: boolean;
  receipt: { signature: string; status: "confirmed" | "pending" } | null;
  error?: string | undefined;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The USDC transfer, set like the stock order sheet: the amount, where it goes
 * from and to, when it is invested, then sign. The same whether it follows
 * set-up or is a later top-up; only the sub line differs.
 */
const FundingStep = ({
  name,
  mark,
  assetCount,
  firstDeposit,
  amount,
  cash,
  portfolio,
  busy,
  walletReady,
  receipt,
  error,
  onConfirm,
  onClose,
}: FundingStepProps) => {
  const account = portfolio.smartAccounts.find((item) => item.accountId.startsWith("solana:"));
  const destination = account?.depositAccountId ?? account?.accountId;
  const valid = validUsdc(amount);
  const over = cash !== null && valid && Number(amount) > cash;

  if (receipt) {
    return (
      <div className="px-5 pt-8 pb-5 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <h2 id="basket-invest-title" className="mt-4 text-[20px] leading-none font-medium text-ds-ink">
          {receipt.status === "confirmed" ? `${usd(Number(amount))} sent` : "Transfer submitted"}
        </h2>
        <p className="mx-auto mt-3 max-w-[34ch] text-[14px] leading-[1.45] text-ds-muted">
          {receipt.status === "confirmed"
            ? `Glider invests it in ${name} at the next daily rebalance.`
            : "Still confirming. Check your wallet before sending again."}
        </p>
        <a
          href={`https://solscan.io/tx/${encodeURIComponent(receipt.signature)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[12px] font-medium text-ds-link hover:underline"
        >
          View transaction ↗
        </a>
        <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">
          Done
        </Button>
      </div>
    );
  }

  const available = cash === null ? undefined : `${usd(cash)} available`;
  return (
    <>
      <SheetHead
        mark={mark}
        title={firstDeposit ? `Invest in ${name}` : `Fund ${name}`}
        sub={firstDeposit ? [available, "Step 2 of 2"].filter(Boolean).join(" · ") : available}
      />
      <Swap amount={amount} assetCount={assetCount}>
        <TipLine k="From">Wallet · {short(portfolio.ownerAccountId.split(":").at(-1))}</TipLine>
        <TipLine k="To" tip="Your own smart account on Glider, where the USDC waits for the next rebalance.">
          Portfolio · {short(destination?.split(":").at(-1))}
        </TipLine>
        <TipLine k="Rebalancing" tip={REBALANCE_TIP}>
          Daily
        </TipLine>
      </Swap>
      <RebalanceNote />
      {!walletReady && <p className="mx-5 mt-3 text-[12px] text-ds-muted">Waiting for your wallet…</p>}
      {error && <SheetError>{error} Check your wallet balance before trying again.</SheetError>}
      <SheetFoot>
        <Button size="lg" onClick={onClose} disabled={busy} className="flex-1">
          {firstDeposit ? "Later" : "Cancel"}
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          disabled={!valid || over || !destination || !walletReady || Boolean(error)}
          onClick={onConfirm}
          className="flex-[1.6]"
        >
          {sendLabel(amount)}
        </Button>
      </SheetFoot>
    </>
  );
};

interface InvestSheetProps {
  open: boolean;
  name: string;
  /** The basket's lead marks, set at 40 in the head. */
  mark: ReactNode;
  assetCount: number;
  amount: string;
  cash: number | null;
  /** The user's portfolio once set up; until then the sheet is on step 1. */
  portfolio: ManagedBasketPortfolio | null;
  /** Opened before set-up: the transfer is step 2 of 2. */
  firstDeposit: boolean;
  receipt: FundingStepProps["receipt"];
  enroll: { walletReady: boolean; busy: boolean; error?: string | undefined; onConfirm: () => void };
  fund: { walletReady: boolean; busy: boolean; error?: string | undefined; onConfirm: () => void };
  onClose: () => void;
}

/**
 * One sheet for putting money in, built like the stock order sheet. Not set up
 * yet: step 1 creates the portfolio and the same sheet moves on to the
 * transfer. Set up: it opens on the transfer.
 */
export const InvestSheet = ({
  open,
  name,
  mark,
  assetCount,
  amount,
  cash,
  portfolio,
  firstDeposit,
  receipt,
  enroll,
  fund,
  onClose,
}: InvestSheetProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    labelledBy="basket-invest-title"
    className="max-w-[480px] rounded-xl! p-1"
  >
    {portfolio ? (
      <FundingStep
        name={name}
        mark={mark}
        assetCount={assetCount}
        firstDeposit={firstDeposit}
        amount={amount}
        cash={cash}
        portfolio={portfolio}
        receipt={receipt}
        {...fund}
        onClose={onClose}
      />
    ) : (
      <EnrollmentStep
        name={name}
        mark={mark}
        assetCount={assetCount}
        amount={amount}
        cash={cash}
        {...enroll}
        onClose={onClose}
      />
    )}
  </Dialog>
);

interface ExitSheetProps {
  open: boolean;
  name: string;
  mode: BasketExitMode;
  onMode: (mode: BasketExitMode) => void;
  account: ManagedBasketPortfolioSnapshot;
  prepared: PreparedBasketExit | null;
  submitted: SubmittedBasketExit | null;
  busy: boolean;
  walletReady: boolean;
  error?: string | undefined;
  onPrepare: (assets?: BasketExitAsset[]) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
}

const exitAssets = (account: ManagedBasketPortfolioSnapshot) =>
  account.assets.filter(
    (asset) =>
      asset.assetId.startsWith("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:") &&
      /^[1-9]\d*$/.test(asset.balanceRaw),
  );

const tokenAmount = (raw: string, decimals: number): string => {
  if (decimals === 0) return raw;
  const digits = raw.padStart(decimals + 1, "0");
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ""}`;
};

const rawTokenAmount = (amount: string, decimals: number): bigint | null => {
  if (amount.length > 80 || !/^\d+(?:\.\d+)?$/.test(amount) || decimals < 0 || decimals > 18) return null;
  const [whole = "", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
};

const fullSelection = (account: ManagedBasketPortfolioSnapshot) =>
  Object.fromEntries(
    exitAssets(account).map((asset) => [
      asset.assetId,
      { selected: true, amount: tokenAmount(asset.balanceRaw, asset.decimals) },
    ]),
  ) as Record<string, { selected: boolean; amount: string }>;

/** The review always displays Glider's signed amounts, not the editable draft. */
export const ExitSheet = ({
  open,
  name,
  mode,
  onMode,
  account,
  prepared,
  submitted,
  busy,
  walletReady,
  error,
  onPrepare,
  onSubmit,
  onBack,
  onClose,
}: ExitSheetProps) => {
  const [manual, setManual] = useState(false);
  const [selection, setSelection] = useState(() => fullSelection(account));
  const available = exitAssets(account);
  const byAsset = new Map(account.assets.map((asset) => [asset.assetId, asset]));
  const count = available.length;
  const destination = account.ownerAccountId.split(":").at(-1) ?? "Unavailable";
  const selectedAssets: BasketExitAsset[] = [];
  let selectionError: string | null = null;
  if (manual && !prepared) {
    for (const asset of available) {
      const row = selection[asset.assetId];
      if (!row?.selected) continue;
      const raw = rawTokenAmount(row.amount, asset.decimals);
      if (raw === null || raw === 0n) {
        selectionError = `Enter a valid ${asset.symbol} amount.`;
        break;
      }
      if (raw > BigInt(asset.balanceRaw)) {
        selectionError = `${asset.symbol} exceeds your portfolio balance.`;
        break;
      }
      selectedAssets.push({ assetId: asset.assetId, amountRaw: raw.toString() });
    }
    if (!selectionError && selectedAssets.length === 0) selectionError = "Select at least one asset.";
    if (!selectionError && selectedAssets.length > 10)
      selectionError = "Choose up to 10 assets per withdrawal.";
  }
  const close = () => {
    if (busy) return;
    setManual(false);
    setSelection(fullSelection(account));
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="basket-exit-title"
      className="flex max-h-[calc(100dvh-2rem)] max-w-[520px] flex-col"
    >
      {submitted ? (
        <div className="px-6 py-10 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
            <Check className="size-5" />
          </span>
          <h2 id="basket-exit-title" className="mt-4 text-[20px] font-medium text-ds-ink">
            Withdrawal submitted
          </h2>
          <p className="mx-auto mt-3 max-w-[40ch] text-[14px] leading-[1.45] text-ds-muted">
            This is not settled yet. Track the operation under Your position; your wallet and basket balances
            will update after confirmation.
          </p>
          <Button variant="primary" size="lg" onClick={close} className="mt-6 w-full">
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-y-auto px-6 pt-6 pb-6">
            <h2 id="basket-exit-title" className="text-[20px] font-medium text-ds-ink">
              {prepared ? "Review withdrawal" : `Withdraw ${name}`}
            </h2>
            <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
              {prepared
                ? "Check the exact authorization before your wallet signs it."
                : "Choose how to move your portfolio back to your Solana wallet."}
            </p>
            {!prepared && (
              <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-ds-panel p-1 text-[13px]">
                {(["in_kind", "liquidate_usdc"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    disabled={busy}
                    onClick={() => onMode(choice)}
                    className={`rounded-md px-2 py-2.5 font-medium ${mode === choice ? "bg-white text-ds-ink shadow-sm" : "text-ds-muted hover:text-ds-ink"}`}
                  >
                    {choice === "in_kind" ? "Assets in kind" : "Convert to USDC"}
                  </button>
                ))}
              </div>
            )}
            {!prepared && (
              <div className="mt-5 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ds-ink">
                      {mode === "in_kind" ? "Assets to withdraw" : "Assets to convert"}
                    </p>
                    <p className="mt-1 text-[12px] text-ds-muted">
                      {manual
                        ? "Choose assets and enter an amount for each."
                        : mode === "in_kind"
                          ? "All assets are set to their full balance."
                          : "Glider will convert eligible assets to USDC."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={manual}
                    aria-label="Customize assets and amounts"
                    disabled={busy}
                    onClick={() => setManual((current) => !current)}
                    className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-link ${manual ? "bg-ds-ink" : "bg-ds-divider"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${manual ? "left-0.5 translate-x-5" : "left-0.5"}`}
                    />
                  </button>
                </div>
                <div className="mt-3 space-y-2 border-t border-ds-divider pt-3">
                  {available.map((asset) => {
                    const row = selection[asset.assetId] ?? {
                      selected: true,
                      amount: tokenAmount(asset.balanceRaw, asset.decimals),
                    };
                    return (
                      <div
                        key={asset.assetId}
                        className="flex items-center gap-2.5 rounded-md bg-white px-3 py-2.5"
                      >
                        {manual && (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            aria-label={`Withdraw ${asset.symbol}`}
                            disabled={busy}
                            onChange={(event) =>
                              setSelection((current) => ({
                                ...current,
                                [asset.assetId]: { ...row, selected: event.target.checked },
                              }))
                            }
                            className="size-4 shrink-0 accent-ds-ink"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ds-ink">{asset.symbol}</p>
                          {manual && (
                            <p className="text-[11px] text-ds-muted">
                              Available {tokenAmount(asset.balanceRaw, asset.decimals)}
                            </p>
                          )}
                        </div>
                        {manual ? (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              aria-label={`${asset.symbol} withdrawal amount`}
                              value={row.amount}
                              disabled={busy || !row.selected}
                              onChange={(event) =>
                                setSelection((current) => ({
                                  ...current,
                                  [asset.assetId]: { ...row, amount: event.target.value },
                                }))
                              }
                              className="w-24 min-w-0 rounded-md border border-ds-divider bg-white px-2 py-1.5 text-right tabular-nums text-ds-ink focus:border-ds-ink focus:outline-none disabled:opacity-40 sm:w-32"
                            />
                            <button
                              type="button"
                              disabled={busy || !row.selected}
                              onClick={() =>
                                setSelection((current) => ({
                                  ...current,
                                  [asset.assetId]: {
                                    selected: true,
                                    amount: tokenAmount(asset.balanceRaw, asset.decimals),
                                  },
                                }))
                              }
                              className="rounded-md px-1.5 py-1.5 text-[11px] font-medium text-ds-link hover:bg-ds-panel disabled:opacity-40"
                            >
                              Max
                            </button>
                          </div>
                        ) : (
                          <span className="shrink-0 tabular-nums text-ds-ink">
                            {tokenAmount(asset.balanceRaw, asset.decimals)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectionError && (
                  <p role="alert" className="mt-2 text-[12px] text-ds-chip-warn">
                    {selectionError}
                  </p>
                )}
              </div>
            )}
            <dl className="mt-5 space-y-3 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ds-muted">Current portfolio value</dt>
                <dd className="font-medium text-ds-ink">{usd(account.totalValueUsd)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ds-muted">Assets in account</dt>
                <dd className="font-medium text-ds-ink">{count}</dd>
              </div>
              <div>
                <dt className="text-ds-muted">Destination · your Solana wallet</dt>
                <dd className="mt-1 break-all font-mono text-[12px] text-ds-ink">{destination}</dd>
              </div>
              {prepared && (
                <div className="border-t border-ds-divider pt-3">
                  <dt className="text-ds-muted">
                    {mode === "in_kind" ? "Assets to receive" : "Assets Glider will attempt to convert"}
                  </dt>
                  <dd className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                    {prepared.message.assets.map((asset) => {
                      const holding = byAsset.get(asset.assetId);
                      return (
                        <div key={asset.assetId} className="flex justify-between gap-3 text-ds-ink">
                          <span className="truncate">{holding?.symbol ?? asset.assetId}</span>
                          <span className="shrink-0">
                            {holding
                              ? tokenAmount(asset.amountRaw, holding.decimals)
                              : `${asset.amountRaw} raw units`}
                          </span>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
              {mode === "in_kind"
                ? "The listed tokens move to your wallet without a sale. Any assets left in the portfolio may rebalance on its next scheduled run. Values may change during settlement."
                : "Glider swaps the listed eligible assets into Solana USDC and sends the proceeds to your wallet. Unselected, small, or illiquid balances may remain in the smart account and rebalance later."}
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
                <span>
                  {error}{" "}
                  {prepared &&
                    "If submission is uncertain, retry this same authorization; do not start a new withdrawal."}
                </span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2.5 border-t border-ds-divider px-6 py-4">
            <Button size="lg" onClick={prepared ? onBack : close} disabled={busy} className="flex-1">
              {prepared ? "Back" : "Cancel"}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              disabled={
                !walletReady ||
                Boolean(selectionError) ||
                (prepared !== null && Date.parse(prepared.expiresAt) <= Date.now())
              }
              onClick={prepared ? onSubmit : () => onPrepare(manual ? selectedAssets : undefined)}
              className="flex-[1.6]"
            >
              {prepared ? "Sign and submit withdrawal" : "Review withdrawal"}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
};
