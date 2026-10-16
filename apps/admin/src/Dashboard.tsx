import { useState } from "react";
import { Baskets, Health, MoneyIn, People, Trading } from "./panels";
import { Panel } from "./ui";
import {
  useAdminBaskets,
  useAdminFunding,
  useAdminHealth,
  useAdminOrders,
  useAdminOverview,
} from "./useAdmin";

/**
 * The dashboard.
 *
 * Read-only, and gated by the server: `ADMIN_PRIVY_USER_IDS` on the API
 * decides who sees anything, and every route here 404s for everybody else.
 * There is no client-side check worth having — this app being reachable is
 * not a secret, and what it can read is decided somewhere a console cannot
 * edit.
 *
 * The sections are in the order somebody actually reads them: is the
 * machinery alive, who is here, is money arriving, what are they trading, is
 * anything jammed.
 */

/** The windows worth having. A year is the cap the API enforces. */
const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

const since = (days: number): string =>
  `?from=${new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)}`;

export const Dashboard = ({ onSignOut }: { onSignOut: () => void }) => {
  const [days, setDays] = useState<number>(30);
  const params = since(days);

  const health = useAdminHealth();
  const overview = useAdminOverview(params);
  const orders = useAdminOrders(params);
  const funding = useAdminFunding(params);
  const baskets = useAdminBaskets(params);

  /*
   * One 404 is the whole answer.
   *
   * Either this account is not on the allowlist, or the deployment never set
   * one. The page says nothing about which, for the same reason the API
   * answers 404 rather than 403.
   */
  const refused = [health, overview, orders, funding, baskets].some(
    (q) => q.isError && (q.error as { status?: number }).status === 404,
  );

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 pt-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Mercury admin</h1>
            <span className="text-[12px] text-faint">read-only</span>
          </div>
          <div className="flex items-center gap-2.5">
            {!refused && (
              <div className="flex items-center gap-0.5 rounded-full bg-white p-0.5 outline-1 outline-black/10">
                {WINDOWS.map((w) => (
                  <button
                    key={w.label}
                    type="button"
                    onClick={() => setDays(w.days)}
                    aria-pressed={days === w.days}
                    className={`h-8 rounded-full px-3 text-[12px] font-medium transition-colors ${
                      days === w.days ? "bg-ds-panel text-ds-ink" : "text-muted hover:text-ds-ink"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 rounded-full px-3 text-[12px] font-medium text-muted transition-colors hover:text-ds-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="px-5 pt-6 pb-16 sm:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          {refused ? (
            <Panel title="Not found">
              <p className="px-3 pb-4 text-[12px] text-faint sm:px-5">
                This account cannot read the admin surface.
              </p>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* Health first, and across the full width: it is the line to read
                  before trusting any figure under it. */}
              <div className="xl:col-span-2">
                <Health data={health.data} />
              </div>
              <People data={overview.data} />
              <MoneyIn data={funding.data} />
              <Trading data={orders.data} />
              <Baskets data={baskets.data} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
