import { Link } from "react-router-dom";
import { ButtonLink } from "../../ui/Button";
import { GlideRows, MoveChip, RailHead, StatusChip } from "../../ui/ds";
import { shares as fmtShares, usd, usdCompact } from "../format";
import type { Model, Row } from "./model";
import { Skeleton } from "./ui";

/**
 * Built to holdings.svg. The name takes what is left; the figures sit in fixed
 * columns on the right, right-aligned: value ends 411 from the card's left in
 * the 992 design, then weight 120 on, today 125, return 168, borrow 144.
 */
const COLS = "grid-cols-[minmax(0,1fr)_130px_120px_125px_168px_144px]";

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
  const price = Number(r.shares) > 0 ? usd(r.value / Number(r.shares)) : "—";
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

      <div className="text-right">
        <p className="font-medium text-ds-ink">{usd(r.value)}</p>
        <p className="mt-[6px] text-[12px] whitespace-nowrap text-ds-muted">
          {fmtShares(r.shares)} x {price}
        </p>
      </div>

      <span className="text-right text-ds-muted">{(r.weight * 100).toFixed(1)}%</span>

      <span className="flex -translate-y-px justify-end">
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

      <span className="flex items-baseline justify-end gap-[5px] whitespace-nowrap">
        {r.ltv > 0 ? (
          <>
            <span className="font-medium text-ds-ink">{usdCompact(r.borrowable)}</span>
            <span className="text-[12px] text-ds-muted">{Math.round(r.ltv * 100)}%</span>
          </>
        ) : (
          <span className="text-ds-muted">Not accepted</span>
        )}
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
}) => (
  <section aria-label="Holdings" className="min-w-0 rounded-xl bg-white p-1">
    <div className="px-5 pt-4">
      <RailHead
        title="Holdings"
        meta={m ? (m.rows.length ? `${m.rows.length} positions, largest first` : "Nothing yet") : undefined}
        to="/invest"
        linkLabel="Browse stocks"
      />
    </div>

    <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
      {m && m.rows.length > 0 && (
        <div className="min-w-[860px]">
          <div className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}>
            <span>Name</span>
            <span className="text-right">Value</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Today</span>
            <span className="text-right">Return</span>
            <span className="text-right">Borrow up to</span>
          </div>
          <GlideRows>
            {m.rows.map((r) => (
              <Line key={r.ticker} r={r} />
            ))}
          </GlideRows>
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

      {((m && m.rows.length === 0) || failed) && (
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
