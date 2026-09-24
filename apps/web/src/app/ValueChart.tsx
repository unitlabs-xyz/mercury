import { Clock } from "../ui/icons";

export type Range = "1W" | "1M";

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
 * the wrong thing to ship.
 */
export const ValueChart = ({ range }: { range: Range }) => (
  <div
    role="img"
    aria-label={`Value over ${range === "1W" ? "the last week" : "the last month"}: not enough history yet`}
    className="grid h-[180px] place-items-center rounded-xl border border-dashed border-hair bg-shell/60 px-6 text-center"
  >
    <div>
      <Clock className="mx-auto size-[18px] text-faint" />
      <p className="mt-2.5 text-[13px] font-medium text-ink-soft">Not enough history yet</p>
      <p className="mx-auto mt-1 max-w-[38ch] text-[12px] text-faint">
        We record your balance hourly from the day you open the account. The chart appears once there is more
        than a day of it.
      </p>
    </div>
  </div>
);
