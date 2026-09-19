import { MARKET } from "../mock/data";
import { nyTime } from "../lib/format";

/**
 * These tokens trade while the US market is shut, which is most of the week. Every
 * other app hides that. Ours says it, in amber rather than red, because it is a fact
 * and not an error.
 */
export function MarketBanner() {
  if (MARKET.isOpen) return null;
  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-warn-wash)] px-4 py-3">
        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--color-warn)]" />
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-semibold text-[var(--color-warn)]">
            {MARKET.isWeekend ? "US market closed for the weekend" : "US market closed"}
          </p>
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-[var(--color-warn)]/60">
            Reopens {nyTime(MARKET.nextOpenAt)}. Prices can drift from the real share price while it is shut.
          </p>
        </div>
      </div>
    </div>
  );
}
