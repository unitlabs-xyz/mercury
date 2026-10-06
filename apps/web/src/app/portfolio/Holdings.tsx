import { useState } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../../ui/Button";
import { GlideRows, MoveChip, RailHead, StatusChip } from "../../ui/ds";
import { usd } from "@mercury/view";
import type { Model, Row } from "./model";
import { Skeleton } from "./ui";

/**
 * Built to holdings.svg. The name takes what is left; the figures sit in fixed
 * columns on the right, right-aligned: value ends 411 from the card's left in
 * the 992 design, then weight 120 on, today 125, return 168.
 *
 * Borrow was the sixth. It answered a question nobody had while reading their
 * holdings — what a position would lend against — and answered it for every
 * row at once, including the ones Kamino does not take, where it printed "Not
 * accepted" against a stock the reader had not asked to borrow against. The
 * stock page's borrow card asks and answers it in one place.
 */
const COLS = "grid-cols-[minmax(0,1fr)_130px_120px_125px_168px]";

/** A hyphen, as the design draws it, for a fall. */
const signed = (n: number, text: string) => `${n < 0 ? "-" : "+"}${text}`;

const Logo = ({ row }: { row: Row }) =>
  row.logo ? (
    <img
      src={row.logo}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      className="size-9 shrink-0 rounded-full"
    />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ds-avatar text-[14px] font-medium text-ds-ink">
      {row.ticker.slice(0, 1)}
    </span>
  );

/**
 * One holding, to holdings.svg: a 60px row, 4px in from the grey panel, that
 * turns white under the pointer. Numbers medium, labels regular, 14 over 12.
 */
const Line = ({ r }: { r: Row }) => {
  const pledged = Number(r.pledgedShares ?? 0);
  const today = r.changePct24h === null || r.changePct24h === undefined ? null : Number(r.changePct24h);
  return (
    <Link
      to={`/invest/${r.ticker}`}
      data-row
      className={`relative grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Logo row={r} />
        <div className="min-w-0">
          <p className="flex h-3.5 min-w-0 items-center gap-[5px]">
            <span className="truncate font-medium text-ds-ink">{r.name}</span>
            {pledged > 0 && (
              <span
                className="shrink-0 uppercase"
                title={`${pledged.toFixed(3)} shares pledged to Kamino as collateral. Still yours; withdraw them to sell.`}
              >
                <StatusChip tone="neutral">
                  {pledged >= Number(r.shares) - 1e-9 ? "Pledged" : `${Number(pledged.toFixed(2))} pledged`}
                </StatusChip>
              </span>
            )}
            {r.wrapperCount > 1 && (
              <span className="shrink-0 uppercase">
                <StatusChip tone="neutral">{r.wrapperCount} issuers</StatusChip>
              </span>
            )}
          </p>
          <p className="mt-[6px] truncate text-[12px] text-ds-muted">
            {r.ticker} · {r.sector}
          </p>
        </div>
      </div>

      {/*
       * The value, and not the multiplication behind it. "0.007 x $743.30" was
       * the same number shown twice — its product is the line above it — and a
       * fractional share count is the least useful way to say how much of
       * something you hold. The position's own page carries both.
       */}
      <span className="text-right font-medium text-ds-ink">{usd(r.value)}</span>

      <span className="text-right text-ds-muted">{(r.weight * 100).toFixed(1)}%</span>

      {/*
       * The chip is built to a 56px minimum and centres what it holds, which
       * is right for a lone figure and wrong in a column: the pill lines up
       * with the column's edge while the number inside floats somewhere in the
       * middle of it, by a distance that changes with the number's own width.
       * Every other column here sets its text flush to the edge.
       *
       * Letting it hug its contents leaves a constant 6px of the chip's own
       * padding, which the header then matches.
       */}
      <span className="flex -translate-y-px justify-end [&>span]:min-w-0">
        <MoveChip value={today} />
      </span>

      <span className="flex items-baseline justify-end gap-[5px] whitespace-nowrap">
        <span className={`font-medium ${r.returnUsd < 0 ? "text-ds-loss" : "text-ds-up"}`}>
          {signed(r.returnUsd, usd(Math.abs(r.returnUsd)))}
        </span>
        <span className="text-[12px] text-ds-muted">
          {signed(r.returnUsd, `${Math.abs(r.returnPct).toFixed(1)}%`)}
        </span>
      </span>
    </Link>
  );
};

/**
 * The holdings table, to holdings.svg: the rail-card title row, then a grey
 * panel 4px in from the card's edge holding the column labels and the rows.
 */
export const Holdings = ({
  m,
  signedIn,
  failed,
}: {
  m: Model | undefined;
  signedIn: boolean;
  failed: boolean;
}) => {
  const [showAll, setShowAll] = useState(false);
  const rows = m?.rows ?? [];
  /*
   * Three, because the rows are sorted largest first and a portfolio's shape
   * is in its top few — the twentieth position is 0.4% of the money and a
   * third of the scroll. The rest are one press away rather than cut: a table
   * that silently stops listing what someone owns is worse than a long one.
   */
  const shown = showAll ? rows : rows.slice(0, 3);
  const hidden = rows.length - shown.length;

  return (
    <section aria-label="Holdings" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead
          title="Holdings"
          meta={m ? (rows.length ? `${rows.length} positions, largest first` : "Nothing yet") : undefined}
          to="/invest"
          linkLabel="Browse stocks"
        />
      </div>

      <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
        {m && rows.length > 0 && (
          <div className="min-w-[716px]">
            <div className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}>
              <span>Name</span>
              <span className="text-right">Value</span>
              <span className="text-right">Weight</span>
              {/* Inset by the chip's own padding, so the label sits over the
                figure rather than over the pill around it. */}
              <span className="pr-1.5 text-right">Today</span>
              <span className="text-right">Return</span>
            </div>
            <GlideRows>
              {shown.map((r) => (
                <Line key={r.ticker} r={r} />
              ))}
            </GlideRows>

            {/* Only when there is something behind it. A control that never
                does anything is furniture. */}
            {rows.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="flex h-11 w-full items-center justify-center rounded-md text-[13px] leading-none font-medium text-ds-muted transition-colors hover:bg-white hover:text-ds-ink"
              >
                {showAll ? "Show fewer" : `Show ${hidden} more`}
              </button>
            )}
          </div>
        )}

        {!m && !failed && (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {((m && rows.length === 0) || failed) && (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-ds-ink">
              {failed
                ? "Could not load your holdings"
                : signedIn
                  ? "You do not hold anything yet"
                  : "Sign in to see your portfolio"}
            </p>
            <p className="mx-auto mt-2 max-w-[36ch] text-[12px] text-ds-muted">
              {failed
                ? "Your shares are safe in your wallet; we just could not read them. Try again in a moment."
                : "Anything you buy, or send to your wallet, shows up here."}
            </p>
            {signedIn && !failed && (
              <ButtonLink to="/invest" variant="primary" className="mt-4">
                Browse stocks
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
