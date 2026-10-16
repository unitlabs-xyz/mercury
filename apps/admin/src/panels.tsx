import { Sparkline } from "./Sparkline";
import { Figure, Panel, Skeleton } from "./ui";
import { usd, usdCompact } from "@mercury/view";
import { age, dayLabel, minutesBetween, seriesByGroup, share, snapshotStale } from "./format";
import type { BasketStats, FundingStats, Freshness, Overview, OrderStats } from "./useAdmin";

/**
 * The panels of the admin page.
 *
 * No charting dependency. `Sparkline` already draws a series in dots and is
 * eager in the bundle anyway, and anything it cannot show is a table — which
 * for "deposits by chain, by day" is the better answer regardless, since the
 * figures are what somebody reads off it. The main chunk is 2.5 MB and a chart
 * library would be 90 kB of it for a page three people open.
 */

/** A row of figures under a panel header, on the rhythm the dashboard uses. */
const Figures = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-3 pb-4 sm:grid-cols-4 sm:px-5">{children}</div>
);

const Waiting = () => (
  <div className="space-y-2 px-3 pb-4 sm:px-5">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

/** What a panel says when the query came back with nothing in the window. */
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-3 pb-4 text-[12px] text-faint sm:px-5">{children}</p>
);

const Table = ({
  head,
  rows,
}: {
  head: readonly string[];
  rows: readonly { key: string; cells: readonly React.ReactNode[] }[];
}) => (
  <div className="overflow-x-auto px-3 pb-4 sm:px-5">
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-faint">
          {head.map((h, i) => (
            <th key={h} className={`pb-1.5 font-normal ${i === 0 ? "" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-cardline">
            {row.cells.map((cell, i) => (
              <td
                key={i}
                className={`py-1.5 tabular-nums ${i === 0 ? "font-medium" : "text-right text-muted"}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * How old the newest row of each kind is.
 *
 * The snapshot age is first and is the only one with a threshold. It is the
 * only record of what an account used to be worth, nothing can reconstruct a
 * reading that was never taken, and the job runs hourly — so this is the line
 * to look at before anything else on the page.
 */
export const Health = ({ data }: { data: Freshness | undefined }) => {
  const snapshot = data ? minutesBetween(data.snapshotAt, data.now) : null;
  const stale = data !== undefined && snapshotStale(snapshot);

  return (
    <Panel title="Health" meta={stale ? "the hourly snapshot has not run" : undefined}>
      {data === undefined ? (
        <Waiting />
      ) : (
        <Figures>
          <Figure
            label="Portfolio snapshot"
            value={age(snapshot)}
            sub={stale ? "over 90 minutes" : "hourly"}
            {...(stale ? { tone: "warn" as const } : {})}
          />
          <Figure
            label="Price bar"
            value={age(minutesBetween(data.priceBarAt, data.now))}
            sub="market hours"
          />
          <Figure label="Activity" value={age(minutesBetween(data.activityAt, data.now))} sub="on movement" />
        </Figures>
      )}
    </Panel>
  );
};

export const People = ({ data }: { data: Overview | undefined }) => (
  <Panel title="People" meta={data ? `${data.users} signed up` : undefined}>
    {data === undefined ? (
      <Waiting />
    ) : (
      <>
        <Figures>
          <Figure label="Users" value={data.users} />
          <Figure label="Funded" value={data.funded} sub={`${share(data.funded, data.users)} of signups`} />
          <Figure label="Traded" value={data.traded} sub={`${share(data.traded, data.funded)} of funded`} />
          <Figure label="Assets under management" value={usd(data.aumUsd)} sub="latest reading each" />
        </Figures>
        {data.newUsers.length > 0 && (
          <div className="px-3 pb-4 sm:px-5">
            <p className="mb-1.5 text-[12px] text-faint">
              New users, {dayLabel(data.newUsers[0]!.day)} to{" "}
              {dayLabel(data.newUsers[data.newUsers.length - 1]!.day)}
            </p>
            <Sparkline values={data.newUsers.map((d) => d.count)} className="h-10 w-full" />
          </div>
        )}
        {data.walletsByKind.length > 0 && (
          <Table
            head={["Wallet", "Count"]}
            rows={data.walletsByKind.map((w) => ({
              key: w.kind,
              cells: [w.kind === "privy_embedded" ? "Privy embedded" : "External", w.count],
            }))}
          />
        )}
      </>
    )}
  </Panel>
);

/**
 * Where the money comes from.
 *
 * The panel this surface was asked for. The chain trend is a line per chain
 * over the same days — `seriesByGroup` fills the days a chain saw nothing with
 * zero, because a series that skipped them would slope between two points a
 * week apart and read as steady traffic.
 */
export const MoneyIn = ({ data }: { data: FundingStats | undefined }) => {
  if (data === undefined) {
    return (
      <Panel title="Money in">
        <Waiting />
      </Panel>
    );
  }

  const trend = seriesByGroup(
    data.byChain,
    (r) => r.chain,
    (r) => r.day,
    (r) => r.count,
  );
  const settled = data.byChain.filter((r) => r.status === "settled").reduce((n, r) => n + r.count, 0);
  const failed = data.byChain.filter((r) => r.status === "failed").reduce((n, r) => n + r.count, 0);

  return (
    <Panel title="Money in" meta={`${trend.groups.length} chains`}>
      <Figures>
        <Figure label="Deposits settled" value={settled} />
        <Figure
          label="Failed"
          value={failed}
          sub={`${share(failed, settled + failed)} of attempts`}
          {...(failed > 0 ? { tone: "down" as const } : {})}
        />
        <Figure label="Chains" value={trend.groups.length} />
      </Figures>

      {trend.groups.length === 0 ? (
        <Empty>No deposits in this window.</Empty>
      ) : (
        <div className="space-y-3 px-3 pb-4 sm:px-5">
          {trend.groups.map((g) => (
            <div key={g.name} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-[12px] font-medium">{g.name}</span>
              <Sparkline values={g.values} className="h-6 flex-1" />
              <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted">{g.total}</span>
            </div>
          ))}
          <p className="text-[11px] text-faint">
            {dayLabel(trend.days[0]!)} to {dayLabel(trend.days[trend.days.length - 1]!)}
          </p>
        </div>
      )}

      {data.settleSeconds.length > 0 && (
        <Table
          head={["Chain", "Median settle"]}
          rows={data.settleSeconds.map((s) => ({
            key: s.chain,
            cells: [s.chain, `${Math.round(s.p50)}s`],
          }))}
        />
      )}

      {data.failures.length > 0 && (
        <Table
          head={["Why it failed", "Count"]}
          rows={data.failures.map((f) => ({ key: f.reason, cells: [f.reason, f.count] }))}
        />
      )}
    </Panel>
  );
};

export const Trading = ({ data }: { data: OrderStats | undefined }) => {
  if (data === undefined) {
    return (
      <Panel title="Trading">
        <Waiting />
      </Panel>
    );
  }

  const sum = (pick: (r: OrderStats["byDay"][number]) => string) =>
    data.byDay.reduce((total, r) => total + Number(pick(r)), 0);
  const orders = data.byStatus.reduce((n, s) => n + s.count, 0);
  const filled = data.byStatus.find((s) => s.status === "filled")?.count ?? 0;

  return (
    <Panel title="Trading" meta={`${orders} orders`}>
      <Figures>
        {/* Summed from the per-day strings for the headline only. The exact
            decimals are in the table below; a total rendered to the cent is
            what this line is for. */}
        <Figure label="Volume" value={usdCompact(sum((r) => r.volumeUsd))} />
        <Figure label="Revenue" value={usd(sum((r) => r.revenueUsd))} sub="Mercury's fee only" />
        <Figure label="Fill rate" value={share(filled, orders)} sub={`${filled} of ${orders}`} />
        <Figure label="Realised P&L" value={usd(sum((r) => r.realisedPnlUsd))} sub="across all accounts" />
      </Figures>

      {data.byDay.length === 0 ? (
        <Empty>Nothing traded in this window.</Empty>
      ) : (
        <Table
          head={["Day", "Buys", "Sells", "Volume", "Revenue"]}
          rows={data.byDay.map((d) => ({
            key: d.day,
            cells: [dayLabel(d.day), d.buys, d.sells, usd(d.volumeUsd), usd(d.revenueUsd)],
          }))}
        />
      )}

      {data.byStatus.length > 0 && (
        <Table
          head={["Status", "Orders"]}
          rows={data.byStatus.map((s) => ({ key: s.status, cells: [s.status, s.count] }))}
        />
      )}

      {data.topTickers.length > 0 && (
        <Table
          head={["Busiest", "Orders", "Volume"]}
          rows={data.topTickers.map((t) => ({
            key: t.ticker,
            cells: [t.ticker, t.count, usd(t.volumeUsd)],
          }))}
        />
      )}
    </Panel>
  );
};

export const Baskets = ({ data }: { data: BasketStats | undefined }) => (
  <Panel title="Baskets" meta={data && data.stuck > 0 ? `${data.stuck} stuck` : undefined}>
    {data === undefined ? (
      <Waiting />
    ) : (
      <>
        <Figures>
          <Figure label="Actions" value={data.byKind.reduce((n, k) => n + k.count, 0)} />
          {/* Lifetime, not the window: an action that jammed two months ago is
              still jammed, and it is the only row here anybody has to act on. */}
          <Figure
            label="Stuck"
            value={data.stuck}
            sub="pending past its retry, all time"
            {...(data.stuck > 0 ? { tone: "warn" as const } : {})}
          />
        </Figures>
        {data.byKind.length === 0 ? (
          <Empty>No basket actions in this window.</Empty>
        ) : (
          <Table
            head={["Kind", "Count"]}
            rows={data.byKind.map((k) => ({ key: k.kind, cells: [k.kind, k.count] }))}
          />
        )}
        {data.byState.length > 0 && (
          <Table
            head={["State", "Count"]}
            rows={data.byState.map((s) => ({ key: s.state, cells: [s.state, s.count] }))}
          />
        )}
      </>
    )}
  </Panel>
);
