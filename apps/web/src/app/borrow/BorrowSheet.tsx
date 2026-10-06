import { useEffect, useMemo, useState } from "react";
import { useBorrow, useBorrowAction, type Borrow, type BorrowIntent, type BorrowRow } from "../../api/borrow";
import { useInstruments } from "../../market/hooks";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import { Alert, Check } from "../../ui/icons";
import { pct, usd } from "../format";
import { Mark } from "../invest/shared";
import { LoanMeter, loanNow, loanShape } from "../money/LoanMeter";
import { RailLine } from "../stock/Panels";

export type Tab = "borrow" | "repay" | "pledge" | "withdraw";

/** A small cushion so a price tick between quote and signing does not push a borrow past the target. */
const PRICE_BUFFER = 1.005;

const pctOf = (x: number | null) => (x === null ? "—" : pct(x * 100, 1));

/** Debt over the value at which liquidation starts, after a change. */
const safeUntil = (b: Borrow, debt: number, deposits: (r: BorrowRow) => number) => {
  const liquidationAt = b.collateral.reduce(
    (s, r) => s + deposits(r) * r.pricePerToken * r.liquidationThreshold,
    0,
  );
  return debt <= 0 || liquidationAt <= 0 ? null : Math.max(0, 1 - debt / liquidationAt);
};

const safePledged = (b: Borrow, deposits: (r: BorrowRow) => number) =>
  b.collateral.reduce((s, r) => s + deposits(r) * r.pricePerToken * r.ltv * b.safetyTarget, 0);

const raw = (tokens: number, decimals: number, round: "up" | "down") => {
  const scaled = tokens * 10 ** decimals;
  return BigInt(round === "up" ? Math.ceil(scaled) : Math.floor(scaled)).toString();
};

/**
 * Borrow USDC against xStocks, repay, or take collateral back. Everything the
 * sheet offers is already inside the 80% safety target, and the server checks
 * it again before building anything, so the limit here is a limit, not advice.
 */
export const BorrowSheet = ({
  open,
  onClose,
  initialTab = "borrow",
  ticker,
  only = false,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
  /** Preselects the stock to borrow against or withdraw. */
  ticker?: string | undefined;
  /** Opened from that stock's own page: show just it, not the list to choose from. */
  only?: boolean;
}) => {
  const borrow = useBorrow();
  const action = useBorrowAction();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pick, setPick] = useState<string | undefined>(ticker);
  const [amount, setAmount] = useState("");
  // The limits, preview and meter follow the amount once typing pauses, not on every keystroke.
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSettled(amount), 300);
    return () => clearTimeout(t);
  }, [amount]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setPick(ticker);
    setAmount("");
    setSettled("");
    action.reset();
    // Only on opening: the action object is new each render, so it is not a dependency.
  }, [open, initialTab, ticker]);

  const b = borrow.data;
  const stocks = useMemo(() => (b?.collateral ?? []).filter((r) => r.isStock), [b]);
  const instruments = useInstruments(stocks.map((r) => r.ticker));
  const info = (t: string) => instruments.data?.find((i) => i.ticker === t);
  const pledgeable = stocks.filter((r) => r.depositedTokens > 0 || r.depositableTokens > 0);
  const pledged = stocks.filter((r) => r.depositedTokens > 0);
  const free = stocks.filter((r) => r.depositableTokens > 0);
  const all = tab === "withdraw" ? pledged : tab === "pledge" ? free : pledgeable;
  const choices = only && ticker ? all.filter((r) => r.ticker === ticker) : all;
  // A loan past the limit is locked: only repaying and pledging more are open.
  const paused = !!b?.locked && (tab === "borrow" || tab === "withdraw");
  const row =
    choices.find((r) => r.ticker === pick) ??
    [...choices].sort((x, y) => y.borrowableUsd - x.borrowableUsd)[0];
  const value = Number(settled) || 0;
  const typing = amount !== settled;

  /**
   * The most you can borrow choosing this stock: what is already open against
   * the collateral pledged today, plus what pledging this stock's free shares
   * adds, capped by the pool. The row, Max and the limit check all read this.
   */
  const borrowLimit = (r: BorrowRow) =>
    b
      ? Math.min(
          b.poolAvailableUsd,
          b.borrowableNowUsd + r.depositableTokens * r.pricePerToken * r.ltv * b.safetyTarget,
        )
      : 0;

  let intent: BorrowIntent | null = null;
  let max = 0;
  let preview: {
    debt: number;
    drop: number | null;
    deposits: (r: BorrowRow) => number;
    note?: string;
  } | null = null;
  let blocked: string | null = null;

  if (b && tab === "borrow" && row) {
    const perToken = row.pricePerToken * row.ltv * b.safetyTarget;
    max = borrowLimit(row);
    const extra = Math.max(0, value - b.borrowableNowUsd);
    const tokens = extra > 0 ? Math.min(row.depositableTokens, (extra / perToken) * PRICE_BUFFER) : 0;
    intent =
      tokens > 0
        ? {
            kind: "deposit_and_borrow",
            ticker: row.ticker,
            tokensRaw: raw(tokens, row.decimals, "up"),
            usd: value.toFixed(2),
          }
        : { kind: "borrow", usd: value.toFixed(2) };
    const after = (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? tokens : 0);
    preview = {
      debt: b.debtUsd + value,
      drop: safeUntil(b, b.debtUsd + value, after),
      deposits: after,
      ...(tokens > 0
        ? { note: `Pledges ${tokens.toFixed(4)} ${row.ticker}x to Kamino. The shares stay yours.` }
        : {}),
    };
    if (value > max + 0.005) blocked = `At most ${usd(max)} at the 80% safety target.`;
  } else if (b && tab === "repay") {
    max = Math.min(b.debtUsd, b.cashUsd);
    intent = {
      kind: "repay",
      usd: value >= b.debtUsd - 0.005 && b.cashUsd >= b.debtUsd * 1.001 ? "all" : value.toFixed(2),
    };
    preview = {
      debt: Math.max(0, b.debtUsd - value),
      drop: safeUntil(b, Math.max(0, b.debtUsd - value), (r) => r.depositedTokens),
      deposits: (r) => r.depositedTokens,
    };
    if (b.debtUsd <= 0) blocked = "There is no loan to repay.";
    else if (value > b.cashUsd) blocked = `Only ${usd(b.cashUsd)} of cash in the wallet.`;
  } else if (b && tab === "pledge" && row) {
    max = row.depositableTokens;
    intent = { kind: "deposit", ticker: row.ticker, tokensRaw: raw(value, row.decimals, "down") };
    const after = (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? value : 0);
    preview = {
      debt: b.debtUsd,
      drop: safeUntil(b, b.debtUsd, after),
      deposits: after,
      note: "Adds collateral without borrowing. The shares stay yours and can be withdrawn later.",
    };
    if (value > max + 1e-9) blocked = `Only ${max.toFixed(4)} ${row.ticker}x is free in the wallet.`;
  } else if (b && tab === "withdraw" && row) {
    const spare = safePledged(b, (r) => r.depositedTokens) - b.debtUsd;
    const perToken = row.pricePerToken * row.ltv * b.safetyTarget;
    max =
      b.debtUsd <= 0
        ? row.depositedTokens
        : Math.max(0, Math.min(row.depositedTokens, spare / perToken / PRICE_BUFFER));
    const all = b.debtUsd <= 0 && value >= row.depositedTokens - 1e-9;
    intent = {
      kind: "withdraw",
      ticker: row.ticker,
      tokensRaw: all ? "all" : raw(value, row.decimals, "down"),
    };
    const after = (r: BorrowRow) => r.depositedTokens - (r.ticker === row.ticker ? value : 0);
    preview = { debt: b.debtUsd, drop: safeUntil(b, b.debtUsd, after), deposits: after };
    if (value > max + 1e-9) blocked = "Repay some of the loan first to take that much back.";
  }

  const busy = action.isPending;
  const canSubmit = !!intent && value > 0 && !typing && !blocked && !busy && !paused && action.walletReady;
  const inTokens = tab === "withdraw" || tab === "pledge";
  const unit = inTokens ? `${row?.ticker ?? ""}x` : "USD";

  const title =
    tab === "borrow"
      ? only && row
        ? `Borrow against ${info(row.ticker)?.name ?? row.ticker}`
        : "Borrow against your stocks"
      : tab === "repay"
        ? "Repay your loan"
        : tab === "pledge"
          ? "Pledge more stock"
          : "Take collateral back";

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="borrow-title">
      <PanelHeader
        id="borrow-title"
        title={title}
        sub="USDC from Kamino, up to 80% of its limit, so a normal dip does not trigger a liquidation."
        onClose={onClose}
      />

      <div className="px-6 pt-1 pb-6">
        {!b ? (
          <p className="mt-5 text-[14px] text-ds-muted">
            {borrow.isError ? "Could not reach Kamino." : "Loading your position…"}
          </p>
        ) : action.isSuccess ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
              <Check className="size-5" />
            </span>
            <p className="mt-4 text-[20px] leading-none font-medium text-ds-ink">Done</p>
            <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
              Confirmed on chain. Your position is updating.
            </p>
            <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">
              Close
            </Button>
          </div>
        ) : paused ? (
          <div className="mt-5 rounded-lg bg-ds-warn-chip px-4 py-4 text-ds-chip-warn">
            <p className="text-[14px] leading-[1.35] font-medium">
              {tab === "borrow" ? "Borrowing" : "Withdrawals"} paused until the loan is back inside the limit
            </p>
            <p className="mt-2 text-[12px] leading-[1.5]">
              Prices fell, so your loan is past the 80% limit. We pause new borrowing and withdrawals well
              before Kamino&apos;s line, so your shares are not sold on a small dip. Repay{" "}
              {usd(b.overTargetUsd)}, or pledge more stock, to unlock both.
            </p>
            <div className="mt-3 flex gap-1">
              <Button
                variant="primary"
                onClick={() => (setTab("repay"), setAmount(b.overTargetUsd.toFixed(2)))}
              >
                Repay {usd(b.overTargetUsd)}
              </Button>
              {free.length > 0 && (
                <Button onClick={() => (setTab("pledge"), setAmount(""))}>Pledge more</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* What to act on: quick amounts for a repay, the stock for everything else, as the sector pills. */}
            {tab === "repay" && b.debtUsd > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {[
                  ...(b.repayToClearMarginCallUsd > 0
                    ? [{ label: "End margin call", v: b.repayToClearMarginCallUsd }]
                    : []),
                  ...(b.overTargetUsd > 0 ? [{ label: "Unlock", v: b.overTargetUsd }] : []),
                  { label: "All", v: b.debtUsd },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setAmount(q.v.toFixed(2))}
                    className="h-[26px] rounded-full border border-black/5 px-[13px] text-[14px] leading-none text-ds-ink transition-colors hover:border-black/10"
                  >
                    {q.label} · {usd(q.v)}
                  </button>
                ))}
              </div>
            )}
            {/* The stock to act on, as rows with the figure that matters for this
                action, so the choice is made on the numbers, not the ticker. */}
            {tab !== "repay" &&
              (choices.length === 0 ? (
                <p className="mt-4 flex h-[52px] items-center rounded-lg bg-ds-panel px-4 text-[14px] text-ds-muted">
                  {tab === "pledge"
                    ? "No accepted stock is free in the wallet to pledge."
                    : tab === "withdraw"
                      ? "Nothing is pledged yet."
                      : "None of your stocks can be borrowed against yet."}
                </p>
              ) : (
                <div
                  role={only ? undefined : "radiogroup"}
                  aria-label="Stock"
                  className="mt-4 flex flex-col gap-1 rounded-lg bg-ds-panel p-1"
                >
                  {choices.map((r) => {
                    const on = row?.ticker === r.ticker;
                    const i = info(r.ticker);
                    const [figure, note] =
                      tab === "borrow"
                        ? [usd(borrowLimit(r)), "Borrow up to"]
                        : tab === "pledge"
                          ? [usd(r.depositableUsd), `${r.depositableTokens.toFixed(4)} free`]
                          : [usd(r.depositedUsd), `${r.depositedTokens.toFixed(4)} pledged`];
                    return (
                      <button
                        key={r.ticker}
                        type="button"
                        role={only ? undefined : "radio"}
                        aria-checked={only ? undefined : on}
                        disabled={only}
                        onClick={() => (setPick(r.ticker), setAmount(""))}
                        className={`flex h-[52px] items-center gap-3 rounded-md px-3 text-left transition-colors disabled:cursor-default ${
                          only ? "bg-white" : on ? "bg-white outline-1 outline-black/10" : "hover:bg-white/60"
                        }`}
                      >
                        {i ? (
                          <Mark i={i} size={32} />
                        ) : (
                          <span className="size-8 shrink-0 rounded-full bg-ds-avatar" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                            {i?.name ?? r.ticker}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                            {r.ticker} · lends {pct(r.ltv * b.safetyTarget * 100, 0)} of value
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                            {figure}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

            {/* The amount, as the buy ticket's: a white well on the grey panel. */}
            <div className="mt-4 rounded-lg bg-ds-panel p-1">
              <label className="flex h-15 items-center gap-2 rounded-md bg-white px-4 focus-within:outline-1 focus-within:outline-black/10">
                {!inTokens && <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={inTokens ? "Tokens" : "Amount in dollars"}
                  className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
                />
                <button
                  type="button"
                  onClick={() => setAmount(inTokens ? String(Number(max.toFixed(6))) : max.toFixed(2))}
                  className="h-[26px] shrink-0 rounded-full border border-black/10 bg-linear-to-b from-white to-[#eeeeee] px-3 text-[12px] leading-none text-ds-ink"
                >
                  Max
                </button>
                <span className="shrink-0 text-[12px] text-ds-muted">{unit}</span>
              </label>
              <p className="px-3 pt-2.5 pb-2 text-[12px] leading-[1.4] text-ds-muted">
                {tab === "borrow" &&
                  row &&
                  (b.borrowableNowUsd > 0.005 && max - b.borrowableNowUsd > 0.005
                    ? `Up to ${usd(max)}: ${usd(b.borrowableNowUsd)} against what is pledged, ${usd(
                        max - b.borrowableNowUsd,
                      )} more by pledging ${row.ticker}`
                    : `Up to ${usd(max)} at the safety target · ${pctOf(b.borrowApy)} a year, variable`)}
                {tab === "repay" && `Owed ${usd(b.debtUsd)} · ${usd(b.cashUsd)} cash in the wallet`}
                {tab === "pledge" &&
                  row &&
                  `${row.depositableTokens.toFixed(4)} ${row.ticker}x free in the wallet · no loan is taken`}
                {tab === "withdraw" &&
                  row &&
                  `${row.depositedTokens.toFixed(4)} ${row.ticker}x pledged · up to ${max.toFixed(4)} can come back`}
              </p>
            </div>

            {/* What the change does to the loan, as it is typed: the meter with the
                change at half strength (hover it for each point), then the figures. */}
            {(() => {
              const now = loanNow(b);
              const next =
                preview && value > 0 && !blocked ? loanShape(b, preview.debt, preview.deposits) : undefined;
              const shows = now.pledged > 0 || (next?.pledged ?? 0) > 0;
              return (
                <>
                  <div className="mt-4 rounded-lg bg-ds-panel px-5 py-5">
                    <p className="text-[14px] leading-none font-medium text-ds-ink">Your loan</p>
                    {shows && (
                      <div className="mt-4">
                        <LoanMeter now={now} next={next} />
                      </div>
                    )}
                  </div>
                  {/* The figures on the white, under the meter's panel. */}
                  <dl className="mt-5 flex flex-col gap-3 px-1">
                    <RailLine k={next ? "Loan after" : "Loan now"}>
                      {next ? (
                        <>
                          <span className="font-normal text-ds-muted">{usd(b.debtUsd)} → </span>
                          {usd(preview!.debt)}
                        </>
                      ) : (
                        usd(b.debtUsd)
                      )}
                    </RailLine>
                    <RailLine k="Safe unless collateral falls">
                      <span
                        className={
                          (next ? preview!.drop : b.safeUntilDrop) !== null &&
                          (next ? preview!.drop! : b.safeUntilDrop!) < 0.15
                            ? "text-warn"
                            : ""
                        }
                      >
                        {pctOf(next ? preview!.drop : b.safeUntilDrop)}
                      </span>
                    </RailLine>
                    <RailLine k="Interest">{pctOf(b.borrowApy)} a year</RailLine>
                  </dl>
                  {next && preview!.note && (
                    <p className="mt-3 px-1 text-[12px] leading-[1.45] text-ds-muted">{preview!.note}</p>
                  )}
                </>
              );
            })()}

            {!busy && (blocked || action.error) && value > 0 && (
              <p className="mt-4 flex gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down">
                <Alert className="mt-px size-3.5 shrink-0" />
                {blocked ?? (action.error instanceof Error ? action.error.message : "Something went wrong.")}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              disabled={!canSubmit}
              loading={busy}
              onClick={() => intent && action.mutate(intent)}
              className="mt-6 w-full"
            >
              {tab === "borrow"
                ? `Borrow ${value > 0 ? usd(value) : ""}`.trim()
                : tab === "repay"
                  ? `Repay ${value > 0 ? usd(value) : ""}`.trim()
                  : tab === "pledge"
                    ? "Pledge"
                    : "Withdraw"}
            </Button>
            {b.obligation === null && tab === "borrow" && (
              <p className="mt-3 text-center text-[12px] text-ds-muted">
                First time: you will sign twice, once to open your Kamino account and once to borrow.
              </p>
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
};
