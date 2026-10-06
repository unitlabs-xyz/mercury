import { useBorrow, type BorrowRow } from "../../api/borrow";
import { useSignedIn } from "../../api/hooks";
import { useInstruments } from "../../market/hooks";
import type { Tab } from "../borrow/BorrowSheet";
import { usePanels } from "../Panels";
import { Button } from "../../ui/Button";
import { GlideRows, InfoTip, MoveChip, StatusChip, type Tone } from "../../ui/ds";
import { pct, usd } from "@mercury/view";
import { Mark } from "../invest/shared";
import { HeaderFigure } from "../portfolio/Summary";
import { Skeleton } from "../portfolio/ui";
import { LoanMeter, loanNow } from "./LoanMeter";

/** The loan's state, as a chip. Margin call is the word brokers use; the copy explains it. */
const STATE: Record<string, { label: string; tone: Tone }> = {
  healthy: { label: "Healthy", tone: "up" },
  over_limit: { label: "Past the limit · locked", tone: "warn" },
  margin_call: { label: "Margin call · locked", tone: "down" },
  liquidation: { label: "Being liquidated", tone: "down" },
};

const pctOf = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Green with room, amber inside 20%, red inside 10%: how close this stock is to being sold. */
const distanceTone = (d: number | null) =>
  d === null ? "text-ds-muted" : d < 0.1 ? "text-ds-down" : d < 0.2 ? "text-warn" : "text-ds-up";

/** The holdings table's shape: the name takes what is left, the figures sit in fixed columns. */
const COLS = "grid-cols-[minmax(0,1fr)_130px_100px_150px_110px_120px]";

type Borrow = NonNullable<ReturnType<typeof useBorrow>["data"]>;

/**
 * Borrowing lives here, with the money it produces, laid out like the holdings
 * table: the title row with the loan's state and its actions, the loan's
 * figures and meter in a grey panel, then every stock that can back it as 60px
 * rows. Nothing is pledged when a stock is bought: shares go to Kamino only
 * when a borrow needs them, and only as many as it needs.
 */
export const BorrowSection = () => {
  const signedIn = useSignedIn();
  const borrow = useBorrow();
  const b = borrow.data;
  const stocks = (b?.collateral ?? []).filter(
    (r) => r.isStock && (r.depositedTokens > 0 || r.depositableTokens > 0),
  );
  const instruments = useInstruments(stocks.map((r) => r.ticker));
  const info = (ticker: string) => instruments.data?.find((i) => i.ticker === ticker);
  // Borrow, repay, pledge and withdraw open the app's borrow panel over this page.
  const panels = usePanels();
  const openSheet = (tab: Tab, ticker?: string) => panels.borrow(tab, ticker);

  if (!signedIn) return null;

  return (
    <section aria-label="Borrow" className="min-w-0 rounded-xl bg-white p-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-[14px] leading-none">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="font-medium text-ds-ink">Borrow against your stocks</h2>
          {b && b.debtUsd > 0 && STATE[b.health] && (
            <StatusChip tone={STATE[b.health]!.tone}>{STATE[b.health]!.label}</StatusChip>
          )}
          <InfoTip label="How borrowing works" align="start">
            USDC from Kamino, without selling. Nothing is pledged until you borrow, and then only what the
            loan needs. We lend to 80% of Kamino&apos;s limit, so a normal dip does not trigger a sale.
          </InfoTip>
        </div>
        {b && (
          <div className="flex flex-wrap gap-1">
            <Button
              variant="primary"
              onClick={() => openSheet(b.locked ? "repay" : "borrow")}
              disabled={!b.locked && b.borrowableUsd <= 0}
            >
              {b.locked ? "Repay to unlock" : "Borrow"}
            </Button>
            {b.collateral.some((r) => r.isStock && r.depositableTokens > 0) && (
              <Button onClick={() => openSheet("pledge")}>Pledge more</Button>
            )}
            {b.debtUsd > 0 && !b.locked && <Button onClick={() => openSheet("repay")}>Repay</Button>}
            {b.collateralUsd > 0 && <Button onClick={() => openSheet("withdraw")}>Withdraw</Button>}
          </div>
        )}
      </header>

      {!b ? (
        <div className="mt-[11px] rounded-lg bg-ds-panel p-5">
          {borrow.isError ? (
            <p className="text-[14px] text-ds-muted">Could not reach Kamino. Your shares are not affected.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-[11px] rounded-lg bg-ds-panel px-5 py-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
              <HeaderFigure
                size="md"
                label="Borrowed"
                value={usd(b.debtUsd)}
                sub={`${pct(b.borrowApy * 100, 1)} a year, variable`}
              />
              <HeaderFigure
                size="md"
                label="Can still borrow"
                value={usd(b.borrowableUsd)}
                sub={
                  b.borrowableUsd > b.borrowableNowUsd ? "Pledges stock as needed" : "Against what is pledged"
                }
              />
              <HeaderFigure
                size="md"
                label="Pledged"
                value={usd(b.collateralUsd)}
                sub="Still yours, still moving"
              />
              <HeaderFigure
                size="md"
                label={
                  b.health === "healthy" || b.health === "over_limit"
                    ? "Margin call if it falls"
                    : "Kamino sells if it falls"
                }
                value={
                  b.debtUsd <= 0
                    ? "—"
                    : b.health === "healthy" || b.health === "over_limit"
                      ? pctOf(b.dropToMarginCall)
                      : pctOf(b.safeUntilDrop)
                }
                sub={b.debtUsd <= 0 ? "No loan" : `Kamino sells at ${pctOf(b.safeUntilDrop)} down`}
                tone={
                  b.debtUsd <= 0
                    ? undefined
                    : b.health === "margin_call" || b.health === "liquidation"
                      ? "down"
                      : b.health === "over_limit" || (b.dropToMarginCall ?? 1) < 0.1
                        ? "warn"
                        : "up"
                }
              />
            </dl>
            {b.debtUsd > 0 && b.collateralUsd > 0 && <Health b={b} />}
          </div>

          <div className="mt-1 overflow-x-auto rounded-lg bg-ds-panel p-1">
            {stocks.length === 0 ? (
              <p className="flex h-[52px] items-center px-3 text-[14px] text-ds-muted">
                None of your stocks can be borrowed against yet.
              </p>
            ) : (
              <div className="min-w-[820px]">
                <div
                  className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}
                >
                  <span>Stock</span>
                  <span className="text-right">Pledged</span>
                  <span className="text-right">Today</span>
                  <span className="text-right">Price · sold at</span>
                  <span className="text-right">Room to fall</span>
                  <span className="text-right">Borrow up to</span>
                </div>
                <GlideRows as="ul">
                  {stocks.map((r) => (
                    <Line
                      key={r.ticker}
                      r={r}
                      name={info(r.ticker)?.name}
                      today={info(r.ticker)?.quote.todayPct ?? null}
                      logo={info(r.ticker)}
                      onBorrow={() => openSheet("borrow", r.ticker)}
                    />
                  ))}
                </GlideRows>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

/** Where the loan sits, on the shared loan meter; hover it for what each point means. */
const Health = ({ b }: { b: Borrow }) => (
  <div className="mt-6">
    <LoanMeter now={loanNow(b)} />
    {b.overTargetUsd > 0.01 && (
      <p className="mt-2 text-[12px] leading-none text-warn">
        Repay {usd(b.overTargetUsd)} to get back inside the target
      </p>
    )}
  </div>
);

/** One stock that can back the loan: a 60px row under the list's gliding white sheet. */
const Line = ({
  r,
  name,
  today,
  logo,
  onBorrow,
}: {
  r: BorrowRow;
  name: string | undefined;
  today: number | null;
  logo: Parameters<typeof Mark>[0]["i"] | undefined;
  onBorrow: () => void;
}) => (
  <li data-row className={`relative grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}>
    <div className="flex min-w-0 items-center gap-3">
      {logo ? <Mark i={logo} size={36} /> : <span className="size-9 shrink-0 rounded-full bg-ds-avatar" />}
      <div className="min-w-0">
        <p className="flex h-3.5 min-w-0 items-center gap-[5px]">
          <span className="truncate font-medium text-ds-ink">{name ?? r.ticker}</span>
          <span className="shrink-0">
            {r.depositedTokens > 0 ? (
              <span className="inline-flex h-[17px] items-center rounded bg-ds-act-buy-bg px-1.5 text-[10px] leading-none text-ds-act-buy">
                <span className="opacity-80">Pledged</span>
              </span>
            ) : (
              <StatusChip tone="neutral">Not pledged</StatusChip>
            )}
          </span>
        </p>
        <p className="mt-[6px] truncate text-[12px] text-ds-muted">
          {r.ticker} · lends {pct(r.ltv * 80, 0)} of value
          {r.depositableTokens > 0 && ` · ${usd(r.depositableUsd)} free in wallet`}
        </p>
      </div>
    </div>

    <span className="text-right">
      {r.depositedTokens > 0 ? (
        <>
          <span className="block font-medium text-ds-ink">{usd(r.depositedUsd)}</span>
          <span className="mt-[6px] block text-[12px] text-ds-muted">
            {r.depositedTokens.toFixed(4)} tokens
          </span>
        </>
      ) : (
        <span className="text-ds-muted">—</span>
      )}
    </span>
    <span className="flex -translate-y-px justify-end">
      <MoveChip value={today} light />
    </span>
    <span className="text-right">
      <span className="block font-medium text-ds-ink">{usd(r.pricePerToken)}</span>
      <span className="mt-[6px] block text-[12px] text-ds-muted">
        {r.liquidationPrice === null ? "Not at risk" : `Sold at ${usd(r.liquidationPrice)}`}
      </span>
    </span>
    <span className={`text-right font-medium ${distanceTone(r.liquidationDistance)}`}>
      {r.liquidationDistance === null ? "—" : pctOf(r.liquidationDistance)}
    </span>
    <span className="text-right">
      {r.borrowableUsd > 0 ? (
        <button
          type="button"
          onClick={onBorrow}
          className="relative font-medium text-ds-link transition-opacity hover:opacity-80"
        >
          {usd(r.borrowableUsd, 0)}
        </button>
      ) : (
        <span className="text-ds-muted">—</span>
      )}
    </span>
  </li>
);
