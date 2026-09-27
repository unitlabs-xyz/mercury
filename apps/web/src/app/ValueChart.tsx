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
 * There is no chart yet, and this says so rather than drawing one.
 *
 * A portfolio line needs a history of what the holdings were worth, and no
 * upstream we read sells one: Jupiter gives spot, Pyth gives spot and a
 * calendar, Kamino gives rates. The design records it ourselves — an hourly
 * `portfolio_snapshot` written by the worker — which is subsystem 4.
 *
 * Until that exists the honest thing is an empty state. A line drawn from a
 * deterministic random walk looked convincing, which is exactly what made it
 * the wrong thing to ship. The dot chart is ready for when it does.
 */
/** The account's value over a range, or null when there is no history to show. */
export const useHistory = (range: Range): readonly Point[] | null => (SAMPLE ? SAMPLE_HISTORY[range] : null);

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
          We record your balance hourly from the day you open the account. The chart appears once there is
          more than a day of it.
        </p>
      </div>
    </div>
  );
};
