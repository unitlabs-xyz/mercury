import { usePortfolio, usePortfolioHistory } from "../api/hooks";
import { SAMPLE, SAMPLE_HISTORY } from "../dev/sample";
import type { Point } from "./DotChart";
import { Clock } from "../ui/icons";
import { DotChart } from "./DotChart";

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
 * The account's value over a range, or null when there is no line to draw.
 *
 * A portfolio's history is the one thing no upstream sells — Jupiter gives
 * spot, Pyth gives spot and a calendar, Kamino gives rates — so §6 of the
 * backend design records it ourselves, hourly, and this reads it back. Until
 * that job had run twice for an account there was nothing here but an empty
 * state, and for a new account there still is.
 *
 * The live total is appended as the final point. The recorded series ends at
 * the top of the last hour, which can be fifty-nine minutes ago, and a chart
 * whose last point disagrees with the figure printed directly above it reads as
 * a bug in both. Whether there is a chart at all stays the server's call: it
 * withholds a lone reading, so this never draws a line half of which is live.
 */
export const useHistory = (range: Range): readonly Point[] | null => {
  const recorded = usePortfolioHistory(range);
  const live = usePortfolio();

  if (SAMPLE) return SAMPLE_HISTORY[range];

  const points = recorded.data?.points ?? [];
  if (points.length === 0) return null;

  const series = points.map((p) => ({
    label: LABEL[range](new Date(p.at)),
    value: Number(p.valueUsd),
  }));
  if (live.data === undefined) return series;
  return [...series, { label: LABEL[range](new Date()), value: Number(live.data.totalValueUsd) }];
};

export const ValueChart = ({ range, onZoom }: { range: Range; onZoom?: (dir: 1 | -1) => void }) => {
  const series = useHistory(range);
  return series ? (
    <DotChart series={series} label={RANGE_LABEL[range]} {...(onZoom ? { onZoom } : {})} />
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
          We record your balance every hour from the day you open the account. The chart appears once
          there are a couple of readings behind it.
        </p>
      </div>
    </div>
  );
};
