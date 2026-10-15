import { useState } from "react";
import { AppShell } from "../AppShell";
import { Panel } from "../portfolio/ui";
import { Baskets, Health, MoneyIn, People, Trading } from "./panels";
import {
  useAdminBaskets,
  useAdminFunding,
  useAdminHealth,
  useAdminOrders,
  useAdminOverview,
} from "./useAdmin";

/**
 * The admin dashboard.
 *
 * Read-only, and behind the server answering 200: `ADMIN_PRIVY_USER_IDS` on
 * the API decides who sees anything, and every route here 404s for everybody
 * else. There is no client-side check worth having — the entry in the account
 * menu is rendered from the server's answer, so the worst a tampered client
 * gets is a link to a page whose requests all 404.
 *
 * Lazy, and asserted to stay lazy by `bundle.test.ts`. Three people will open
 * this and every user would otherwise pay for it.
 *
 * The sections are in the order somebody actually reads them: is the machinery
 * alive, who is here, is money arriving, what are they trading, and is
 * anything jammed.
 */

/** The windows worth having. A year is the cap the API enforces. */
const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

const since = (days: number): string => {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return `?from=${from}`;
};

export const Admin = () => {
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
   * Reached by typing the path without being on the allowlist, or on a
   * deployment where the routes were never mounted. It says nothing about
   * whether the surface exists, which is the same thing the API's 404 is
   * careful about.
   */
  const refused = [health, overview, orders, funding, baskets].some(
    (q) => q.isError && (q.error as { status?: number }).status === 404,
  );

  if (refused) {
    return (
      <AppShell current="admin" title="Not found">
        <Panel title="Not found" className="mt-6">
          <p className="px-3 pb-4 text-[12px] text-faint sm:px-5">There is no page here.</p>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell
      current="admin"
      title="Admin"
      aside={<span className="text-[12px] text-faint">read-only</span>}
      actions={
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
      }
    >
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
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
    </AppShell>
  );
};
