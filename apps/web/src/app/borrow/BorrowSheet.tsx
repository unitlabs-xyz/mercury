import { useEffect, useMemo, useState } from "react";
import { useBorrow, useBorrowAction } from "../../api/borrow";
import { useInstrument, useInstruments } from "../../market/hooks";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import { Alert, Check } from "../../ui/icons";
import { borrowChoices, pct, pickRow, planBorrow, usd, type BorrowRow, type BorrowTab } from "@mercury/view";
import { Mark } from "../invest/shared";
import { LoanMeter, loanNow, loanShape } from "../money/LoanMeter";
import { Fact, RailLine } from "../stock/Panels";
import { chip } from "../stock/Ticket";

export type Tab = BorrowTab;

const pctOf = (x: number | null) => (x === null ? "—" : pct(x * 100, 1));

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
  // The stock page's own instrument is already cached, so its logo shows even before the list answers.
  const own = useInstrument(ticker ?? "");
  const info = (t: string) =>
    instruments.data?.find((i) => i.ticker === t) ?? (own.data?.ticker === t ? own.data : undefined);
  const all = borrowChoices(b, tab);
  const choices = only && ticker ? all.filter((r) => r.ticker === ticker) : all;
  const row = pickRow(choices, pick);
  const value = Number(settled) || 0;
  const typing = amount !== settled;

  /* The arithmetic that moves money is shared with the phone: @mercury/view's borrow.ts. */
  const { intent, max, preview, blocked, presets, paused, inTokens } = planBorrow(b, tab, row, value);

  const busy = action.isPending;
  const canSubmit = !!intent && value > 0 && !typing && !blocked && !busy && !paused && action.walletReady;
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
              {borrowChoices(b, "pledge").length > 0 && (
                <Button onClick={() => (setTab("pledge"), setAmount(""))}>Pledge more</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* The stock to act on: each as a row with its logo and what you hold of it,
                then the chosen one's facts in the grey panel under the rows. */}
            {tab !== "repay" &&
              (choices.length === 0 ? (
                <p className="mt-5 flex h-[52px] items-center rounded-lg bg-ds-panel px-4 text-[14px] text-ds-muted">
                  {tab === "pledge"
                    ? "No accepted stock is free in the wallet to pledge."
                    : tab === "withdraw"
                      ? "Nothing is pledged yet."
                      : "None of your stocks can be borrowed against yet."}
                </p>
              ) : (
                <div className="mt-5 rounded-lg bg-ds-panel p-1">
                  <div
                    role={only ? undefined : "radiogroup"}
                    aria-label="Stock"
                    className="flex flex-col gap-1"
                  >
                    {choices.map((r) => {
                      const on = row?.ticker === r.ticker;
                      const i = info(r.ticker);
                      const shares = r.depositedTokens + r.depositableTokens;
                      return (
                        <button
                          key={r.ticker}
                          type="button"
                          role={only ? undefined : "radio"}
                          aria-checked={only ? undefined : on}
                          disabled={only}
                          onClick={() => (setPick(r.ticker), setAmount(""))}
                          className={`flex h-[60px] items-center gap-3 rounded-md px-3 text-left transition-colors disabled:cursor-default ${
                            only || on ? "bg-white" : "hover:bg-white/60"
                          } ${!only && on ? "outline-1 outline-black/10" : ""}`}
                        >
                          {i ? (
                            <Mark i={i} size={32} />
                          ) : (
                            <span className="size-8 shrink-0 rounded-full bg-page" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                              {i?.name ?? r.ticker}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                              {r.ticker}
                              {i?.sector ? ` · ${i.sector}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                              {usd(shares * r.pricePerToken)}
                            </span>
                            <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">
                              {shares.toFixed(4)} shares
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {row && (
                    <dl className="grid grid-cols-3 gap-x-4 px-3 pt-4 pb-3">
                      {tab === "borrow" ? (
                        <Fact k="Borrow up to">{usd(max)}</Fact>
                      ) : tab === "pledge" ? (
                        <Fact k="Free">{row.depositableTokens.toFixed(4)}</Fact>
                      ) : (
                        <Fact k="Can come back">{max.toFixed(4)}</Fact>
                      )}
                      <Fact k="Pledged">
                        {row.depositedTokens > 0 ? row.depositedTokens.toFixed(4) : "None yet"}
                      </Fact>
                      <Fact k="Lends">{pct(row.ltv * b.safetyTarget * 100, 0)} of value</Fact>
                    </dl>
                  )}
                </div>
              ))}

            {/* The amount, as the buy ticket's: a white well on the grey panel, presets under it. */}
            <div className="mt-4 rounded-lg bg-ds-panel p-1">
              <label className="flex h-15 items-center gap-1 rounded-md bg-white px-4 focus-within:outline-1 focus-within:outline-black/10">
                {!inTokens && <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={inTokens ? "Tokens" : "Amount in dollars"}
                  className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
                />
                <span className="shrink-0 text-[12px] text-ds-muted">{unit}</span>
              </label>
              <div
                className="mt-1 grid auto-cols-fr grid-flow-col gap-1"
                role="group"
                aria-label="Amount presets"
              >
                {presets.map((q) => {
                  const v = inTokens ? String(Number(q.v.toFixed(6))) : q.v.toFixed(2);
                  const on = amount !== "" && amount === v;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      disabled={q.v <= 0}
                      onClick={() => (setAmount(v), setSettled(v))}
                      aria-pressed={on}
                      className={`${chip(on)} truncate px-2`}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-2.5 px-1 text-[12px] leading-[1.45] text-ds-muted">
              {tab === "borrow" &&
                row &&
                (b.borrowableNowUsd > 0.005 && max - b.borrowableNowUsd > 0.005
                  ? `Up to ${usd(max)}: ${usd(b.borrowableNowUsd)} against what is pledged, ${usd(
                      max - b.borrowableNowUsd,
                    )} more by pledging ${row.ticker}`
                  : `${pctOf(b.borrowApy)} a year, variable · inside our 80% safety target`)}
              {tab === "repay" && `Owed ${usd(b.debtUsd)} · ${usd(b.cashUsd)} cash in the wallet`}
              {tab === "pledge" &&
                row &&
                `${row.depositableTokens.toFixed(4)} ${row.ticker}x free in the wallet · no loan is taken`}
              {tab === "withdraw" &&
                row &&
                `${row.depositedTokens.toFixed(4)} ${row.ticker}x pledged · up to ${max.toFixed(4)} can come back`}
            </p>

            {/* What the change does to the loan, as it is typed: the meter with the
                change a shade lighter (hover it for each point), then the figures. */}
            {(() => {
              /* A borrow pledges only as many shares as the amount needs, so against
                 what is pledged it always lands on the target, whatever is typed. It
                 is read against everything that could be pledged instead: the loan
                 then fills the bar as the amount grows, up to the target at Max. */
              const basis =
                tab === "borrow" && row
                  ? (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? r.depositableTokens : 0)
                  : null;
              const now = basis ? loanShape(b, b.debtUsd, basis) : loanNow(b);
              const next =
                preview && value > 0 && !blocked
                  ? loanShape(b, preview.debt, basis ?? preview.deposits)
                  : undefined;
              const shows = now.pledged > 0 || (next?.pledged ?? 0) > 0;
              return (
                <>
                  <div className="mt-4 rounded-lg bg-ds-panel px-5 py-5">
                    <p className="text-[14px] leading-none font-medium text-ds-ink">Your loan</p>
                    {shows && (
                      <div className="mt-4">
                        <LoanMeter now={now} next={next} of={basis ? "what you can pledge" : undefined} />
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
