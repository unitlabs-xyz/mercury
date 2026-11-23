import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { usd } from "@mercury/view";
import { ALL_WALLETS, useActingWallet, type Acting } from "../../api/acting-wallet";
import { useAllWalletsPortfolio, usePortfolioSummary } from "../../api/hooks";
import type { Range } from "../ValueChart";
import { arcs, ringPath } from "./donut";
import { Performance } from "./Summary";
import { RailCard, RailHead, StatusChip } from "../../ui/ds";
import { ChevronRight } from "../../ui/icons";
import { Delta, Figure, Panel, Skeleton, relTime } from "./ui";
import {
  sharePct,
  summaryLines,
  walletCards,
  walletLoans,
  walletSlices,
  type WalletCard,
  type WalletSlice,
} from "./wallets-model";

const chosenId = (acting: Acting, mercuryId: string | undefined) =>
  acting.kind === "all" ? ALL_WALLETS : acting.kind === "linked" ? acting.wallet.id : mercuryId;

/**
 * The top of Home once anything is linked: every wallet added up in one
 * panel. Net worth sits in the middle of a ring split by wallet, what it
 * earned and cost on one side, and each wallet on the other. With only the
 * Mercury wallet it is not there, and Home is what it always was.
 *
 * The figures are live while this is open (every wallet read at once, as the
 * page's own figures are) and the server's last hourly readings when the live
 * read is not there, dated so nobody mistakes one for the other. Pointing at
 * a wallet, in the ring or the list, shows its share in the middle; choosing
 * one shows that wallet, and "View together" shows every wallet at once.
 *
 * The middle of the ring turns the panel over to net worth over time, in
 * place: the panel is wide enough for a chart, and nothing slides in over
 * Home. "Wallets", or Escape, turns it back.
 */
export const WalletsOverview = () => {
  const { acting, choose, linked, wallets } = useActingWallet();
  const any = linked.length > 0;
  const summary = usePortfolioSummary(any);
  const live = useAllWalletsPortfolio(any);
  const [hot, setHot] = useState<string | null>(null);
  const [chart, setChart] = useState(false);
  /*
   * Focus follows the turn: the button pressed is gone once the panel turns
   * over, so it moves to the way back, and back to the middle of the ring on
   * return. Not on first showing, which would pull Home's focus up here.
   */
  const back = useRef<HTMLButtonElement>(null);
  const middle = useRef<HTMLButtonElement>(null);
  const turned = useRef(false);
  useEffect(() => {
    if (!turned.current) return;
    (chart ? back : middle).current?.focus();
  }, [chart]);
  const turn = (to: boolean) => {
    turned.current = true;
    setChart(to);
  };
  if (!any) return null;

  const mercuryId = wallets.find((w) => w.isPrimary)?.id;
  const current = chosenId(acting, mercuryId);

  if (summary.data === undefined) {
    return (
      <Panel title="All wallets">
        <div className="flex flex-col gap-3 px-3 pb-5 sm:px-5">
          {summary.isError ? (
            <p className="text-[13px] text-muted">
              Couldn't load the summary. It will try again in a minute.
            </p>
          ) : (
            <>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-64" />
            </>
          )}
        </div>
      </Panel>
    );
  }

  const lines = summaryLines(summary.data);
  const slices = walletSlices(walletCards(summary.data, live.data));
  const liveWorth = live.data?.totalValueUsd;
  const together = current === ALL_WALLETS;
  const pick = (s: WalletSlice) => choose(s.isPrimary ? null : s.id);
  const openChart = () => {
    setHot(null);
    turn(true);
  };

  return (
    <section
      aria-label="All wallets"
      onKeyDown={(e) => {
        if (chart && e.key === "Escape") turn(false);
      }}
      className={`rounded-2xl border bg-white transition-colors ${
        together ? "border-ink/40" : "border-cardline"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] whitespace-nowrap">All wallets</h2>
          {/* The chart's buttons need the room on a phone; the note is back with the wallets. */}
          {lines.calculating && (
            <span className={`truncate text-[12px] text-faint ${chart ? "max-sm:hidden" : ""}`}>
              {lines.calculating}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chart && (
            <button
              type="button"
              ref={back}
              onClick={() => turn(false)}
              className="flex items-center gap-1 rounded-lg bg-black/[0.04] py-1.5 pr-3 pl-2 text-[12px] font-medium text-ds-ink transition-colors hover:bg-black/[0.07]"
            >
              <ChevronRight className="size-3.5 rotate-180" />
              Wallets
            </button>
          )}
          <button
            type="button"
            onClick={() => choose(ALL_WALLETS)}
            aria-pressed={together}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              together ? "bg-ds-ink text-white" : "bg-black/[0.04] text-ds-ink hover:bg-black/[0.07]"
            }`}
          >
            {together ? "Viewing together" : "View together"}
          </button>
        </div>
      </div>

      {chart ? (
        <div className="px-4 pt-4 pb-5 sm:px-6">
          <NetWorthChart
            total={liveWorth === undefined ? Number(summary.data.netWorthUsd) : Number(liveWorth)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 px-4 pt-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.2fr)] lg:gap-10">
          <div className="order-2 grid grid-cols-2 gap-4 lg:order-none lg:grid-cols-1">
            <Figure
              label="P&L"
              value={lines.pnl}
              sub={lines.pnlSub ?? undefined}
              tone={tone(summary.data.pnl.totalUsd, lines.pnl)}
            />
            <Figure label="Income" value={lines.income} sub={lines.incomeSub ?? undefined} />
            <Figure label="Loan interest" value={lines.loanInterest} />
          </div>

          <div className="order-1 justify-self-center lg:order-none">
            <Ring
              slices={slices}
              hot={hot}
              onHot={setHot}
              onPick={pick}
              onOpenChart={openChart}
              middle={middle}
              centre={
                <Centre
                  slice={slices.find((s) => s.id === hot)}
                  netWorth={liveWorth === undefined ? lines.netWorth : usd(liveWorth)}
                  asOf={liveWorth === undefined ? summary.data.asOf : null}
                />
              }
            />
          </div>

          <ul className="order-3 flex flex-col gap-1 lg:order-none" onPointerLeave={() => setHot(null)}>
            {slices.map((s) => (
              <li key={s.id}>
                <Row
                  slice={s}
                  chosen={current === s.id}
                  dim={hot !== null && hot !== s.id}
                  onHot={() => setHot(s.id)}
                  onLeave={() => setHot(null)}
                  onChoose={() => pick(s)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/**
 * Net worth across every wallet over time, in the panel the ring was in: the
 * same chart as Home's, read for every wallet at once whichever is chosen.
 * Hourly at its finest, as the readings behind it are.
 */
const NetWorthChart = ({ total }: { total: number }) => {
  const [range, setRange] = useState<Range>("1D");
  return (
    <Performance
      total={total}
      range={range}
      setRange={setRange}
      wallet={ALL_WALLETS}
      title="Net worth over time"
      framed={false}
    />
  );
};

const tone = (value: string, line: string) =>
  line === "Calculating…"
    ? undefined
    : Number(value) > 0
      ? ("up" as const)
      : Number(value) < 0
        ? ("down" as const)
        : undefined;

const SIZE = 200;
const GEOMETRY = { cx: SIZE / 2, cy: SIZE / 2, outer: 96, inner: 74 };

/**
 * The ring: one piece per wallet that holds something, in the list's order,
 * a 2px white gap between pieces. Pointing at a piece lights it and dims the
 * rest; the list beside it does the same, and is the way in by keyboard.
 */
const Ring = ({
  slices,
  hot,
  onHot,
  onPick,
  onOpenChart,
  middle,
  centre,
}: {
  slices: readonly WalletSlice[];
  hot: string | null;
  onHot: (id: string | null) => void;
  onPick: (s: WalletSlice) => void;
  onOpenChart: () => void;
  middle: RefObject<HTMLButtonElement | null>;
  centre: ReactNode;
}) => {
  const pieces = arcs(slices.map((s) => s.value));
  const several = pieces.filter((p) => p.end > p.start).length > 1;
  return (
    <div className="relative size-[200px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block size-full"
        role="img"
        aria-label={`Net worth by wallet: ${slices
          .filter((s) => s.share !== null)
          .map((s) => `${s.name} ${sharePct(s.share)}`)
          .join(", ")}`}
        onPointerLeave={() => onHot(null)}
      >
        <circle
          cx={GEOMETRY.cx}
          cy={GEOMETRY.cy}
          r={(GEOMETRY.outer + GEOMETRY.inner) / 2}
          fill="none"
          stroke="var(--color-page)"
          strokeWidth={GEOMETRY.outer - GEOMETRY.inner}
        />
        {pieces.map((arc, i) => {
          const s = slices[i];
          const d = ringPath(arc, GEOMETRY);
          if (s === undefined || d === "") return null;
          const dim = hot !== null && hot !== s.id;
          return (
            <path
              key={s.id}
              d={d}
              fill={s.color}
              fillRule="evenodd"
              stroke="white"
              strokeWidth={several ? 2 : 0}
              opacity={dim ? 0.3 : 1}
              className="cursor-pointer"
              style={{ transition: dim ? "opacity 300ms ease" : "opacity 0ms" }}
              onPointerEnter={() => onHot(s.id)}
              onClick={() => onPick(s)}
            />
          );
        })}
      </svg>
      {/* The hole in the ring opens the chart of net worth over time. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <button
          type="button"
          ref={middle}
          onClick={onOpenChart}
          aria-label="Net worth over time"
          className="pointer-events-auto grid size-[140px] place-items-center rounded-full px-3 text-center transition-colors hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:outline-ds-ink"
        >
          {centre}
        </button>
      </div>
    </div>
  );
};

/** Net worth in the middle, or the wallet being pointed at: its value and share. */
const Centre = ({
  slice,
  netWorth,
  asOf,
}: {
  slice: WalletSlice | undefined;
  netWorth: string;
  asOf: string | null;
}) =>
  slice === undefined ? (
    <div className="min-w-0">
      <p className="text-[12px] text-muted">Net worth</p>
      <p className="mt-1 truncate text-[20px] leading-tight font-semibold tracking-[-0.02em]">{netWorth}</p>
      {asOf !== null && <p className="mt-1 text-[11px] text-faint">Updated {relTime(asOf)}</p>}
      <p className="mt-1.5 flex items-center justify-center gap-0.5 text-[11px] font-medium text-ds-muted">
        See over time
        <ChevronRight className="size-3" />
      </p>
    </div>
  ) : (
    <div className="min-w-0">
      <p className="truncate text-[12px] text-muted">{slice.name}</p>
      <p className="mt-1 truncate text-[20px] leading-tight font-semibold tracking-[-0.02em]">
        {slice.valueUsd === null ? "—" : usd(slice.valueUsd)}
      </p>
      <p className="mt-1 text-[11px] text-faint">
        {slice.share === null ? "Reading this wallet…" : `${sharePct(slice.share)} of net worth`}
      </p>
    </div>
  );

const BADGE = {
  up: "bg-up-tint text-up-deep",
  warn: "bg-ds-warn-chip text-ds-chip-warn",
  down: "bg-down-tint text-down-deep",
} as const;

/** What a wallet's row says under its name. */
const status = (card: WalletCard): string =>
  card.valueUsd === null
    ? "Reading this wallet…"
    : card.calculating
      ? "P&L calculating…"
      : card.isLive
        ? card.isPrimary
          ? "Your Mercury wallet"
          : "Linked wallet"
        : card.asOf === null
          ? ""
          : `Updated ${relTime(card.asOf)}`;

/** One wallet in the list: its colour, name, loan, value, the day's move and its share. */
const Row = ({
  slice,
  chosen,
  dim,
  onHot,
  onLeave,
  onChoose,
}: {
  slice: WalletSlice;
  chosen: boolean;
  dim: boolean;
  onHot: () => void;
  onLeave: () => void;
  onChoose: () => void;
}) => (
  <button
    type="button"
    onClick={onChoose}
    onPointerEnter={onHot}
    onFocus={onHot}
    onBlur={onLeave}
    aria-pressed={chosen}
    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-left transition-[opacity,border-color,background-color] ${
      chosen ? "border-ink/30 bg-black/[0.02]" : "border-transparent hover:bg-black/[0.03]"
    }`}
    style={{ opacity: dim ? 0.45 : 1 }}
  >
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden />
      <span className="truncate text-[14px] font-medium">{slice.name}</span>
      {slice.loan && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[slice.loan.tone]}`}
        >
          {slice.loan.label}
        </span>
      )}
    </span>
    <span className="flex items-center justify-end gap-2">
      {slice.changePct !== null && <Delta value={slice.changePct} />}
      <span className="text-[14px] font-semibold">{slice.valueUsd === null ? "—" : usd(slice.valueUsd)}</span>
    </span>
    <span className="truncate pl-[18px] text-[11px] text-faint">{status(slice)}</span>
    <span className="text-right text-[11px] text-muted">
      {slice.share === null ? "" : sharePct(slice.share)}
    </span>
  </button>
);

/**
 * Borrowing on Home while every wallet is shown together. A loan is one
 * wallet's (its health, its collateral, repaying it), so they are never added
 * into one: each wallet that owes something is listed with its own health,
 * the worst first, and choosing one shows that wallet, where it can be managed.
 */
export const AllWalletLoans = () => {
  const { choose } = useActingWallet();
  const summary = usePortfolioSummary(true);
  const live = useAllWalletsPortfolio(true);

  if (summary.data === undefined) {
    return (
      <RailCard label="Borrowing">
        <RailHead title="Borrowing" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      </RailCard>
    );
  }

  const loans = walletLoans(walletCards(summary.data, live.data));
  return (
    <RailCard label="Borrowing">
      <RailHead
        title="Borrowing"
        meta={loans.length === 0 ? undefined : `${loans.length} loan${loans.length === 1 ? "" : "s"}`}
      />
      {loans.length === 0 ? (
        <p className="mt-4 text-[13px] leading-[1.45] text-ds-muted">
          No wallet has a loan. Choose a wallet to borrow against its shares.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col">
            {loans.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => choose(c.isPrimary ? null : c.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-black/[0.03]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-ds-ink">{c.name}</span>
                    {c.loan && <StatusChip tone={c.loan.tone}>{c.loan.label}</StatusChip>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[14px] font-medium text-ds-ink">
                    {usd(c.debtUsd)}
                    <ChevronRight className="size-3.5 text-ds-muted" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
            Each loan is its own wallet's. Choose one to repay or borrow.
          </p>
        </>
      )}
    </RailCard>
  );
};
