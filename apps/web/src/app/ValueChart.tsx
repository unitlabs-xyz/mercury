import { usePortfolioHistory } from "../api/hooks";
import type { Point } from "./DotChart";
import { Clock } from "../ui/icons";
import { DotChart } from "./DotChart";
import { Skeleton } from "./portfolio/ui";

export type Range = "1D" | "1W" | "1M";

export const RANGE_LABEL: Record<Range, string> = {
  "1D": "today",
  "1W": "the last week",
  "1M": "the last month",
};

/**
 * How a reading's instant reads on the axis.
 *
 * Formatted here rather than on the server, because the hour a reading belongs
 * to is the reader's hour and only their browser knows which that is. A server
 * that sent "02 PM" would be sending its own afternoon.
 */
export const LABEL: Record<Range, (at: Date) => string> = {
  "1D": (at) => at.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" }),
  "1W": (at) => at.toLocaleString("en-US", { weekday: "short", day: "numeric", hour: "2-digit" }),
  "1M": (at) => `${at.getDate()} ${at.toLocaleString("en-US", { month: "short" })}`,
};

/**
 * What to draw, and whether the transfers really came out of it.
 *
 * An account that holds money now was not worth nothing an hour ago. When
 * subtracting the transfers says it was, the flows disagree with the values
 * they are being taken from, and the subtraction is the part that is wrong —
 * drawing it anyway told somebody holding $9.71 that they were down $10.02,
 * a line to the floor that reads as every penny gone. The recorded values are
 * always true, so fall back to them and stop claiming otherwise.
 */
export const drawnSeries = (
  points: readonly { valueUsd: string; netFlowUsd: string }[],
): { values: readonly number[]; excludesTransfers: boolean } => {
  const raw = points.map((p) => Number(p.valueUsd));
  const net = points.map((p) => Number(p.netFlowUsd));
  const excludesTransfers = raw.every((value, i) => value - net[i]! > 0 || value <= 0);
  return {
    values: excludesTransfers ? raw.map((value, i) => value - net[i]!) : raw,
    excludesTransfers,
  };
};

/**
 * The account's value over a range, or null when there is no line to draw.
 *
 * A portfolio's history is the one thing no upstream sells — Jupiter gives
 * spot, Pyth gives spot and a calendar, Kamino gives rates — so §6 of the
 * backend design records it ourselves, hourly, and this reads it back. Until
 * that job had run twice for an account there was nothing here but an empty
 * state, and for a new account there still is.
 *
 * Sample mode goes through the same fetch, because `sampleResponse` answers
 * this route too: one path through here, and the labelling below runs in design
 * review rather than only in production.
 *
 * Only recorded readings are drawn. Appending the live total to close the gap
 * to the current hour was tried and reverted: the two are read separately, and
 * the moment they disagree — a snapshot taken before a deposit, a price read a
 * minute apart — the line ends in a vertical cliff. In sample mode it was a
 * $3,896 drop straight down. An hour of lag is a smaller lie than that, and the
 * empty state already tells the reader this is recorded hourly.
 *
 * Whether there is a chart at all stays the server's call: it withholds a lone
 * reading, so this never has to decide what one point means.
 */
export const useHistory = (range: Range): { points: readonly Point[]; excludesTransfers: boolean } | null => {
  const recorded = usePortfolioHistory(range);

  const points = recorded.data?.points ?? [];
  if (points.length < 2) return null;
  const { values, excludesTransfers } = drawnSeries(points);

  return {
    points: points.map((p, i) => ({ label: LABEL[range](new Date(p.at)), value: values[i]! })),
    excludesTransfers,
  };
};

export const ValueChart = ({ range, onZoom }: { range: Range; onZoom?: (dir: 1 | -1) => void }) => {
  const history = useHistory(range);
  /*
   * Same query, already cached — this costs no extra request, and it separates
   * the two things `useHistory` collapses into null. Without it a chart that
   * had simply not loaded yet claimed "Not enough history yet", which is a
   * statement about the account rather than about the request, and wrong.
   */
  const loading = usePortfolioHistory(range).isLoading;

  if (!history && loading) {
    return (
      <div
        aria-label={`Value over ${RANGE_LABEL[range]}: loading`}
        role="img"
        className="min-h-[200px] w-full rounded-lg bg-ds-panel p-4"
      >
        <Skeleton className="h-full min-h-[168px] w-full" />
      </div>
    );
  }

  return history ? (
    <DotChart
      series={history.points}
      label={RANGE_LABEL[range]}
      scale="price"
      {...(onZoom ? { onZoom } : {})}
    />
  ) : (
    <div
      role="img"
      aria-label={`Value over ${RANGE_LABEL[range]}: not enough history yet`}
      className="grid min-h-[200px] w-full place-items-center rounded-lg bg-ds-panel px-6 py-8 text-center"
    >
      <div>
        <Clock className="mx-auto size-4 text-ds-muted" />
        <p className="mt-3 text-[14px] leading-none font-medium text-ds-ink">Not enough history yet</p>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-[12px] leading-[1.45] text-ds-muted">
          We record your balance every hour from the day you open the account. The chart appears once there
          are a couple of readings behind it.
        </p>
      </div>
    </div>
  );
};
