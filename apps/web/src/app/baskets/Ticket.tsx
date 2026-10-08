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
        <AmountWell raw={amount} onRaw={onAmount} cash={cash} />
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
                  ? `Review ${usd(Number(amount))}`
                  : "Review"}
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
const SheetHead = ({
  id = "basket-invest-title",
  mark,
  title,
  sub,
}: {
  id?: string;
  mark: ReactNode;
  title: string;
  sub?: string | undefined;
}) => (
  <div className="flex items-center gap-3 px-5 pt-5">
    <span className="shrink-0">{mark}</span>
    <div className="min-w-0">
      <h2 id={id} className="truncate text-[20px] leading-none font-medium text-ds-ink">
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

/** What happens after signing, where it will be read: a callout, not a footnote. */
const SheetNote = ({ children }: { children: ReactNode }) => (
  <p className="mt-1 flex items-start gap-2 rounded-lg bg-ds-warn-chip px-4 py-3 text-[12px] leading-[1.45] text-ds-chip-warn">
    <Clock className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

const RebalanceNote = () => (
  <SheetNote>
    Your USDC sits in your portfolio until Glider’s next daily rebalance, which buys the target assets.
  </SheetNote>
);

const SheetFoot = ({ children }: { children: ReactNode }) => (
  <div className="mt-5 flex gap-2.5 px-5 pb-4">{children}</div>
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
  /** The basket's lead marks, set at 40 in the head. */
  mark: ReactNode;
  assetCount: number;
  busy: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Built from the same pieces as the sheet that puts money in, because it is the
 * same moment: a basket named at the top, the facts on one grey panel, what
 * happens after signing in the callout, and the two buttons.
 */
export const RebalanceSheet = ({
  open,
  name,
  mark,
  assetCount,
  busy,
  error,
  onClose,
  onConfirm,
}: RebalanceSheetProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    labelledBy="basket-rebalance-title"
    className="max-w-[480px] rounded-xl! p-1"
  >
    <SheetHead
      id="basket-rebalance-title"
      mark={mark}
      title={`Rebalance ${name}`}
      sub={`${assetCount} target ${assetCount === 1 ? "asset" : "assets"} · On Glider`}
    />
    <div className="mt-5 rounded-lg bg-ds-panel px-4 py-4">
      <dl className="flex flex-col gap-3">
        <TipLine k="Target assets">{assetCount}</TipLine>
        <TipLine k="Rebalancing" tip={REBALANCE_TIP}>
          Daily
        </TipLine>
        <TipLine
          k="Execution"
          tip="Glider trades in the background. The sheet closes once it has accepted the request, not once the trades have settled."
        >
          Starts asynchronously
        </TipLine>
      </dl>
    </div>
    <SheetNote>
      Your holdings may differ from the target weights until this completes, and trading them costs network
      and swap fees. A short cooldown may apply afterwards.
    </SheetNote>
    {error && <SheetError>{error}</SheetError>}
    <SheetFoot>
      <Button size="lg" onClick={onClose} disabled={busy} className="flex-1">
        Cancel
      </Button>
      <Button variant="primary" size="lg" loading={busy} onClick={onConfirm} className="flex-[1.6]">
        Confirm rebalance
      </Button>
    </SheetFoot>
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
  /** The basket's lead marks, set at 40 in the head. */
  mark: ReactNode;
  /** Each holding's own mark, by asset id: the page knows the tickers, this sheet only has symbols. */
  assetMarks: ReadonlyMap<string, ReactNode>;
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

/** One holding, named: its mark and what it is, faded once nothing is being taken. */
const Identity = ({
  mark,
  symbol,
  detail,
  dimmed,
}: {
  mark: ReactNode;
  symbol: string;
  detail: string;
  dimmed: boolean;
}) => (
  <div className={`flex min-w-0 flex-1 items-center gap-3 ${dimmed ? "opacity-55" : ""}`}>
    <span className="shrink-0">{mark}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">{symbol}</span>
      <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">{detail}</span>
    </span>
  </div>
);

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
    exitAssets(account).map((asset) => [asset.assetId, tokenAmount(asset.balanceRaw, asset.decimals)]),
  ) as Record<string, string>;

/** The review always displays Glider's signed amounts, not the editable draft. */
export const ExitSheet = ({
  open,
  name,
  mark,
  assetMarks,
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
      const amount = selection[asset.assetId] ?? "";
      /* Nothing asked for is nothing withdrawn, which is a choice rather than a mistake. */
      if (amount.trim() === "") continue;
      const raw = rawTokenAmount(amount, asset.decimals);
      if (raw === null) {
        selectionError = `Enter a valid ${asset.symbol} amount.`;
        break;
      }
      if (raw === 0n) continue;
      if (raw > BigInt(asset.balanceRaw)) {
        selectionError = `${asset.symbol} exceeds your portfolio balance.`;
        break;
      }
      selectedAssets.push({ assetId: asset.assetId, amountRaw: raw.toString() });
    }
    if (!selectionError && selectedAssets.length === 0)
      selectionError = "Enter an amount for at least one asset.";
    if (!selectionError && selectedAssets.length > 10)
      selectionError = "Choose up to 10 assets per withdrawal.";
  }
  const taking = (asset: (typeof available)[number]) =>
    (rawTokenAmount(selection[asset.assetId] ?? "", asset.decimals) ?? 0n) > 0n;
  /* What a withdrawn amount of a holding is worth, as a share of that holding. */
  const valueOf = (assetId: string, amountRaw: string) => {
    const holding = byAsset.get(assetId);
    const balance = Number(holding?.balanceRaw ?? 0);
    if (holding === undefined || balance <= 0) return 0;
    return Number(holding.valueUsd) * (Number(amountRaw) / balance);
  };
  /*
   * What is actually going, at each step: the signed list once there is one,
   * the ticked rows while choosing, and the whole portfolio when nothing has
   * been narrowed. Falling back to the portfolio after signing said two assets
   * over a list naming one.
   */
  const going: readonly { assetId: string; amountRaw: string }[] = prepared
    ? prepared.message.assets
    : manual
      ? available.filter(taking).map((asset) => ({
          assetId: asset.assetId,
          amountRaw: (rawTokenAmount(selection[asset.assetId] ?? "", asset.decimals) ?? 0n).toString(),
        }))
      : available.map((asset) => ({ assetId: asset.assetId, amountRaw: asset.balanceRaw }));
  const selectedCount = going.length;
  const withdrawingUsd = going.reduce((sum, item) => sum + valueOf(item.assetId, item.amountRaw), 0);
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
      className="flex max-h-[min(86vh,780px)] max-w-[480px] flex-col rounded-xl! p-1"
    >
      {submitted ? (
        <div className="px-5 py-10 text-center">
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
          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            <SheetHead
              id="basket-exit-title"
              mark={mark}
              title={prepared ? "Review withdrawal" : `Withdraw ${name}`}
              sub={
                prepared
                  ? "Check this before your wallet signs it"
                  : `${count} ${count === 1 ? "asset" : "assets"} · ${usd(account.totalValueUsd)}`
              }
            />
            {!prepared && (
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-ds-panel p-1 text-[13px]">
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
            <div className="mt-3">
              <SwapPanel
                before={
                  prepared ? (
                    <>
                      <div className="px-4 pt-3 pb-3 text-[13px]">
                        <p className="font-medium text-ds-ink">
                          {mode === "in_kind" ? "Assets to receive" : "Assets Glider will convert"}
                        </p>
                        <p className="mt-1 text-[12px] text-ds-muted">
                          Signed exactly as listed. Your wallet will show the same amounts.
                        </p>
                      </div>
                      <div className="max-h-44 space-y-1 overflow-y-auto">
                        {prepared.message.assets.map((asset) => {
                          const holding = byAsset.get(asset.assetId);
                          return (
                            <div
                              key={asset.assetId}
                              className="flex items-center gap-3 rounded-md bg-white px-4 py-3"
                            >
                              <Identity
                                mark={assetMarks.get(asset.assetId)}
                                symbol={holding?.symbol ?? asset.assetId}
                                detail={
                                  holding ? usd(valueOf(asset.assetId, asset.amountRaw)) : "Unlisted token"
                                }
                                dimmed={false}
                              />
                              <span className="shrink-0 text-[14px] leading-[18px] font-medium tabular-nums text-ds-ink">
                                {holding
                                  ? tokenAmount(asset.amountRaw, holding.decimals)
                                  : `${asset.amountRaw} raw`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="h-1" />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 text-[13px]">
                        <div>
                          <p className="font-medium text-ds-ink">
                            {mode === "in_kind" ? "Assets to withdraw" : "Assets to convert"}
                          </p>
                          <p className="mt-1 text-[12px] text-ds-muted">
                            {manual
                              ? "Set how much of each to take. Leave one empty to keep it."
                              : mode === "in_kind"
                                ? "All assets are set to their full balance."
                                : "Glider will convert eligible assets to USDC."}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[12px] text-ds-muted">Customize</span>
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
                        </span>
                      </div>
                      <div className="space-y-1">
                        {available.map((asset) => {
                          const full = tokenAmount(asset.balanceRaw, asset.decimals);
                          const amount = selection[asset.assetId] ?? full;
                          const taken = (rawTokenAmount(amount, asset.decimals) ?? 0n) > 0n;
                          return (
                            <div
                              key={asset.assetId}
                              className={`flex items-center gap-3 rounded-md px-4 py-3 transition-colors ${
                                taken || !manual ? "bg-white" : "hover:bg-white/60"
                              }`}
                            >
                              <Identity
                                mark={assetMarks.get(asset.assetId)}
                                symbol={asset.symbol}
                                detail={manual ? `Available ${full}` : usd(asset.valueUsd)}
                                dimmed={manual && !taken}
                              />
                              {manual ? (
                                <label className="flex h-9 w-[168px] shrink-0 items-center gap-1 rounded-lg bg-ds-panel px-3 focus-within:outline-1 focus-within:outline-black/10 has-disabled:opacity-40">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    aria-label={`${asset.symbol} withdrawal amount`}
                                    value={amount}
                                    disabled={busy}
                                    onChange={(event) =>
                                      setSelection((current) => ({
                                        ...current,
                                        [asset.assetId]: event.target.value,
                                      }))
                                    }
                                    className="w-full min-w-0 bg-transparent text-right tabular-nums text-ds-ink outline-none"
                                  />
                                  <button
                                    type="button"
                                    disabled={busy}
                                    aria-label={
                                      taken ? `Leave all ${asset.symbol}` : `Withdraw all ${asset.symbol}`
                                    }
                                    onClick={() =>
                                      setSelection((current) => ({
                                        ...current,
                                        [asset.assetId]: taken ? "" : full,
                                      }))
                                    }
                                    className="shrink-0 text-[11px] font-medium text-ds-link hover:opacity-80 disabled:opacity-40"
                                  >
                                    {taken ? "None" : "Max"}
                                  </button>
                                </label>
                              ) : (
                                <span className="shrink-0 truncate tabular-nums text-ds-ink">
                                  {tokenAmount(asset.balanceRaw, asset.decimals)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {selectionError && (
                        <p role="alert" className="px-4 pt-2 text-[12px] text-ds-chip-warn">
                          {selectionError}
                        </p>
                      )}
                      {/* The wells read as the next card in the stack, not a new panel. */}
                      <div className="h-1" />
                    </>
                  )
                }
                from={
                  <Well
                    label="You withdraw"
                    value={String(selectedCount)}
                    unit={selectedCount === 1 ? "asset" : "assets"}
                    sub={`Worth ${usd(withdrawingUsd)}`}
                  />
                }
                to={
                  <Well
                    label="You get"
                    value={mode === "in_kind" ? String(selectedCount) : usd(withdrawingUsd)}
                    unit={mode === "in_kind" ? "tokens" : "USDC"}
                    sub={mode === "in_kind" ? "In your wallet" : "After the swap"}
                  />
                }
              >
                <dl className="flex flex-col gap-3">
                  {manual && <TipLine k="Portfolio value">{usd(account.totalValueUsd)}</TipLine>}
                  <TipLine
                    k="Assets in account"
                    tip="Everything the portfolio holds, whether or not this withdrawal takes it."
                  >
                    {count}
                  </TipLine>
                  <TipLine k="Destination" tip={`Your Solana wallet · ${destination}`}>
                    Wallet · {short(destination)}
                  </TipLine>
                </dl>
              </SwapPanel>
            </div>
            <SheetNote>
              {mode === "in_kind"
                ? "These tokens move to your wallet without being sold. Anything left behind may rebalance on the next scheduled run, and values can shift while it settles."
                : "Glider sells the listed assets for USDC and sends the proceeds to your wallet. Small or illiquid balances may stay behind and rebalance later."}
            </SheetNote>
            {!walletReady && (
              <p className="mx-5 mt-3 text-[12px] text-ds-muted">Waiting for your Solana wallet…</p>
            )}
            {error && (
              <SheetError>
                {error}{" "}
                {prepared &&
                  "If submission is uncertain, retry this same authorization; do not start a new withdrawal."}
              </SheetError>
            )}
          </div>
          <SheetFoot>
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
          </SheetFoot>
        </>
      )}
    </Dialog>
  );
};
