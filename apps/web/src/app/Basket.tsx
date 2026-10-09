import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import type { BasketExitMode, ManagedBasketPortfolioSnapshot, ManagedBasketTemplate } from "@mercury/types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toEvent, usd, usdCompact } from "@mercury/view";
import { Link, useParams } from "react-router-dom";
import { useMoney } from "../api/hooks";
import { ChevronDown } from "../ui/icons";
import {
  basketEnrollmentEnabled,
  useBasketActivity,
  useBasketEnrollment,
  useBasketEnrollmentAction,
  useBasketExitAction,
  useBasketFundingAction,
  useBasketInsights,
  useBasketOperation,
  useBasketPortfolio,
  useBasketRebalanceAction,
  useBasketTemplate,
} from "../api/baskets";
import { useHistories, useInstruments, usePrices, type Instrument } from "../market/hooks";
import {
  Chevron,
  GlideRows,
  GlideTable,
  MoveChip,
  RailCard,
  RailFigure,
  RailHead,
  RangeSwitch,
  StatusChip,
} from "../ui/ds";
import { AppShell } from "./AppShell";
import { LiveStatusChip, PriceError } from "./LiveStatus";
import { Button } from "../ui/Button";
import { DotChart, TINY } from "./DotChart";
import { AssetIcon } from "./baskets/AssetIcon";
import { OperationStatus } from "./baskets/OperationStatus";
import { TOKEN_NAME } from "./stock/heldAs";
import { allocationRows } from "./baskets/allocation";
import { displayBasketName } from "./baskets/catalog";
import { EnrollmentRail, ExitSheet, InvestSheet, RebalanceSheet } from "./baskets/Ticket";
import { rebalanceOutcome, rebalanceTerminal } from "./baskets/rebalance-status";
import { modeledRanges, modeledSince, modeledWindow } from "@mercury/view";
import { RailList } from "./invest/Rail";
import { EventRow } from "./portfolio/Feed";
import { USDC_MINT, UsdcMark } from "./activity-mark";
import { Skeleton } from "./portfolio/ui";
import { LIST_DOT } from "./invest/shared";
import { Fact } from "./stock/Panels";

type Range = "1W" | "1M" | "3M" | "6M" | "1Y" | "All";
const WINDOWS = [
  { key: "1W", window: "1w" },
  { key: "1M", window: "1m" },
  { key: "3M", window: "3m" },
  { key: "6M", window: "6m" },
  { key: "1Y", window: "12m" },
  { key: "All", window: "all" },
] as const satisfies readonly { key: Range; window: string }[];
const RANGE_NAME: Record<Exclude<Range, "All">, string> = {
  "1W": "1-week",
  "1M": "1-month",
  "3M": "3-month",
  "6M": "6-month",
  "1Y": "1-year",
};
const weight = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
const returnLabel = (value: string) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
const TILE_TONES = [
  "bg-[#e9f2ed]",
  "bg-[#e9edf5]",
  "bg-[#f4eee7]",
  "bg-[#eeeaf4]",
  "bg-[#e7f1f1]",
  "bg-[#f3f1e9]",
  "bg-ds-tag",
];
const USDC_ASSET_ID =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const assetBalance = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—";
};
const countdownText = (remainingMs: number | null, paused: boolean) => {
  if (paused) return "Paused";
  if (remainingMs === null) return "—";
  if (remainingMs === 0) return "Due now";
  const minutes = Math.floor(Math.ceil(remainingMs / 1_000) / 60);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const RebalanceTimer = ({
  schedule,
  hasAccount,
}: {
  schedule: ManagedBasketPortfolioSnapshot["schedule"] | undefined;
  hasAccount: boolean;
}) => {
  const [clock, setClock] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const refreshClock = () => {
      if (!document.hidden) setClock(Date.now());
    };
    const timer = window.setInterval(refreshClock, 1_000);
    document.addEventListener("visibilitychange", refreshClock);
    window.addEventListener("focus", refreshClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshClock);
      window.removeEventListener("focus", refreshClock);
    };
  }, []);

  const nextDue = schedule?.nextDueAt ? Date.parse(schedule.nextDueAt) : NaN;
  const remainingMs = Number.isFinite(nextDue) ? Math.max(0, nextDue - clock) : null;
  const intervalMs = schedule?.intervalMs ?? null;
  const progress =
    schedule?.status === "active" && remainingMs !== null && intervalMs && intervalMs > 0
      ? Math.max(0, Math.min(100, 100 * (1 - remainingMs / intervalMs)))
      : 0;
  const countdown = countdownText(remainingMs, schedule?.status === "paused");
  const seconds =
    remainingMs !== null && remainingMs > 0 && schedule?.status === "active"
      ? Math.ceil(remainingMs / 1_000) % 60
      : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 text-[12px] text-ds-muted">
        <span>Time to next run</span>
        <span>{schedule?.status === "active" ? "Automatic" : "Schedule"}</span>
      </div>
      <div
        role="timer"
        aria-label={`Time to next rebalance: ${countdown}${seconds === null ? "" : ` ${seconds} seconds`}`}
        className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"
      >
        <span aria-hidden="true">
          <RailFigure value={<span className="tabular-nums">{countdown}</span>} />
        </span>
        {seconds !== null && (
          <span
            aria-hidden="true"
            className="relative inline-block h-[1em] w-[3ch] text-right text-[14px] tabular-nums text-ds-ink"
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={seconds}
                initial={reducedMotion ? false : { opacity: 0, y: 1 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -1 }}
                transition={{ duration: reducedMotion ? 0 : 0.5, ease: "easeInOut" }}
                className="absolute top-0 right-0"
              >
                {String(seconds).padStart(2, "0")}s
              </motion.span>
            </AnimatePresence>
          </span>
        )}
        {remainingMs !== null && remainingMs > 0 && schedule?.status === "active" && (
          <span aria-hidden="true" className="text-[12px] text-ds-muted">
            remaining
          </span>
        )}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <p className="text-ds-muted">Next scheduled</p>
          <p className="mt-0.5 font-medium text-ds-ink">
            {schedule?.status === "paused"
              ? "Paused"
              : Number.isFinite(nextDue)
                ? new Date(nextDue).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                : hasAccount
                  ? "Not scheduled"
                  : "Enroll to view"}
          </p>
        </div>
        <div>
          <p className="text-ds-muted">Last completed</p>
          <p className="mt-0.5 font-medium text-ds-ink">
            {schedule?.lastRebalanceAt
              ? new Date(schedule.lastRebalanceAt).toLocaleDateString(undefined, { dateStyle: "medium" })
              : "—"}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Scheduled rebalance cycle elapsed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-valuetext={
          schedule?.status === "paused"
            ? "Schedule paused"
            : schedule?.status === "active"
              ? `${countdown} until next run`
              : "Schedule unavailable"
        }
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-white"
      >
        <div
          className="h-full rounded-full bg-[#d1e7db] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </>
  );
};

const IconCluster = ({
  template,
  instruments,
  onClick,
}: {
  template: ManagedBasketTemplate;
  instruments: ReadonlyMap<string, Instrument>;
  onClick: () => void;
}) => {
  const assets = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Top holdings: ${assets
        .slice(0, 6)
        .map((a) => a.ticker)
        .join(", ")}. View strategy composition`}
      className="flex items-center -space-x-3 rounded-full pl-1 transition-opacity hover:opacity-80"
    >
      {assets.slice(0, 6).map((asset, index) => (
        <span key={asset.assetId} className="relative shrink-0" style={{ zIndex: 6 - index }}>
          <AssetIcon
            asset={asset}
            source={instruments.get(asset.ticker)}
            className="size-12 rounded-full bg-ds-panel object-contain ring-[3px] ring-white"
          />
        </span>
      ))}
      {assets.length > 6 && (
        <span className="relative !ml-1 grid size-12 shrink-0 place-items-center rounded-full bg-ds-panel text-[15px] font-medium text-ds-ink">
          +{assets.length - 6}
        </span>
      )}
    </button>
  );
};

/** A row that opens the stock's own page when Mercury lists it, and stays plain text when it doesn't. */
const StockLink = ({
  ticker,
  ...props
}: {
  ticker: string | null;
  className: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) => (ticker ? <Link to={`/invest/${ticker}`} {...props} /> : <div {...props} />);

/**
 * What the schedule looks like once there is a portfolio, blurred behind a
 * note — static, so nothing ticks for a portfolio that doesn't exist.
 */
const RebalanceLocked = ({ enrolled }: { enrolled: boolean }) => (
  <div className="relative">
    <div aria-hidden="true" inert className="pointer-events-none select-none blur-[3px] opacity-60">
      <div className="flex items-center justify-between gap-3 text-[12px] text-ds-muted">
        <span>Time to next run</span>
        <span>Automatic</span>
      </div>
      <div className="mt-3">
        <RailFigure value="14h 32m" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <p className="text-ds-muted">Next scheduled</p>
          <p className="mt-0.5 font-medium text-ds-ink">Tomorrow, 9:00 AM</p>
        </div>
        <div>
          <p className="text-ds-muted">Last completed</p>
          <p className="mt-0.5 font-medium text-ds-ink">Today</p>
        </div>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
        <div className="h-full w-2/5 rounded-full bg-[#d1e7db]" />
      </div>
      <Button size="lg" className="mt-5 w-full" disabled>
        Rebalance now
      </Button>
    </div>
    <div className="absolute inset-0 grid place-items-center px-4">
      <div className="max-w-[280px] rounded-lg bg-white px-5 py-4 text-center">
        <p className="text-[14px] font-medium text-ds-ink">
          {enrolled ? "Add USDC to start rebalancing" : "Open a position to rebalance"}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ds-muted">
          {enrolled
            ? "Once your first deposit lands, Glider brings your holdings back to target weights every day."
            : "Once you invest, Glider brings your holdings back to target weights every day."}
        </p>
      </div>
    </div>
  </div>
);

/** Match the settled detail grid while its first strategy read is in flight. */
const DetailLoading = ({ assetCount }: { assetCount: number }) => (
  <AppShell current="baskets" title="Basket" quiet>
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[14px] text-ds-muted md:mb-6">
      <Link to="/baskets" className="hover:text-ds-ink">
        Baskets
      </Link>
      <Chevron />
      <Skeleton className="h-4 w-36" />
    </nav>
    <div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
      <div className="flex min-w-0 flex-col gap-4 md:gap-6">
        <section aria-label="Loading strategy overview" className="rounded-xl bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Skeleton className="h-7 w-52 max-w-full" />
              <Skeleton className="mt-3 h-4 w-32" />
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="size-10 rounded-full" />
              ))}
            </div>
          </div>
          <Skeleton className="mt-6 h-4 w-4/5" />
          <Skeleton className="mt-2 h-4 w-3/5" />
          <Skeleton className="mt-7 h-9 w-28" />
          <Skeleton className="mt-5 h-[340px] w-full rounded-lg" />
        </section>
        <section aria-label="Loading strategy composition" className="rounded-xl bg-white p-1">
          <div className="px-5 pt-4 pb-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          </div>
          <div className="space-y-1 rounded-lg bg-ds-panel p-1">
            {Array.from({ length: assetCount }, (_, item) => (
              <Skeleton key={item} className="h-[60px] w-full rounded-md" />
            ))}
          </div>
        </section>
      </div>
      <aside className="flex flex-col gap-4 md:gap-6" aria-label="Loading basket account">
        <RailCard label="Loading investment card">
          <Skeleton className="h-5 w-44" />
          <div className="mt-5 min-h-[102px] rounded-lg bg-ds-panel p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
          </div>
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-6 h-10 w-full rounded-full" />
        </RailCard>
        <RailCard label="Loading your position">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-5 h-8 w-32" />
          <Skeleton className="mt-5 h-14 w-full" />
        </RailCard>
      </aside>
    </div>
  </AppShell>
);

export const Basket = () => {
  const { slug = "" } = useParams();
  const [range, setRange] = useState<Range>("1Y");
  const [investOpen, setInvestOpen] = useState(false);
  /* Opened before enrollment: the sheet walks set-up then USDC, and keeps its step map to the end. */
  const [firstDeposit, setFirstDeposit] = useState(false);
  const [fundingAmount, setFundingAmount] = useState("100");
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitMode, setExitMode] = useState<BasketExitMode>("in_kind");
  const [exitOperation, setExitOperation] = useState<{
    portfolioId: string;
    operationId: string;
    mode: BasketExitMode;
  } | null>(null);
  const [rebalanceOperation, setRebalanceOperation] = useState<{
    portfolioId: string;
    operationId: string;
  } | null>(null);
  const enrollmentRequestActive = useRef(false);
  const fundingRequestActive = useRef(false);
  const rebalanceRequestActive = useRef(false);
  const exitRequestActive = useRef(false);
  const result = useBasketTemplate(slug);
  const insights = useBasketInsights(slug);
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const sessionChecking = !ready || (authenticated && identityToken === null);
  const signedIn = basketEnrollmentEnabled(ready, authenticated, identityToken !== null);
  const enrollment = useBasketEnrollment(slug);
  const enrolled = signedIn && Boolean(enrollment.data);
  const portfolio = useBasketPortfolio(slug, enrolled);
  const money = useMoney();
  const enrollAction = useBasketEnrollmentAction(slug);
  const fundingAction = useBasketFundingAction(slug);
  const rebalanceAction = useBasketRebalanceAction(slug);
  const exitAction = useBasketExitAction(slug);
  const activity = useBasketActivity(slug, enrolled);
  const queryClient = useQueryClient();
  const ownerContext = `${slug}:${user?.id ?? ""}:${wallets[0]?.address ?? ""}`;
  const previousOwnerContext = useRef(ownerContext);
  useEffect(() => {
    if (previousOwnerContext.current === ownerContext) return;
    previousOwnerContext.current = ownerContext;
    setInvestOpen(false);
    setFirstDeposit(false);
    setRebalanceOpen(false);
    setRebalanceOperation(null);
    setExitOpen(false);
    setExitOperation(null);
    setShowAllAssets(false);
    setFundingAmount("100");
    enrollAction.reset();
    fundingAction.reset();
    rebalanceAction.reset();
    exitAction.prepare.reset();
    exitAction.submit.reset();
  }, [ownerContext, enrollAction, fundingAction, rebalanceAction, exitAction.prepare, exitAction.submit]);
  const accountId = signedIn ? portfolio.data?.portfolioId : undefined;
  const operationId =
    accountId && accountId === rebalanceOperation?.portfolioId ? rebalanceOperation.operationId : null;
  const rebalanceStatus = useBasketOperation(slug, operationId, enrolled);
  const exitOperationId =
    accountId && accountId === exitOperation?.portfolioId ? exitOperation.operationId : null;
  const exitStatus = useBasketOperation(slug, exitOperationId, enrolled);
  useEffect(() => {
    if (!accountId) {
      setRebalanceOperation(null);
      return;
    }
    const operationId = sessionStorage.getItem(`basket-rebalance:${accountId}`);
    setRebalanceOperation(operationId ? { portfolioId: accountId, operationId } : null);
  }, [accountId]);
  useEffect(() => {
    if (!accountId) {
      setExitOperation(null);
      return;
    }
    const saved = sessionStorage.getItem(`basket-exit:${accountId}`);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { operationId?: string; mode?: string };
      if (parsed.operationId && (parsed.mode === "in_kind" || parsed.mode === "liquidate_usdc"))
        setExitOperation({ portfolioId: accountId, operationId: parsed.operationId, mode: parsed.mode });
    } catch {
      /* An invalid local receipt is not an operation. */
    }
  }, [accountId]);
  useEffect(() => {
    if (rebalanceTerminal(rebalanceStatus.data?.state)) {
      void queryClient.invalidateQueries({ queryKey: ["api", "basket-portfolio", slug] });
      void queryClient.invalidateQueries({ queryKey: ["api", "basket-portfolios"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "portfolio"] });
    }
  }, [queryClient, rebalanceStatus.data?.state, slug]);
  useEffect(() => {
    if (exitStatus.data?.state === "completed") {
      for (const key of [
        "basket-portfolio",
        "basket-portfolios",
        "basket-activity",
        "portfolio",
        "money",
        "activity",
      ])
        void queryClient.invalidateQueries({ queryKey: ["api", key] });
    }
  }, [exitStatus.data?.state, queryClient]);
  useEffect(() => {
    if (rebalanceStatus.data?.state)
      void queryClient.invalidateQueries({ queryKey: ["api", "basket-activity", slug] });
  }, [queryClient, rebalanceStatus.data?.state, slug]);
  const template = result.data;
  const tickers = useMemo(() => template?.allocations.map((item) => item.ticker) ?? [], [template]);
  const mints = useMemo(() => template?.allocations.map((item) => item.mint) ?? [], [template]);
  const instruments = useInstruments(tickers);
  const prices = usePrices(mints);
  const dayHistory = useHistories(tickers, "1D");
  const weekHistory = useHistories(tickers, "1W");
  const byTicker = useMemo(
    () => new Map((instruments.data ?? []).map((item) => [item.ticker, item])),
    [instruments.data],
  );
  const name = template ? displayBasketName(template.name) : "Basket";
  const enrollmentBusy = checkingEnrollment || enrollAction.isPending;
  /* Enrolled as of this session, even before the enrollment read catches up. */
  const investPortfolio = signedIn ? (enrollment.data ?? enrollAction.data ?? null) : null;
  const confirmEnrollment = async () => {
    if (enrollmentRequestActive.current) return;
    enrollmentRequestActive.current = true;
    setCheckingEnrollment(true);
    try {
      // A previous submission may have succeeded upstream even if its response failed.
      const current = await enrollment.refetch();
      if (!current.isError && !current.data) await enrollAction.mutateAsync();
    } catch {
      // The mutation retains the error for the review sheet to display.
    } finally {
      setCheckingEnrollment(false);
      enrollmentRequestActive.current = false;
    }
  };
  const closeInvest = () => {
    if (enrollmentBusy || fundingAction.isPending) return;
    setInvestOpen(false);
    /* The money went in, so the ticket starts over rather than offering the
       same sum out of cash that no longer holds it. */
    if (fundingAction.data) setFundingAmount("100");
    enrollAction.reset();
    fundingAction.reset();
  };
  const confirmFunding = async () => {
    const portfolio = investPortfolio;
    if (!portfolio || fundingRequestActive.current) return;
    fundingRequestActive.current = true;
    try {
      await fundingAction.mutateAsync({ amountUsd: fundingAmount, portfolio });
    } catch {
      // The review sheet retains the error and prevents an unexamined retry.
    } finally {
      fundingRequestActive.current = false;
    }
  };
  const confirmRebalance = async () => {
    if (!accountId || rebalanceRequestActive.current) return;
    rebalanceRequestActive.current = true;
    try {
      const triggered = await rebalanceAction.mutateAsync();
      void queryClient.invalidateQueries({ queryKey: ["api", "basket-activity", slug] });
      sessionStorage.setItem(`basket-rebalance:${accountId}`, triggered.operationId);
      setRebalanceOperation({ portfolioId: accountId, operationId: triggered.operationId });
      setRebalanceOpen(false);
    } catch {
      // Keep the review open and show the request error. Never auto-retry a write.
    } finally {
      rebalanceRequestActive.current = false;
    }
  };
  const confirmExit = async () => {
    if (!accountId || !exitAction.prepare.data || exitRequestActive.current) return;
    exitRequestActive.current = true;
    try {
      const submitted = await exitAction.submit.mutateAsync(exitAction.prepare.data);
      const operation = { portfolioId: accountId, operationId: submitted.operationId, mode: submitted.mode };
      sessionStorage.setItem(`basket-exit:${accountId}`, JSON.stringify(operation));
      setExitOperation(operation);
    } catch {
      // Keep the signed review and error visible; never auto-retry a withdrawal.
    } finally {
      exitRequestActive.current = false;
    }
  };

  if (!template && result.isPending) {
    const cachedCatalog = queryClient.getQueryData<ManagedBasketTemplate[]>(["api", "basket-templates"]);
    const assetCount = cachedCatalog?.find((item) => item.slug === slug)?.allocations.length ?? 7;
    return <DetailLoading assetCount={assetCount} />;
  }
  if (!template)
    return (
      <AppShell current="baskets" title={name} quiet>
        <div className="rounded-xl bg-white p-5">
          <PriceError
            message="This strategy is unavailable right now."
            onRetry={() => void result.refetch()}
          />
          <Link to="/baskets" className="mt-4 inline-block text-[13px] text-ds-link hover:underline">
            Back to baskets
          </Link>
        </div>
      </AppShell>
    );

  const performance = template.performance;
  /* Only the ranges this strategy has history for; a pick it lacks falls back to its longest. */
  const ranges = modeledRanges(performance, WINDOWS);
  const shown = ranges.includes(range) ? range : (ranges.at(-1) ?? range);
  const modeled = modeledWindow(performance, WINDOWS.find((w) => w.key === shown)!.window);
  const chart = modeled.series;
  const allocations = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps);
  // Which issuer's tokens the strategy buys, read off each allocation's mint. Ondo, for every template today.
  const issuers = new Set(
    allocations.flatMap((a) => {
      const w = byTicker.get(a.ticker)?.wrappers.find((x) => x.mint === a.mint);
      return w ? [w.issuer] : [];
    }),
  );
  const heldAsLabel =
    issuers.size === 0 ? "Ondo tokens" : [...issuers].map((i) => `${TOKEN_NAME[i]} tokens`).join(" and ");
  const mosaic = allocationRows(allocations);
  const totalWeight = allocations.reduce((sum, asset) => sum + asset.weightBps, 0);
  /* The headline follows the chosen range; "All" reads as the return since the first modeled day. */
  const sinceStart = modeledSince(performance);
  const headline = {
    label:
      shown === "All"
        ? sinceStart
          ? `Modeled return since ${new Date(`${sinceStart}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
          : "Modeled return"
        : `Modeled ${RANGE_NAME[shown]} return`,
    change: modeled.change,
  };
  const account = signedIn ? portfolio.data : null;
  const schedule = account?.schedule;
  const operationState = rebalanceStatus.data?.state;
  const rebalanceDisplay = operationState
    ? rebalanceOutcome(operationState, rebalanceStatus.data?.error ?? null)
    : null;
  const operationActive =
    Boolean(operationId) &&
    (!operationState || ["accepted", "running", "retrying", "awaiting_user"].includes(operationState));
  const exitState = exitStatus.data?.state;
  const exitActive =
    Boolean(exitOperationId) &&
    (!exitState || ["accepted", "running", "retrying", "awaiting_user"].includes(exitState));
  const usdcBalance = account?.assets
    .filter((asset) => asset.assetId === USDC_ASSET_ID)
    .reduce((sum, asset) => sum + Number(asset.balance), 0);
  const heldAssets = [...(account?.assets ?? [])]
    .filter((asset) => Number(asset.balance) > 0)
    .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd));
  const walletMissing = signedIn && !enrollAction.walletReady;
  const accountLoading =
    sessionChecking ||
    (signedIn && !walletMissing && (enrollment.isPending || (enrolled && portfolio.isPending)));
  const ownershipUnknown = signedIn && !walletMissing && enrollment.isError && !enrollment.data;
  /*
   * Enrolled is not invested. Position, assets and rebalancing wait for money
   * in the portfolio: something held or in transit, or a transfer sent from
   * this page that the balance read has not caught up with yet.
   */
  const funded =
    enrolled &&
    (heldAssets.length > 0 ||
      Number(account?.totalValueUsd ?? 0) > 0 ||
      Number(account?.inTransitUsd ?? 0) > 0 ||
      Boolean(fundingAction.data));
  /*
   * A mark per holding, by asset id. The withdrawal sheet reads live balances
   * off Glider, which name an asset by symbol; only the template knows which
   * ticker that is, and only the instrument knows its logo.
   */
  const assetMarks = new Map(
    allocations.map((asset) => [
      asset.assetId,
      <AssetIcon
        key={asset.assetId}
        asset={asset}
        source={byTicker.get(asset.ticker)}
        className="size-7 rounded-full bg-ds-panel object-contain"
      />,
    ]),
  );
  /* The basket's two heaviest marks at 40, as every sheet that names it shows them. */
  const basketMark = (
    <span className="flex items-center -space-x-3" aria-hidden="true">
      {allocations.slice(0, 2).map((asset, index) => (
        <span key={asset.assetId} className="relative" style={{ zIndex: 2 - index }}>
          <AssetIcon
            asset={asset}
            source={byTicker.get(asset.ticker)}
            className="size-10 rounded-full bg-ds-panel object-contain ring-2 ring-white"
          />
        </span>
      ))}
    </span>
  );
  const rebalanceLocked = !accountLoading && !ownershipUnknown && !funded && !(enrolled && !account);
  const marketReads = [
    instruments.dataUpdatedAt,
    prices.dataUpdatedAt,
    dayHistory.dataUpdatedAt,
    weekHistory.dataUpdatedAt,
  ];
  const marketUpdatedAt = marketReads.every((at) => at > 0) ? Math.min(...marketReads) : 0;
  const marketFetching =
    instruments.isFetching || prices.isFetching || dayHistory.isFetching || weekHistory.isFetching;
  const marketRefreshFailed =
    instruments.isError || prices.isError || dayHistory.isError || weekHistory.isError;

  return (
    <AppShell current="baskets" title={name} quiet>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[14px] text-ds-muted md:mb-6">
        <Link to="/baskets" className="hover:text-ds-ink">
          Baskets
        </Link>
        <Chevron />
        <span className="text-ds-ink">{name}</span>
      </nav>
      {result.isError && (
        <PriceError
          className="mb-4 md:mb-6"
          message="Could not refresh this strategy. Showing the last available data."
          onRetry={() => void result.refetch()}
        />
      )}
      {/* Narrower than xl the columns dissolve so enrolling sits right under the chart, not at the foot. */}
      <div className="flex flex-col gap-4 md:gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_416px] xl:items-start">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
          <section
            aria-label="Strategy overview and modeled performance"
            className="order-1 min-w-0 rounded-xl bg-white p-1 xl:order-none"
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[20px] leading-tight font-medium text-ds-ink">{name}</h1>
                    <StatusChip tone={template.status === "enabled" ? "up" : "neutral"} size="md">
                      {template.status === "enabled"
                        ? "Available"
                        : template.status === "candidate"
                          ? "Enrollment pilot"
                          : "Preview"}
                    </StatusChip>
                  </div>
                  <p className="mt-2 text-[13px] text-ds-muted">Glider strategy · Solana</p>
                </div>
                <IconCluster
                  template={template}
                  instruments={byTicker}
                  onClick={() =>
                    document.getElementById("composition")?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                        ? "auto"
                        : "smooth",
                      block: "start",
                    })
                  }
                />
              </div>
              <p className="mt-5 max-w-[680px] text-[14px] leading-relaxed text-ds-muted">
                {template.description}
              </p>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] text-ds-muted">{headline.label}</p>
                  <p
                    className={`mt-1 text-[32px] leading-none font-medium ${headline.change !== null ? (Number(headline.change) < 0 ? "text-ds-fall" : "text-ds-up") : "text-ds-ink"}`}
                  >
                    {headline.change !== null ? returnLabel(headline.change) : "Unavailable"}
                  </p>
                </div>
                <div className="max-w-full overflow-x-auto">
                  {ranges.length > 0 && <RangeSwitch options={ranges} value={shown} onChange={setRange} />}
                </div>
              </div>
              <div className="mt-4 h-[340px]">
                {chart.length > 1 ? (
                  <DotChart series={chart} label={shown} scale="percent" />
                ) : (
                  <div className="grid h-full place-items-center rounded-lg bg-ds-panel text-[13px] text-ds-muted">
                    Modeled history is unavailable for this range.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-ds-panel px-5 py-3 text-[12px] leading-relaxed text-ds-muted">
              Glider model{performance ? ` · as of ${new Date(performance.asOf).toLocaleDateString()}` : ""}
              {result.isFetching ? " · updating" : ""}. This is target-allocation history, not a live
              portfolio return. Past modeled performance does not predict future results.
            </div>
          </section>

          <div className="order-3 flex min-w-0 flex-col gap-4 md:gap-6 xl:order-none">
            <section
              id="composition"
              aria-label="Strategy composition"
              className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl bg-white p-1"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
                <div>
                  <h2 className="text-[17px] font-medium text-ds-ink">Strategy composition</h2>
                  <p className="mt-1 text-[12px] text-ds-muted">
                    Target weights; actual holdings can drift between rebalances.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {marketUpdatedAt > 0 &&
                    (marketRefreshFailed ? (
                      <span className="text-[11px] text-ds-muted">Last available</span>
                    ) : (
                      <LiveStatusChip fetching={marketFetching} at={marketUpdatedAt} />
                    ))}
                  <span className="text-[12px] text-ds-muted">{allocations.length} target assets</span>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg bg-ds-panel p-1">
                <GlideTable
                  columns="grid-cols-[minmax(180px,1fr)_75px_95px_95px_75px_75px] gap-x-3"
                  minWidth="min-w-[680px]"
                  headings={
                    <>
                      <span>Asset</span>
                      <span className="text-right">Weight</span>
                      <span className="text-right">Share price</span>
                      <span className="text-right">Company cap</span>
                      <span className="text-right">1D</span>
                      <span className="text-right">1W</span>
                    </>
                  }
                >
                  {allocations.map((asset) => {
                    const sharePrice = byTicker.get(asset.ticker)?.quote.fair;
                    const companyCap = prices.data?.get(asset.mint)?.underlyingMarketCapUsd;
                    return (
                      <li key={asset.assetId} data-row className="relative z-[1]">
                        <StockLink
                          ticker={byTicker.has(asset.ticker) ? asset.ticker : null}
                          className="relative grid grid-cols-[minmax(180px,1fr)_75px_95px_95px_75px_75px] items-center gap-x-3 rounded-md px-4 py-3 text-[13px]"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <AssetIcon
                              asset={asset}
                              source={byTicker.get(asset.ticker)}
                              className="size-9 shrink-0 rounded-full bg-ds-panel object-contain"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ds-ink">
                                {byTicker.get(asset.ticker)?.name ?? asset.ticker}
                              </span>
                              <span className="text-[11px] text-ds-muted">{asset.ticker}</span>
                            </span>
                          </span>
                          <span className="text-right font-medium text-ds-ink">
                            {weight(asset.weightBps)}
                          </span>
                          <span className="text-right text-ds-ink">
                            {sharePrice == null && instruments.isPending ? (
                              <Skeleton className="ml-auto h-4 w-14" />
                            ) : sharePrice == null ? (
                              "—"
                            ) : (
                              usd(sharePrice)
                            )}
                          </span>
                          <span className="text-right text-ds-muted">
                            {companyCap == null && prices.isPending ? (
                              <Skeleton className="ml-auto h-4 w-14" />
                            ) : companyCap == null ? (
                              "—"
                            ) : (
                              usdCompact(companyCap.toNumber())
                            )}
                          </span>
                          <span className="flex justify-end">
                            {dayHistory.isPending ? (
                              <Skeleton className="h-5 w-14" />
                            ) : (
                              <MoveChip value={dayHistory.data?.get(asset.ticker)?.changePct ?? null} light />
                            )}
                          </span>
                          <span className="flex justify-end">
                            {weekHistory.isPending ? (
                              <Skeleton className="h-5 w-14" />
                            ) : (
                              <MoveChip
                                value={weekHistory.data?.get(asset.ticker)?.changePct ?? null}
                                light
                              />
                            )}
                          </span>
                        </StockLink>
                      </li>
                    );
                  })}
                </GlideTable>
              </div>
              <p className="mt-3 px-5 pb-4 text-[11px] text-ds-muted">
                Share price, company cap and 1D/1W moves describe the underlying companies, not the tokens
                held by this strategy. Unavailable data is shown as —.
              </p>
            </section>

            <section aria-label="About and allocation" className="min-w-0 rounded-xl bg-white p-1">
              <div className="px-5 pt-4">
                <RailHead title={`About ${name}`} />
                <p className="mt-[13px] max-w-[72ch] text-[14px] leading-[1.55] text-ds-muted">
                  Follows Glider’s target weights with tokenized assets held in your own smart account. Glider
                  rebalances daily; your actual holdings can drift between rebalances.
                </p>
              </div>
              <div className="mt-4 grid gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="flex flex-col rounded-lg bg-ds-panel px-5 py-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                    <Fact k="Assets">{allocations.length}</Fact>
                    <Fact k="Rebalancing">Daily</Fact>
                    <Fact k="Custody">Your smart account</Fact>
                    <Fact k="Held as">{heldAsLabel}</Fact>
                    {/* Glider holds the tokens in its smart account, out of Kamino's reach, and
                        they are Ondo tokens besides. Said here so no one buys in to borrow. */}
                    <Fact k="Borrowing">Not available</Fact>
                    <Fact k="Swap fee">
                      {insights.isPending ? (
                        <Skeleton className="h-3.5 w-16" />
                      ) : insights.data?.integratorSwapFeeBps == null ? (
                        "—"
                      ) : (
                        `${(insights.data.integratorSwapFeeBps / 100).toFixed(2)}%`
                      )}
                    </Fact>
                  </dl>
                  <div className="mt-6 border-t border-ds-divider pt-5">
                    <p className="text-[14px] leading-none text-ds-muted">Where it invests</p>
                    {insights.isPending ? (
                      <div className="mt-4 space-y-4" aria-label="Loading sector allocation">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                      </div>
                    ) : insights.data?.allocation?.sectors.length ? (
                      <ul className="mt-4 space-y-4">
                        {insights.data.allocation.sectors.map((sector) => (
                          <li key={sector.label}>
                            <div className="flex items-baseline justify-between gap-3 text-[14px] leading-none">
                              <span className="truncate text-ds-ink">{sector.label}</span>
                              <span className="font-medium text-ds-ink">
                                {Number(sector.weightPercent).toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                              <div
                                className="h-full rounded-full bg-[#d1e7db]"
                                style={{ width: `${Math.min(100, Number(sector.weightPercent))}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[12px] text-ds-muted">Sector classification is unavailable.</p>
                    )}
                    {(!!insights.data?.allocation?.unclassifiedCount ||
                      !!insights.data?.allocation?.lowConfidenceCount) && (
                      <p className="mt-4 text-[11px] text-ds-muted">
                        {[
                          insights.data?.allocation?.unclassifiedCount
                            ? `${insights.data.allocation.unclassifiedCount} holdings lack a sector`
                            : null,
                          insights.data?.allocation?.lowConfidenceCount
                            ? `${insights.data.allocation.lowConfidenceCount} sector labels are estimates`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        .
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-ds-panel p-2.5">
                  <div className="flex items-center justify-between px-2 pt-1 pb-2.5 text-[12px] text-ds-muted">
                    <span>Target allocation</span>
                    <span>{allocations.length} assets</span>
                  </div>
                  <div className="flex h-[290px] flex-col gap-1.5" aria-label="Target allocation">
                    {mosaic.map((row, rowIndex) => {
                      const rowWeight = row.reduce((sum, tile) => sum + tile.weightBps, 0);
                      return (
                        <div
                          key={rowIndex}
                          className="flex min-h-0 gap-1.5"
                          style={{ flexGrow: rowWeight, flexBasis: 0 }}
                        >
                          {row.map((tile, index) => (
                            <StockLink
                              key={tile.ticker}
                              ticker={tile.kind === "asset" && byTicker.has(tile.ticker) ? tile.ticker : null}
                              className="basket-allocation-tile group min-w-0 overflow-hidden rounded-lg px-2.5 transition-transform duration-300 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none sm:px-3"
                              style={{ flexGrow: tile.weightBps, flexBasis: 0 }}
                              title={`${tile.ticker}: ${weight(tile.weightBps)} target weight`}
                            >
                              <span
                                aria-hidden="true"
                                className={`basket-allocation-color pointer-events-none absolute -inset-3 ${TILE_TONES[(rowIndex * 2 + index) % TILE_TONES.length]}`}
                              />
                              <span className="basket-allocation-content">
                                {tile.kind === "asset" ? (
                                  <AssetIcon
                                    asset={tile.asset}
                                    source={byTicker.get(tile.ticker)}
                                    className="size-6 shrink-0 rounded-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-110 motion-reduce:transition-none"
                                  />
                                ) : (
                                  <span className="flex shrink-0 items-center -space-x-2 pl-0.5">
                                    {tile.assets.slice(0, 3).map((asset) => (
                                      <AssetIcon
                                        key={asset.assetId}
                                        asset={asset}
                                        source={byTicker.get(asset.ticker)}
                                        className="size-6 rounded-full bg-white object-contain ring-2 ring-white"
                                      />
                                    ))}
                                  </span>
                                )}
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-[12px] font-medium text-ds-ink">
                                    {tile.ticker}
                                  </span>
                                  <span className="text-[11px] text-ds-muted">
                                    {weight(tile.weightBps)}
                                    {tile.kind === "other" ? ` · ${tile.assets.length} assets` : ""}
                                  </span>
                                </span>
                              </span>
                            </StockLink>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <p className="px-2 pt-2 text-[11px] text-ds-muted">
                    Target weights{totalWeight !== 10_000 ? ` · ${weight(totalWeight)} assigned` : ""}; not
                    live holdings.
                  </p>
                </div>
              </div>
            </section>
            <details className="group rounded-xl bg-white p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium text-ds-ink [&::-webkit-details-marker]:hidden">
                Risks and disclosures
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 text-ds-muted transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
                These are tokenized assets held in a user-owned Glider smart account, not shares in a pooled
                basket token. Prices, available liquidity, swap costs and actual execution can differ from the
                modeled strategy. Funding with USDC does not automatically buy the target assets; USDC can
                remain uninvested until a rebalance executes.
              </p>
            </details>
          </div>
        </div>

        <aside className="contents xl:sticky xl:top-20 xl:flex xl:flex-col xl:gap-6">
          <div className="order-2 flex min-w-0 flex-col gap-4 md:gap-6 xl:order-none">
            <EnrollmentRail
              name={name}
              assetCount={allocations.length}
              portfolio={signedIn ? (enrollment.data ?? null) : null}
              signedIn={signedIn}
              walletMissing={walletMissing}
              checking={sessionChecking || (signedIn && !walletMissing && enrollment.isPending)}
              lookupFailed={signedIn && enrollment.isError && !enrollment.data}
              blocked={template.status === "disabled"}
              busy={enrollmentBusy}
              error={
                enrollment.isError && enrollment.data
                  ? "Portfolio status could not refresh. Showing your last available enrollment."
                  : enrollment.error?.message
              }
              onRetry={() => void enrollment.refetch()}
              amount={fundingAmount}
              onAmount={setFundingAmount}
              cash={money.data ? Number(money.data.balanceUsd) : null}
              onReview={() => {
                enrollAction.reset();
                fundingAction.reset();
                setFirstDeposit(!enrolled);
                setInvestOpen(true);
              }}
            />
            {(funded || ownershipUnknown) && (
              <RailCard label="Your position">
                <RailHead
                  title="Your position"
                  meta={
                    account ? (
                      portfolio.isError ? (
                        "Last available"
                      ) : (
                        <LiveStatusChip fetching={portfolio.isFetching} at={portfolio.dataUpdatedAt} />
                      )
                    ) : undefined
                  }
                />
                {account ? (
                  <div className="mt-5">
                    <p className="text-[12px] text-ds-muted">Smart-account value</p>
                    <p className="mt-1 text-[28px] leading-none font-medium text-ds-ink">
                      {usd(account.totalValueUsd)}
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ds-divider pt-4 text-[12px]">
                      <div>
                        <p className="text-ds-muted">Available USDC</p>
                        <p className="mt-1 font-medium text-ds-ink">
                          {usdcBalance == null || !Number.isFinite(usdcBalance) ? "—" : usd(usdcBalance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-ds-muted">Other assets</p>
                        <p className="mt-1 font-medium text-ds-ink">
                          {heldAssets.filter((asset) => asset.assetId !== USDC_ASSET_ID).length}
                        </p>
                      </div>
                    </div>
                    {account.inTransitUsd !== "0" && (
                      <p className="mt-3 text-[12px] text-ds-muted">
                        Includes {usd(account.inTransitUsd)} in transit.
                      </p>
                    )}
                    {account.warnings.length > 0 && (
                      <p className="mt-3 text-[12px] text-ds-muted">Partial read; value may be incomplete.</p>
                    )}
                    {portfolio.isError && (
                      <button
                        type="button"
                        onClick={() => void portfolio.refetch()}
                        className="mt-3 text-[12px] font-medium text-ds-link hover:underline"
                      >
                        Balance refresh failed · Retry
                      </button>
                    )}
                    {exitOperationId && (
                      <div className="mt-4 border-t border-ds-divider pt-4 text-[12px]">
                        <OperationStatus
                          name={exitOperation?.mode === "in_kind" ? "In-kind withdrawal" : "Exit to USDC"}
                          state={exitState}
                          label={
                            exitState?.replaceAll("_", " ") ??
                            (exitStatus.isError ? "Status unavailable" : "Checking…")
                          }
                          unavailable={exitStatus.isError}
                        />
                      </div>
                    )}
                    {exitStatus.data?.error && (
                      <p className="mt-2 text-[12px] text-ds-chip-warn">{exitStatus.data.error}</p>
                    )}
                    {exitStatus.isError && exitOperationId && (
                      <button
                        type="button"
                        onClick={() => void exitStatus.refetch()}
                        className="mt-2 text-[12px] font-medium text-ds-link hover:underline"
                      >
                        Check withdrawal status again
                      </button>
                    )}
                    {heldAssets.length > 0 && (
                      <Button
                        size="lg"
                        className="mt-5 w-full"
                        disabled={portfolio.isError || exitActive || operationActive}
                        onClick={() => {
                          setExitMode("in_kind");
                          exitAction.prepare.reset();
                          exitAction.submit.reset();
                          setExitOpen(true);
                        }}
                      >
                        Withdraw assets
                      </Button>
                    )}
                  </div>
                ) : accountLoading ? (
                  <div className="mt-5" aria-label="Loading your position">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-2 h-8 w-36" />
                    <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ds-divider pt-4">
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  </div>
                ) : ownershipUnknown ? (
                  <PriceError
                    className="mt-5"
                    message="Portfolio status is unavailable. Your holdings have not been checked yet."
                    onRetry={() => void enrollment.refetch()}
                  />
                ) : (
                  <PriceError
                    className="mt-5"
                    message="Smart-account balances are unavailable."
                    onRetry={() => void portfolio.refetch()}
                  />
                )}
              </RailCard>
            )}
            {funded && (
              <RailList
                label="Your assets"
                meta="Value · share 1D"
                footer={
                  account && (
                    <p className="text-[11px] leading-relaxed text-ds-muted">
                      Value and balance are for your tokens. Charts and 1D moves show underlying shares.
                      Updated {new Date(account.fetchedAt).toLocaleString()}.
                    </p>
                  )
                }
              >
                {!account && portfolio.isPending ? (
                  <div className="space-y-2 p-3" aria-label="Loading account balances">
                    {[0, 1, 2].map((item) => (
                      <Skeleton key={item} className="h-[52px] w-full rounded-md" />
                    ))}
                  </div>
                ) : !account && portfolio.isError ? (
                  <PriceError
                    message="Account balances are unavailable."
                    onRetry={() => void portfolio.refetch()}
                  />
                ) : (
                  <>
                    {portfolio.isError && (
                      <div
                        role="alert"
                        className="mx-2 mb-2 flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-[11px] text-ds-muted"
                      >
                        <span>Refresh failed · showing last balances</span>
                        <button
                          type="button"
                          onClick={() => void portfolio.refetch()}
                          className="shrink-0 font-medium text-ds-link hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {heldAssets.length === 0 ? (
                      <p className="px-3 py-5 text-[13px] text-ds-muted">
                        This smart account has no assets right now. Check your wallet and recent activity if
                        you withdrew them.
                      </p>
                    ) : (
                      <>
                        <GlideRows as="ul">
                          {(showAllAssets ? heldAssets : heldAssets.slice(0, 5)).map((asset) => {
                            const allocation = template.allocations.find(
                              (item) => item.assetId === asset.assetId,
                            );
                            const history = allocation ? dayHistory.data?.get(allocation.ticker) : null;
                            return (
                              <li
                                key={`${asset.smartAccountId}:${asset.assetId}`}
                                data-row
                                className="relative"
                              >
                                <StockLink
                                  ticker={
                                    allocation && byTicker.has(allocation.ticker) ? allocation.ticker : null
                                  }
                                  className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_84px_56px] items-center gap-x-3 rounded-md px-3"
                                >
                                  <span className="flex min-w-0 items-center gap-3">
                                    {allocation ? (
                                      <AssetIcon
                                        asset={allocation}
                                        source={byTicker.get(allocation.ticker)}
                                        className="size-8 shrink-0 rounded-full bg-white object-contain"
                                      />
                                    ) : asset.assetId.endsWith(`/spl:${USDC_MINT}`) ? (
                                      <UsdcMark size={32} />
                                    ) : (
                                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[10px] font-medium text-ds-ink">
                                        {asset.symbol.slice(0, 3)}
                                      </span>
                                    )}
                                    <span className="min-w-0">
                                      <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                                        {allocation
                                          ? (byTicker.get(allocation.ticker)?.name ?? asset.symbol)
                                          : asset.symbol}
                                      </span>
                                      <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                                        {assetBalance(asset.balance)} {asset.symbol}
                                      </span>
                                    </span>
                                  </span>
                                  <span className="block h-7 w-full">
                                    {history && history.points.length > 1 && (
                                      <DotChart
                                        scale="price"
                                        series={history.points.map((point) => ({
                                          label: point.at.toLocaleTimeString(),
                                          value: point.price,
                                        }))}
                                        label="underlying share today"
                                        axes={false}
                                        interactive={false}
                                        rest={LIST_DOT}
                                        {...TINY}
                                      />
                                    )}
                                  </span>
                                  <span className="flex flex-col items-end">
                                    <span className="text-[14px] leading-[18px] font-medium whitespace-nowrap text-ds-ink">
                                      {usd(asset.valueUsd)}
                                    </span>
                                    {allocation && <MoveChip value={history?.changePct ?? null} light />}
                                  </span>
                                </StockLink>
                              </li>
                            );
                          })}
                        </GlideRows>
                        {heldAssets.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllAssets((value) => !value)}
                            className="w-full px-3 py-2 text-left text-[12px] font-medium text-ds-link hover:underline"
                          >
                            {showAllAssets ? "Show fewer assets" : `Show all ${heldAssets.length} assets`}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </RailList>
            )}
          </div>
          <div className="order-4 flex min-w-0 flex-col gap-4 md:gap-6 xl:order-none">
            <section aria-label="Rebalancing" className="min-w-0 rounded-xl bg-white p-1">
              <div className="px-5 pt-4">
                <RailHead
                  title="Rebalancing"
                  meta={
                    rebalanceLocked
                      ? undefined
                      : schedule?.status === "paused"
                        ? "Paused"
                        : (schedule?.frequency ?? undefined)
                  }
                />
              </div>
              <div className="mt-[11px] rounded-lg bg-ds-panel px-5 pt-4 pb-4">
                {accountLoading ? (
                  <div className="min-h-[160px]" aria-label="Loading rebalance schedule">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-3 h-8 w-36" />
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
                  </div>
                ) : rebalanceLocked ? (
                  <RebalanceLocked enrolled={enrolled} />
                ) : ownershipUnknown ? (
                  <div className="min-h-[160px] text-[12px] text-ds-muted">
                    <p>Rebalance schedule is unavailable until portfolio status is known.</p>
                    <button
                      type="button"
                      onClick={() => void enrollment.refetch()}
                      className="mt-2 font-medium text-ds-link hover:underline"
                    >
                      Retry portfolio check
                    </button>
                  </div>
                ) : enrolled && !account ? (
                  <div className="min-h-[160px] text-[12px] text-ds-muted">
                    <p>Schedule unavailable while account balances cannot be read.</p>
                    {portfolio.isError && (
                      <button
                        type="button"
                        onClick={() => void portfolio.refetch()}
                        className="mt-2 font-medium text-ds-link hover:underline"
                      >
                        Retry account read
                      </button>
                    )}
                  </div>
                ) : (
                  <RebalanceTimer schedule={schedule} hasAccount={Boolean(account)} />
                )}
                {operationId && (
                  <div className="mt-5 border-t border-ds-divider pt-4 text-[12px]">
                    <OperationStatus
                      name="Manual rebalance"
                      state={operationState}
                      label={
                        rebalanceDisplay?.label ??
                        (rebalanceStatus.isError ? "Status unavailable" : "Checking…")
                      }
                      unavailable={rebalanceStatus.isError}
                    />
                    {rebalanceDisplay?.detail && (
                      <p className="mt-2 text-ds-chip-warn">{rebalanceDisplay.detail}</p>
                    )}
                    {rebalanceStatus.isError && (
                      <button
                        type="button"
                        onClick={() => void rebalanceStatus.refetch()}
                        className="mt-2 font-medium text-ds-link hover:underline"
                      >
                        Check status again
                      </button>
                    )}
                  </div>
                )}
                {!rebalanceLocked && (
                  <Button
                    size="lg"
                    className="mt-5 w-full"
                    disabled={
                      !account ||
                      template.status === "disabled" ||
                      operationActive ||
                      exitActive ||
                      rebalanceAction.isPending
                    }
                    onClick={() => {
                      rebalanceAction.reset();
                      setRebalanceOpen(true);
                    }}
                  >
                    {operationActive ? "Rebalance in progress" : "Rebalance now"}
                  </Button>
                )}
              </div>
            </section>
            {enrolled && (
              <RailList label="Recent activity">
                {activity.data?.length ? (
                  <>
                    {activity.isError && (
                      <div
                        role="alert"
                        className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-[11px] text-ds-muted"
                      >
                        <span>Refresh failed · showing last activity</span>
                        <button
                          type="button"
                          onClick={() => void activity.refetch()}
                          className="shrink-0 font-medium text-ds-link hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    <ul className="space-y-3 px-4 py-4">
                      {activity.data.slice(0, 5).map((item) => (
                        <EventRow
                          key={item.id}
                          showSubtitle
                          e={toEvent({
                            ...item,
                            subtitle: item.subtitle,
                            mint: null,
                            logoUrl: null,
                          })}
                        />
                      ))}
                    </ul>
                  </>
                ) : (sessionChecking || enrolled) && activity.isPending ? (
                  <div className="space-y-3 px-4 py-4" aria-label="Loading recent activity">
                    {[0, 1].map((item) => (
                      <Skeleton key={item} className="h-[48px] w-full" />
                    ))}
                  </div>
                ) : activity.isError ? (
                  <PriceError
                    message="Recent activity is unavailable."
                    onRetry={() => void activity.refetch()}
                  />
                ) : (
                  <div className="px-4 py-5 text-center">
                    <p className="text-[13px] font-medium text-ds-ink">No activity to show</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-ds-muted">
                      Enrollment, confirmed funding, rebalances and withdrawals appear here.
                    </p>
                  </div>
                )}
              </RailList>
            )}
            <Link to="/baskets" className="text-[13px] font-medium text-ds-link hover:underline">
              Explore more strategies →
            </Link>
          </div>
        </aside>
      </div>
      <InvestSheet
        open={investOpen}
        name={name}
        assetCount={allocations.length}
        mark={basketMark}
        amount={fundingAmount}
        cash={money.data ? Number(money.data.balanceUsd) : null}
        portfolio={investPortfolio}
        firstDeposit={firstDeposit}
        receipt={fundingAction.data ?? null}
        enroll={{
          walletReady: enrollAction.walletReady,
          busy: enrollmentBusy,
          error: enrollAction.error?.message ?? enrollment.error?.message,
          onConfirm: () => void confirmEnrollment(),
        }}
        fund={{
          walletReady: fundingAction.walletReady,
          busy: fundingAction.isPending,
          error: fundingAction.error?.message,
          onConfirm: () => void confirmFunding(),
        }}
        onClose={closeInvest}
      />
      <RebalanceSheet
        open={rebalanceOpen}
        name={name}
        mark={basketMark}
        assetCount={allocations.length}
        busy={rebalanceAction.isPending}
        error={rebalanceAction.error?.message}
        onClose={() => {
          if (!rebalanceAction.isPending) setRebalanceOpen(false);
        }}
        onConfirm={() => void confirmRebalance()}
      />
      {account && (
        <ExitSheet
          key={account.portfolioId}
          open={exitOpen}
          name={name}
          mark={basketMark}
          assetMarks={assetMarks}
          mode={exitMode}
          onMode={(mode) => {
            setExitMode(mode);
            exitAction.prepare.reset();
            exitAction.submit.reset();
          }}
          account={account}
          prepared={exitAction.prepare.data ?? null}
          submitted={exitAction.submit.data ?? null}
          busy={exitAction.prepare.isPending || exitAction.submit.isPending}
          walletReady={exitAction.walletReady}
          error={exitAction.prepare.error?.message ?? exitAction.submit.error?.message}
          onPrepare={(assets) =>
            void exitAction.prepare
              .mutateAsync({ mode: exitMode, ...(assets ? { assets } : {}) })
              .catch(() => undefined)
          }
          onSubmit={() => void confirmExit()}
          onBack={() => {
            exitAction.prepare.reset();
            exitAction.submit.reset();
          }}
          onClose={() => {
            if (exitAction.prepare.isPending || exitAction.submit.isPending) return;
            setExitOpen(false);
            exitAction.prepare.reset();
            exitAction.submit.reset();
          }}
        />
      )}
    </AppShell>
  );
};
