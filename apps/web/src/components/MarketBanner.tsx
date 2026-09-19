import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";

/**
 * The market is shut for about two thirds of the week and our tokens trade through it.
 * Most apps hide that. We make it a designed state, in amber rather than red, because
 * it is a fact and not an error. See docs/07.
 */
export function MarketBanner() {
  const { data } = useQuery({ queryKey: ["market"], queryFn: () => client.marketStatus(), refetchInterval: 60_000 });
  if (data === undefined || data.isOpen) return null;

  const opens = data.nextOpenAt === null ? null : new Date(data.nextOpenAt);
  return (
    <div className="mx-4 my-3 rounded-[var(--radius-card)] bg-[var(--color-warning-bg)] px-4 py-3">
      <p className="m-0 font-semibold text-[var(--color-warning)]">
        {data.isWeekend ? "US market is closed for the weekend" : "US market is closed"}
      </p>
      <p className="m-0 mt-1 text-sm text-[var(--color-warning)]">
        {opens
          ? `Reopens ${opens.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}. `
          : ""}
        Prices can drift from the real share price while it is shut.
      </p>
    </div>
  );
}
