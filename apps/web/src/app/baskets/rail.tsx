import { useState } from "react";
import { Link } from "react-router-dom";
import { usd } from "@mercury/view";
import type { BasketPortfolioSummary, Basket } from "@mercury/types";
import type { Instrument } from "../../market/hooks";
import { ArrowRight } from "../../ui/icons";
import { Button } from "../../ui/Button";
import { GlideRows, RailCard, RailHead } from "../../ui/ds";
import { RailList } from "../invest/Rail";
import { relTime, Skeleton } from "../portfolio/ui";
import { AssetIcon } from "./AssetIcon";
import { displayBasketName, THEME_ART_TREATMENT } from "./catalog";
import { OperationStatus } from "./OperationStatus";
import { rebalanceOutcome } from "./rebalance-status";
import { readPortfolioOperations, sortOperationRows, type BasketOperationRow } from "./operations";
import { useBasketOperations } from "../../api/baskets";

const steps = [
  ["Choose a strategy", "Each template sets target weights for Solana tokenized assets."],
  ["You own the assets", "The holdings live in your own smart account, not in one pooled basket token."],
  ["Glider rebalances daily", "Glider works toward the target weights as market prices move."],
] as const;

type RailProps = {
  onExplore: () => void;
  onCompose: () => void;
  onSignIn: () => void;
  onRetry: () => void;
  signedIn: boolean;
  loading: boolean;
  error: boolean;
  portfolios: readonly BasketPortfolioSummary[];
  templates: readonly Basket[];
  instruments: ReadonlyMap<string, Instrument>;
};

/** The two heaviest holdings mark a basket wherever it is listed. */
const topAssets = (template: Basket | undefined) =>
  [...(template?.allocations ?? [])].sort((a, b) => b.weightBps - a.weightBps).slice(0, 2);

/** A basket's marks and name, shared by every rail row so the lists stay identical. */
const BasketIdentity = ({
  name,
  detail,
  assets,
  instruments,
}: {
  name: string;
  detail: string;
  assets: ReturnType<typeof topAssets>;
  instruments: RailProps["instruments"];
}) => (
  <span className="flex min-w-0 items-center gap-3">
    <span className="flex w-[44px] shrink-0 items-center -space-x-2" aria-hidden="true">
      {assets.map((asset, index) => (
        <span key={asset.ticker} className="relative shrink-0" style={{ zIndex: assets.length - index }}>
          <AssetIcon
            asset={asset}
            source={instruments.get(asset.ticker)}
            className="size-7 rounded-full bg-white object-contain ring-2 ring-ds-panel"
          />
        </span>
      ))}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
        {displayBasketName(name)}
      </span>
      <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">{detail}</span>
    </span>
  </span>
);

const BasketList = ({
  onExplore,
  onSignIn,
  onRetry,
  signedIn,
  loading,
  error,
  portfolios,
  templates,
  instruments,
}: RailProps) => {
  const [expanded, setExpanded] = useState(false);
  const byUsdcBalance = [...portfolios].sort((a, b) => {
    if (a.usdcBalance === null) return b.usdcBalance === null ? 0 : 1;
    if (b.usdcBalance === null) return -1;
    return Number(b.usdcBalance) - Number(a.usdcBalance);
  });
  const visible = expanded ? byUsdcBalance : byUsdcBalance.slice(0, 3);
  const templateBySlug = new Map(templates.map((template) => [template.slug, template]));

  if (loading && (!signedIn || portfolios.length === 0)) {
    return (
      <div
        className="flex min-h-[182px] flex-col justify-center gap-3 px-3"
        aria-label="Loading your baskets"
      >
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-[44px] w-full" />
        ))}
      </div>
    );
  }

  if (!signedIn || portfolios.length === 0) {
    const title = !signedIn
      ? "Sign in to see your baskets"
      : error
        ? "Your baskets are unavailable"
        : "No baskets yet";
    const detail = !signedIn
      ? "Your Glider portfolios will appear here after you sign in."
      : error
        ? "We couldn't load your Glider portfolios. Your assets remain in your smart account."
        : "Explore a strategy to create your first Glider portfolio.";
    return (
      <div className="flex min-h-[182px] flex-col items-center justify-center px-6 py-5 text-center">
        <p className="text-[14px] font-medium text-ds-ink">{title}</p>
        <p className="mt-2 max-w-[30ch] text-[12px] leading-relaxed text-ds-muted">{detail}</p>
        <button
          type="button"
          onClick={!signedIn ? onSignIn : error ? onRetry : onExplore}
          className="mt-4 rounded-full border border-ds-divider bg-white px-4 py-2 text-[12px] font-medium text-ds-ink hover:bg-ds-panel"
        >
          {!signedIn ? "Sign in" : error ? "Try again" : "Explore strategies"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[182px]">
      {error && (
        <div
          role="alert"
          className="mx-2 mb-1 flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-[11px] text-ds-muted"
        >
          <span>Refresh failed · showing last balances</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 font-medium text-ds-link hover:underline"
          >
            Retry
          </button>
        </div>
      )}
      <GlideRows as="ul">
        {visible.map((portfolio) => {
          return (
            <li key={portfolio.portfolioId}>
              <Link
                data-row
                to={`/baskets/${portfolio.slug}`}
                className="relative grid min-h-[60px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2"
              >
                <BasketIdentity
                  name={portfolio.name}
                  detail={`${portfolio.targetAssetCount} target assets · On Glider`}
                  assets={topAssets(templateBySlug.get(portfolio.slug))}
                  instruments={instruments}
                />
                <span className="flex min-w-[82px] flex-col items-end text-right">
                  <span className="text-[14px] leading-[18px] font-medium tabular-nums text-ds-ink">
                    {usd(portfolio.totalValueUsd)}
                  </span>
                  <span className="mt-0.5 text-[11px] leading-4 tabular-nums text-ds-muted">
                    {portfolio.usdcBalance === null ? "USDC —" : `${usd(portfolio.usdcBalance)} USDC`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </GlideRows>
      {portfolios.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-2 text-[12px] font-medium text-ds-link hover:opacity-80"
        >
          {expanded ? "Show fewer baskets" : `Show all ${portfolios.length} baskets`}
        </button>
      )}
      {visible.some((portfolio) => portfolio.partial) && (
        <p className="px-3 pt-1 pb-2 text-[11px] leading-relaxed text-ds-muted">
          Some portfolio data is temporarily unavailable.
        </p>
      )}
    </div>
  );
};

/*
 * The rebalances and withdrawals started in this browser session. Glider runs
 * them asynchronously, so this is the one place a person can watch several
 * baskets finish without opening each one.
 */
const OperationList = ({
  portfolios,
  templates,
  instruments,
}: Pick<RailProps, "portfolios" | "templates" | "instruments">) => {
  /* Read at render: nothing on this page writes these keys, and a poll re-reads them for free. */
  const requests = portfolios.flatMap((portfolio) => {
    const stored = readPortfolioOperations(portfolio.portfolioId);
    return [
      ...(stored.rebalanceId
        ? [{ portfolio, operationId: stored.rebalanceId, rebalance: true, name: "Manual rebalance" }]
        : []),
      ...(stored.exit
        ? [
            {
              portfolio,
              operationId: stored.exit.operationId,
              rebalance: false,
              name: stored.exit.mode === "in_kind" ? "In-kind withdrawal" : "Exit to USDC",
            },
          ]
        : []),
    ];
  });
  const results = useBasketOperations(
    requests.map(({ portfolio, operationId }) => ({ slug: portfolio.slug, operationId })),
  );
  if (requests.length === 0) return null;

  const rows: BasketOperationRow[] = requests.map((request, index) => {
    const result = results[index];
    const operation = result?.data;
    const unavailable = Boolean(result?.isError);
    /* A rebalance has its own wording for an unconfirmed outcome; an exit reads its state plainly. */
    const label = unavailable
      ? "Status unavailable"
      : !operation
        ? "Checking…"
        : request.rebalance
          ? rebalanceOutcome(operation.state, operation.error).label
          : operation.state.replaceAll("_", " ");
    return {
      key: `${request.portfolio.portfolioId}:${request.operationId}`,
      portfolio: request.portfolio,
      name: request.name,
      label,
      state: operation?.state,
      unavailable,
      occurredAt: operation?.updatedAt ?? operation?.createdAt ?? null,
    };
  });
  const templateBySlug = new Map(templates.map((template) => [template.slug, template]));

  return (
    <RailList label="Basket operations" meta="On Glider">
      <GlideRows as="ul">
        {sortOperationRows(rows).map((row) => {
          return (
            <li key={row.key}>
              <Link
                data-row
                to={`/baskets/${row.portfolio.slug}`}
                className="relative grid min-h-[60px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2"
              >
                <BasketIdentity
                  name={row.portfolio.name}
                  detail={row.name}
                  assets={topAssets(templateBySlug.get(row.portfolio.slug))}
                  instruments={instruments}
                />
                <span className="flex flex-col items-end gap-0.5 text-right text-[12px]">
                  <OperationStatus state={row.state} label={row.label} unavailable={row.unavailable} />
                  <span className="text-[11px] leading-4 tabular-nums text-ds-muted">
                    {row.occurredAt ? relTime(row.occurredAt) : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </GlideRows>
    </RailList>
  );
};

/** The Invest rail's card rhythm, with Glider ownership explained accurately. */
export const BasketsRail = (props: RailProps) => (
  <aside aria-label="Baskets information" className="grid gap-4 md:gap-6">
    <section
      aria-label="Build your own basket"
      className="relative min-h-[214px] overflow-hidden rounded-xl border-[3px] border-white bg-[#eef6ff] px-6 py-7 shadow-sm"
    >
      <img
        src="/baskets/themes/1.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full object-cover object-center"
        style={THEME_ART_TREATMENT}
      />
      <h2 className="relative max-w-[230px] text-[20px] leading-tight font-medium text-ds-ink">
        Build your own basket
      </h2>
      <p className="relative mt-2 max-w-[215px] text-[13px] leading-relaxed text-ds-muted">
        Pick your stocks. Set your weights. Your strategy, your way.
      </p>
      <Button
        variant="primary"
        onClick={props.signedIn ? props.onCompose : props.onSignIn}
        className="relative mt-5"
      >
        {props.signedIn ? "Create a basket" : "Sign in to create"}
      </Button>
    </section>

    <RailList label="Your baskets" meta="On Glider">
      <BasketList {...props} />
    </RailList>

    <OperationList
      portfolios={props.portfolios}
      templates={props.templates}
      instruments={props.instruments}
    />

    <RailCard label="How baskets work">
      <RailHead title="How baskets work" />
      <ol className="mt-5 space-y-5">
        {steps.map(([title, body], index) => (
          <li key={title} className="grid grid-cols-[30px_minmax(0,1fr)] gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-ds-panel text-[12px] font-medium text-ds-ink">
              {index + 1}
            </span>
            <span className="pt-0.5">
              <span className="block text-[14px] font-medium text-ds-ink">{title}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ds-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <a
        href="https://glider.fi"
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-ds-link hover:opacity-80"
      >
        Learn about Glider <ArrowRight className="size-3.5" />
      </a>
    </RailCard>
  </aside>
);
