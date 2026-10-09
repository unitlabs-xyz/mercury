import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ManagedBasketTag, ManagedBasketTemplate } from "@mercury/types";
import { Link } from "react-router-dom";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { basketEnrollmentEnabled, useBasketTemplates, useOwnedBasketPortfolios } from "../api/baskets";
import { useInstruments, type Instrument } from "../market/hooks";
import { GlideTable, SearchField } from "../ui/ds";
import { ArrowRight } from "../ui/icons";
import { AppShell } from "./AppShell";
import { PriceError } from "./LiveStatus";
import { Skeleton } from "./portfolio/ui";
import { AssetIcon } from "./baskets/AssetIcon";
import {
  curatedShelves,
  discoveryLogoTickers,
  displayBasketName,
  searchStrategies,
  THEME_ART_TREATMENT,
  visibleStrategies,
} from "./baskets/catalog";
import { BasketsRail } from "./baskets/rail";

type Instruments = ReadonlyMap<string, Instrument>;
const EMPTY_TEMPLATES: readonly ManagedBasketTemplate[] = [];
const STRATEGY_COLS = "grid-cols-[minmax(220px,1.5fr)_minmax(165px,1fr)_56px_90px_85px_20px] gap-x-3";
const Arrow = ({ left = false }: { left?: boolean }) => (
  <ArrowRight className={`size-4 ${left ? "rotate-180" : ""}`} aria-hidden />
);

const Heading = ({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
    <div>
      <h2 className="text-[21px] leading-tight font-medium text-ds-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-ds-muted">{subtitle}</p>
    </div>
    {action}
  </div>
);

const TextAction = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-600 hover:text-blue-800"
  >
    {children}
    <Arrow />
  </button>
);

/** Keep the discovery page's three sections in place during its first catalog read. */
const DiscoveryLoading = () => (
  <div aria-label="Loading basket strategies" className="space-y-8 sm:space-y-9">
    <section>
      <Skeleton className="h-6 w-40 !bg-white" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full !bg-white" />
      <div className="mt-4 flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="w-[calc(50%-6px)] min-w-[210px] shrink-0 rounded-lg bg-white p-1 lg:w-[calc(25%-9px)]"
          >
            <Skeleton className="h-[137px] w-full rounded-md" />
          </div>
        ))}
      </div>
    </section>
    <section>
      <Skeleton className="h-6 w-44 !bg-white" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full !bg-white" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-lg bg-white p-1">
            <Skeleton className="h-[197px] w-full rounded-md" />
          </div>
        ))}
      </div>
    </section>
    <section className="rounded-xl bg-white p-1">
      <div className="px-5 pt-4 pb-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-1 rounded-lg bg-ds-panel p-1">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-[64px] w-full rounded-md" />
        ))}
      </div>
    </section>
  </div>
);

const Holdings = ({
  template,
  instruments,
  limit = 5,
}: {
  template: ManagedBasketTemplate;
  instruments: Instruments;
  limit?: number;
}) => {
  const assets = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps);
  return (
    <div
      role="img"
      className="flex min-w-0 items-center -space-x-2"
      aria-label={`Top holdings: ${assets
        .slice(0, limit)
        .map((a) => a.ticker)
        .join(", ")}`}
    >
      {assets.slice(0, limit).map((asset, index) => (
        <span key={asset.ticker} className="relative shrink-0" style={{ zIndex: limit - index }}>
          <AssetIcon
            asset={asset}
            source={instruments.get(asset.ticker)}
            className="size-8 rounded-full bg-white object-contain ring-2 ring-ds-panel"
          />
        </span>
      ))}
      {assets.length > limit && (
        <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-white pl-1 text-[11px] text-ds-muted ring-2 ring-ds-panel">
          +{assets.length - limit}
        </span>
      )}
    </div>
  );
};

const ThemeShelf = ({
  shelves,
  select,
}: {
  shelves: ReturnType<typeof curatedShelves>["themes"];
  select: (tag: ManagedBasketTag) => void;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  return (
    <section id="themes" aria-label="Explore by theme" className="scroll-mt-24">
      <Heading
        title="Explore by theme"
        subtitle="Find strategies that match your interests and outlook."
        action={
          <TextAction onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer themes" : "See all themes"}
          </TextAction>
        }
      />
      <div className="relative">
        {!expanded && (
          <button
            type="button"
            onClick={() => scroller.current?.scrollBy({ left: -280, behavior: "smooth" })}
            aria-label="Previous themes"
            className="absolute top-1/2 -left-4 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white text-ds-ink shadow-sm hover:bg-ds-panel"
          >
            <Arrow left />
          </button>
        )}
        <div
          ref={scroller}
          className={
            expanded
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              : "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          }
        >
          {shelves.map((theme) => (
            <button
              key={theme.tag}
              type="button"
              onClick={() => select(theme.tag)}
              className={`relative min-h-[145px] overflow-hidden rounded-lg border border-white bg-white p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${expanded ? "" : "w-[calc(50%-6px)] min-w-[210px] shrink-0 snap-start lg:w-[calc(25%-9px)]"}`}
            >
              <img
                src={theme.image}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 size-full object-cover object-center"
                style={THEME_ART_TREATMENT}
              />
              <span className="relative block text-[15px] font-medium text-ds-ink">{theme.title}</span>
              <span className="relative mt-1.5 block max-w-[140px] text-[12px] leading-snug text-slate-500">
                {theme.description}
              </span>
              <span className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 text-[12px] font-medium text-ds-ink">
                {theme.count} {theme.count === 1 ? "strategy" : "strategies"}
                <Arrow />
              </span>
            </button>
          ))}
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => scroller.current?.scrollBy({ left: 280, behavior: "smooth" })}
            aria-label="Next themes"
            className="absolute top-1/2 -right-4 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white text-ds-ink shadow-sm hover:bg-ds-panel"
          >
            <Arrow />
          </button>
        )}
      </div>
    </section>
  );
};

const ProsShelf = ({
  templates,
  instruments,
  showAll,
}: {
  templates: ReturnType<typeof curatedShelves>["pros"];
  instruments: Instruments;
  showAll: () => void;
}) => (
  <section id="pros" aria-label="Invest like the pros" className="scroll-mt-24">
    <Heading
      title="Invest like the pros"
      subtitle="Investor-inspired Solana adaptations, not copies of their holdings."
      action={<TextAction onClick={showAll}>See all strategies</TextAction>}
    />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {templates.map((template) => (
        <Link
          key={template.slug}
          to={`/baskets/${template.slug}`}
          className="group overflow-hidden rounded-lg bg-white shadow-sm transition-transform hover:-translate-y-0.5"
          aria-label={`View ${displayBasketName(template.name)} strategy`}
        >
          <img
            src={template.image}
            alt=""
            loading="lazy"
            className="aspect-[1.25/1] w-full object-cover object-top"
          />
          <div className="px-4 pt-2.5 pb-3.5">
            <p className="text-[11px] text-slate-500">Top holdings · Daily variant</p>
            <div className="mt-2">
              <Holdings template={template} instruments={instruments} limit={4} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  </section>
);

const StrategyTable = ({
  templates,
  instruments,
  selected,
  clear,
  showAll,
  setShowAll,
  query,
  setQuery,
}: {
  templates: readonly ManagedBasketTemplate[];
  instruments: Instruments;
  selected: ManagedBasketTag | null;
  clear: () => void;
  showAll: boolean;
  setShowAll: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
}) => {
  const searching = query.trim() !== "";
  const title = searching
    ? "Search results"
    : selected
      ? `${selected.replace("theme:", "").replace(/\b\w/g, (letter) => letter.toUpperCase())} strategies`
      : showAll
        ? "All strategies"
        : "Featured strategies";
  return (
    <section
      id="strategies"
      aria-label="Basket strategies"
      className="min-w-0 scroll-mt-24 rounded-xl bg-white p-1"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[16px] font-medium text-ds-ink">{title}</h2>
          <p className="mt-1 text-[12px] text-ds-muted">
            {searching
              ? `${templates.length} ${templates.length === 1 ? "strategy" : "strategies"} matching “${query.trim()}”.`
              : "Explore curated Glider strategies on Solana."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by strategy, company or ticker"
            label="Search strategies"
          />
          <TextAction
            onClick={() => {
              if (selected) {
                clear();
                setShowAll(true);
              } else setShowAll(!showAll);
            }}
          >
            {selected || !showAll ? "See all strategies" : "Show featured"}
          </TextAction>
        </div>
      </header>
      <div className="mt-3 overflow-x-auto rounded-lg bg-ds-panel p-1">
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ds-muted">
            {searching ? `No strategy matches “${query.trim()}”.` : "No strategies in this theme yet."}
          </p>
        ) : (
          <GlideTable
            columns={STRATEGY_COLS}
            minWidth="min-w-[760px]"
            headings={
              <>
                <span>Name</span>
                <span>Top holdings</span>
                <span className="text-right">Assets</span>
                <span className="text-right">Rebalance</span>
                <span className="text-right">Availability</span>
                <span />
              </>
            }
          >
            {templates.map((template) => (
              <li key={template.slug} data-row className="relative">
                <Link
                  to={`/baskets/${template.slug}`}
                  className={`relative grid min-h-[64px] ${STRATEGY_COLS} items-center rounded-md px-4 text-[13px]`}
                  aria-label={`View ${displayBasketName(template.name)} strategy`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ds-ink">
                      {displayBasketName(template.name)}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-ds-muted">
                      {template.description}
                    </span>
                  </span>
                  <Holdings template={template} instruments={instruments} />
                  <span className="text-right text-ds-muted">{template.allocations.length}</span>
                  <span className="text-right text-ds-muted">Daily</span>
                  <span className="text-right text-ds-muted">
                    {template.status === "enabled"
                      ? "Available"
                      : template.status === "candidate"
                        ? "Enrollment pilot"
                        : "Preview"}
                  </span>
                  <Arrow />
                </Link>
              </li>
            ))}
          </GlideTable>
        )}
      </div>
    </section>
  );
};

export const Baskets = () => {
  const { ready, authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const catalog = useBasketTemplates();
  const owned = useOwnedBasketPortfolios();
  const [selected, setSelected] = useState<ManagedBasketTag | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  /* Typing filters a local catalog, so a short settle is enough to keep it from thrashing. */
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const searching = term !== "";
  const templates = catalog.data ?? EMPTY_TEMPLATES;
  const shelves = useMemo(() => curatedShelves(templates), [templates]);
  const tickers = useMemo(() => {
    /* A search reads every holding's company name, so it needs the whole catalog's instruments. */
    const discovery = searching
      ? templates.flatMap((template) => template.allocations.map((asset) => asset.ticker))
      : discoveryLogoTickers(templates, selected, showAll);
    const ownedSlugs = new Set((owned.data ?? []).map((portfolio) => portfolio.slug));
    const ownedLogos = templates
      .filter((template) => ownedSlugs.has(template.slug))
      .flatMap((template) => [...template.allocations].sort((a, b) => b.weightBps - a.weightBps).slice(0, 2))
      .map((asset) => asset.ticker);
    return [...new Set([...discovery, ...ownedLogos])];
  }, [templates, selected, showAll, owned.data, searching]);
  const instruments = useInstruments(tickers);
  const instrumentsByTicker = useMemo(
    () => new Map((instruments.data ?? []).map((item) => [item.ticker, item])),
    [instruments.data],
  );
  const companyNames = useMemo(
    () => new Map([...instrumentsByTicker].map(([ticker, item]) => [ticker, item.name])),
    [instrumentsByTicker],
  );
  const visible = useMemo(
    () =>
      searching
        ? searchStrategies(templates, term, companyNames)
        : visibleStrategies(templates, selected, showAll),
    [templates, selected, showAll, searching, term, companyNames],
  );
  const walletReady = Boolean(wallets[0]?.address);
  const signedIn = basketEnrollmentEnabled(ready, authenticated, identityToken !== null) && walletReady;
  const seeAll = () => {
    setSelected(null);
    setShowAll(true);
    document.getElementById("strategies")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <AppShell current="baskets" title="Baskets" quiet>
      <div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
        <div className="min-w-0 space-y-8 pb-6 sm:space-y-9">
          {catalog.isPending && !catalog.data ? (
            <DiscoveryLoading />
          ) : catalog.isError && !catalog.data ? (
            <PriceError
              message="Strategies are temporarily unavailable."
              onRetry={() => void catalog.refetch()}
            />
          ) : (
            <>
              {catalog.isError && (
                <PriceError
                  message="Could not refresh strategies. Showing the last available catalog."
                  onRetry={() => void catalog.refetch()}
                />
              )}
              <ThemeShelf
                shelves={shelves.themes}
                select={(tag) => {
                  setSelected(tag);
                  document.getElementById("strategies")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
              <ProsShelf templates={shelves.pros} instruments={instrumentsByTicker} showAll={seeAll} />
              <StrategyTable
                templates={visible}
                instruments={instrumentsByTicker}
                selected={selected}
                clear={() => setSelected(null)}
                showAll={showAll}
                setShowAll={setShowAll}
                query={query}
                setQuery={setQuery}
              />
            </>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 pt-4 text-[11px] text-slate-500">
            <p>
              Strategies are provided by Glider. Assets stay in your own smart account. Past or modeled
              performance does not guarantee future results.
            </p>
            <a
              href="https://glider.fi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap text-blue-600 hover:text-blue-800"
            >
              Learn about Glider
              <Arrow />
            </a>
          </footer>
        </div>
        <BasketsRail
          onExplore={seeAll}
          onSignIn={() => login()}
          onRetry={() => owned.refetch()}
          signedIn={signedIn}
          loading={!ready || (authenticated && walletReady && (identityToken === null || owned.isPending))}
          error={owned.isError}
          portfolios={owned.data ?? []}
          templates={templates}
          instruments={instrumentsByTicker}
        />
      </div>
    </AppShell>
  );
};
