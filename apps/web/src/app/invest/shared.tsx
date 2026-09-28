import type { Instrument, Priced } from "../../market/hooks";
import type { Span } from "../../market/hooks";
import type { Point } from "../DotChart";

/** A stock as the Invest page reads it: live price and flow, plus the range it is being looked at over. */
export type Row = Priced & {
  /** Move over the selected range, in percent. */
  readonly change: number;
  readonly spark: number[] | null;
  readonly owned: boolean;
  readonly saved: boolean;
};

export const Mark = ({ i, size = 28 }: { i: Instrument; size?: number }) =>
  i.logo ? (
    <img
      src={i.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-chip text-[11px] font-bold text-ink-soft"
    >
      {i.ticker.slice(0, 2)}
    </span>
  );

/** Unlit sparkline dots on the grey list panel: a step darker than the panel, so the matrix still reads. */
export const LIST_DOT = "#e4e4e4";

/** 115k, 1.4k, 912. */
export const compact = (v: number) =>
  !Number.isFinite(v) || v <= 0
    ? "—"
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

const SPAN_MS: Record<Span, number> = {
  "1D": 864e5,
  "1W": 6048e5,
  "1M": 2592e6,
  "6M": 15552e6,
  "1Y": 31536e6,
  "5Y": 157788e6,
};

/** One formatter per range, made once: building them per dot was most of a chart's render time. */
const LABEL: Record<"1D" | "1W" | "other", Intl.DateTimeFormat> = {
  "1D": new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }),
  "1W": new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }),
  other: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }),
};

/** Readings spread evenly over the range, each named for the tooltip: "14:00", "Sat 19", "27 Sep". */
export const points = (values: readonly number[], range: Span): Point[] => {
  const span = SPAN_MS[range];
  const now = Date.now();
  const fmt = range === "1D" || range === "1W" ? LABEL[range] : LABEL.other;
  return values.map((value, i) => {
    const label = fmt.format(now - span + (span * i) / Math.max(1, values.length - 1));
    return { label, value };
  });
};
