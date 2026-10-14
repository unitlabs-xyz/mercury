import type { ReactNode } from "react";
import { InfoTip } from "../ui/ds";
import { ArrowRight } from "../ui/icons";

/** One side of the swap: a white well on the grey panel, the label at 12, the figure at 24 with its unit beside it. */
export const Well = ({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string | undefined;
}) => (
  <div className="min-w-0 rounded-md bg-white px-4 pt-3.5 pb-4">
    <p className="text-[12px] leading-none text-ds-muted">{label}</p>
    <p className="mt-3 flex min-w-0 items-baseline gap-1.5">
      <span className="truncate text-[24px] leading-none font-medium text-ds-ink">{value}</span>
      <span className="shrink-0 text-[12px] leading-none text-ds-muted">{unit}</span>
    </p>
    {sub && <p className="mt-2 truncate text-[11px] leading-none text-ds-muted">{sub}</p>}
  </div>
);

/** A figure row whose explanation lives in an info tip beside the label rather than under the value. */
export const TipLine = ({
  k,
  tip,
  children,
}: {
  k: string;
  tip?: string | undefined;
  children: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 text-[14px] leading-5">
    <dt className="flex items-center gap-1.5 text-ds-muted">
      {k}
      {tip && (
        <InfoTip label={`About ${k.toLowerCase()}`} align="start">
          {tip}
        </InfoTip>
      )}
    </dt>
    <dd className="min-w-0 text-right font-medium text-ds-ink">{children}</dd>
  </div>
);

/**
 * The review panel both order sheets share: one grey panel, what leaves in a
 * white well on the left, what arrives on the right, an arrow badge between
 * them, then the facts as rows on the grey.
 */
export const SwapPanel = ({
  from,
  to,
  before,
  className = "",
  children,
}: {
  from: ReactNode;
  to: ReactNode;
  /** Whatever decides the swap, on the same grey: the withdrawal picks its assets here. */
  before?: ReactNode;
  /** For a panel that has to fill a column rather than sit at its content's height. */
  className?: string;
  children?: ReactNode;
}) => (
  <div className={`rounded-lg bg-ds-panel p-1 ${className}`}>
    {before}
    {/* The badge reaches about 18px into each well, so the wells pad their inner side to clear it. */}
    <div className="relative grid grid-cols-2 gap-1 [&>*:first-child]:pr-7 [&>*:nth-child(2)]:pl-8">
      {from}
      {to}
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ds-ink ring-4 ring-ds-panel"
      >
        <ArrowRight className="size-3.5" />
      </span>
    </div>
    {children && <div className="px-4 pt-4 pb-3">{children}</div>}
  </div>
);
