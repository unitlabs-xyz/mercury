import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../../ui/Button";
import { GlideRows, MoveChip, RailHead, StatusChip } from "../../ui/ds";
import { pct, usd, usdSigned } from "@mercury/view";
import type { Model, Row } from "./model";
import { SkeletonRows } from "./ui";
import { XSTOCKS_LOGO_RADIUS } from "../invest/shared";
import { TOKEN_NAME, useProviders } from "../stock/heldAs";
import type { Issuer } from "@mercury/types";

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
const COLS = "grid-cols-[minmax(0,1fr)_120px_100px_110px_150px]";
const ZERO_RETURN = (
  <>
    <span className="font-medium text-ds-up">{usdSigned(0)}</span>
    <span className="text-[12px] text-ds-muted">+{pct(0, 1)}</span>
  </>
);

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
      style={row.logoSquare ? { borderRadius: XSTOCKS_LOGO_RADIUS } : undefined}
      className={`size-9 shrink-0 ${row.logoSquare ? "" : "rounded-full"}`}
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
const Line = ({ r, providers }: { r: Row; providers: readonly Issuer[] | undefined }) => {
  const pledged = r.pledgedShares;
  const today = r.changePct24h;
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
                  {pledged >= r.shares - 1e-9 ? "Pledged" : `${Number(pledged.toFixed(2))} pledged`}
                </StatusChip>
              </span>
            )}
          </p>
          <p className="mt-[6px] truncate text-[12px] text-ds-muted">
            {r.ticker} · {r.sector}
            {/* Who issues the shares: one provider, or both when a stock is held through each. */}
            {providers && providers.length > 0 && <> · {providers.map((i) => TOKEN_NAME[i]).join(" + ")}</>}
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

      {r.returnPct === null ? (
        <span
          className="flex items-baseline justify-end gap-[5px] whitespace-nowrap"
          title="Purchase cost was not recorded; zero is a display placeholder, not calculated profit"
        >
          {ZERO_RETURN}
        </span>
      ) : (
        <span
          className="flex items-baseline justify-end gap-[5px] whitespace-nowrap"
          // What the stock did, as the header above reports it — the two have
          // to agree or the rows will not add up to the figure. What it cost
          // to be in it, and the dollars the two come to, are here.
          title={[
            `${signed(r.marketReturnUsd, usd(Math.abs(r.marketReturnUsd)))} of share price movement`,
            r.tradingCostUsd >= 0.005
              ? `less ${usd(r.tradingCostUsd)} of fees and spread`
              : r.tradingCostUsd <= -0.005
                ? `plus ${usd(-r.tradingCostUsd)} bought below the quote`
                : "no fees or spread",
            `= ${signed(r.returnUsd, usd(Math.abs(r.returnUsd)))} on what you paid`,
            r.returnPartial ? "Shares with no recorded cost are left out" : "",
          ]
            .filter(Boolean)
            .join("\n")}
        >
          <span className={`font-medium ${r.marketReturnUsd < 0 ? "text-ds-loss" : "text-ds-up"}`}>
            {signed(r.marketReturnUsd, usd(Math.abs(r.marketReturnUsd)))}
          </span>
          <span className="text-[12px] text-ds-muted">
            {r.marketReturnPct === null
              ? ""
              : signed(r.marketReturnUsd, `${Math.abs(r.marketReturnPct).toFixed(1)}%`)}
            {r.returnPartial ? " partial" : ""}
          </span>
        </span>
      )}
    </Link>
  );
};

/** A basket held through Glider: what the holdings list needs of it. */
export type BasketHolding = {
  readonly portfolioId: string;
  readonly slug: string | null;
  readonly name: string;
  readonly value: number;
  readonly assetCount: number;
  readonly todayPct: number | null;
  readonly returnPct: number | null;
  /** Value against the cash that went in. Null when nothing recorded any. */
  readonly pnlUsd?: number | null;
  readonly costBasisUsd?: number | null;
  /** False when something left in kind, so the cash taken out is understated. */
  readonly basisIsComplete?: boolean;
  /** The basket's two heaviest assets, for the stacked mark. */
  readonly marks: readonly ReactNode[];
};

/**
 * A basket, held as one position: its stocks are the basket's, not separate
 * rows, and its own page breaks them down. Today is an estimated price move;
 * the return is value against the cash that went in, net of Glider's fees,
 * falling back to their money-weighted percentage when we have no basis.
 */
const BasketLine = ({ b, weight }: { b: BasketHolding; weight: number }) => (
  <Link
    to={b.slug ? `/baskets/${b.slug}` : "/baskets"}
    data-row
    className={`relative grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex w-9 shrink-0 items-center -space-x-3" aria-hidden="true">
        {b.marks.map((m, i) => (
          <span key={i} className="relative" style={{ zIndex: b.marks.length - i }}>
            {m}
          </span>
        ))}
      </span>
      <div className="min-w-0">
        <p className="flex h-3.5 min-w-0 items-center gap-[5px]">
          <span className="truncate font-medium text-ds-ink">{b.name}</span>
          <span className="shrink-0 uppercase">
            <StatusChip tone="neutral">Basket</StatusChip>
          </span>
        </p>
        <p className="mt-[6px] truncate text-[12px] text-ds-muted">{b.assetCount} assets · Ondo</p>
      </div>
    </div>
    <span className="text-right font-medium text-ds-ink">{usd(b.value)}</span>
    <span className="text-right text-ds-muted">{(weight * 100).toFixed(1)}%</span>
    <span className="flex justify-end">
      <MoveChip value={b.todayPct} />
    </span>
    <span
      className="flex items-baseline justify-end gap-[5px] whitespace-nowrap"
      // Named as a total, because that is what it is. A holding's figure beside
      // it is the share price's move with the fees taken off onto their own
      // line; a basket's cannot be split that way, because the fills happen
      // inside Glider and we never see one.
      title={
        b.pnlUsd !== null && b.pnlUsd !== undefined
          ? `Total since you funded it, net of Glider's fees${b.basisIsComplete === false ? ". Understated: something left this basket as assets rather than cash, and no dollar figure was recorded for it" : ""}`
          : b.returnPct === null
            ? "All-time return unavailable; zero is a display placeholder"
            : "Glider money-weighted all-time return"
      }
    >
      {b.pnlUsd !== null && b.pnlUsd !== undefined ? (
        <>
          <span className={`font-medium ${b.pnlUsd < 0 ? "text-ds-loss" : "text-ds-up"}`}>
            {signed(b.pnlUsd, usd(Math.abs(b.pnlUsd)))}
          </span>
          <span className="text-[12px] text-ds-muted">
            {b.returnPct === null ? "" : signed(b.pnlUsd, `${Math.abs(b.returnPct).toFixed(1)}%`)}
            {b.basisIsComplete === false ? " partial" : ""}
          </span>
        </>
      ) : b.returnPct === null ? (
        ZERO_RETURN
      ) : (
        <span className={`font-medium ${b.returnPct < 0 ? "text-ds-loss" : "text-ds-up"}`}>
          {b.returnPct >= 0 ? "+" : ""}
          {b.returnPct.toFixed(1)}%
        </span>
      )}
    </span>
  </Link>
);

/**
 * The holdings table, to holdings.svg: the rail-card title row, then a grey
 * panel 4px in from the card's edge holding the column labels and the rows.
 */
export const Holdings = ({
  m,
  signedIn,
  failed,
  baskets = [],
}: {
  m: Model | undefined;
  signedIn: boolean;
  failed: boolean;
  baskets?: readonly BasketHolding[];
}) => {
  const [showAll, setShowAll] = useState(false);
  const providers = useProviders(m?.rows ?? []);
  /* Each table is largest first. Baskets stay separate from directly held stocks. */
  const rows = [...(m?.rows ?? [])].sort((a, b) => b.value - a.value);
  const basketRows = [...baskets].sort((a, b) => b.value - a.value);
  /*
   * Three, because the rows are sorted largest first and a portfolio's shape
   * is in its top few — the twentieth position is 0.4% of the money and a
   * third of the scroll. The rest are one press away rather than cut: a table
   * that silently stops listing what someone owns is worse than a long one.
   */
  const shown = showAll ? rows : rows.slice(0, 3);
  /* Baskets but no wallet stocks: the card is only its title row, and needs
     the same space under it as above, or the text sits on the bottom edge. */
  const headerOnly = !(!m || failed || rows.length > 0 || basketRows.length === 0);
  const hidden = rows.length - shown.length;

  return (
    <>
      <section aria-label="Holdings" className="min-w-0 rounded-xl bg-white p-1">
        <div className={`px-3 pt-4 sm:px-5 ${headerOnly ? "pb-4" : ""}`}>
          <RailHead
            title="Holdings"
            meta={
              m
                ? rows.length
                  ? `${rows.length} ${rows.length === 1 ? "position" : "positions"}`
                  : basketRows.length
                    ? "No wallet holdings"
                    : "Nothing yet"
                : undefined
            }
            to="/invest"
            linkLabel="Browse stocks"
          />
        </div>

        {!headerOnly && (
          <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
            {m && rows.length > 0 && (
              <div className="min-w-[830px]">
                <div
                  className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}
                >
                  <span>Name</span>
                  <span className="text-right" title="Wallet and pledged value">
                    Value
                  </span>
                  <span className="text-right">Weight</span>
                  {/* Inset by the chip's own padding, so the label sits over the
                figure rather than over the pill around it. */}
                  <span className="pr-1.5 text-right">Today</span>
                  <span
                    className="text-right"
                    title="Share price movement since purchase, on wallet and pledged shares with a recorded cost basis. Fees and spread are shown on each row."
                  >
                    Return
                  </span>
                </div>
                <GlideRows>
                  {shown.map((r) => (
                    <Line key={r.ticker} r={r} providers={providers.get(r.ticker)} />
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

            {!m && !failed && <SkeletonRows count={4} />}

            {((m && rows.length === 0 && basketRows.length === 0) || failed) && (
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
        )}
      </section>

      {m && basketRows.length > 0 && (
        <section aria-label="Basket holdings" className="min-w-0 rounded-xl bg-white p-1">
          <div className="px-3 sm:px-5 pt-4">
            <RailHead
              title="Basket holdings"
              meta={`${basketRows.length} ${basketRows.length === 1 ? "basket" : "baskets"}`}
              to="/baskets"
              linkLabel="Manage baskets"
            />
          </div>

          <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
            <div className="min-w-[830px]">
              <div className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}>
                <span>Name</span>
                <span className="text-right" title="Glider basket value">
                  Value
                </span>
                <span className="text-right">Weight</span>
                <span className="pr-1.5 text-right">Today</span>
                <span
                  className="text-right"
                  title="Value against the cash that went in, net of Glider's fees. Not the share price move the holdings above report: a basket's fills happen inside Glider, so there is no way to separate the two."
                >
                  Return
                </span>
              </div>
              <GlideRows>
                {basketRows.map((b) => (
                  <BasketLine key={b.portfolioId} b={b} weight={m.assets > 0 ? b.value / m.assets : 0} />
                ))}
              </GlideRows>
            </div>
          </div>
        </section>
      )}
    </>
  );
};
