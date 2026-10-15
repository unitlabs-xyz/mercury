import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DESCRIPTION_MAX, NAME_MAX, TOTAL_BPS, type DraftProblem } from "@mercury/core";
import { shelfOf, weightLabel } from "@mercury/view";
import type { Basket, PickableBasketAsset } from "@mercury/types";
import { useBasketAssets, useBaskets, useCreateBasket, useUpdateBasket } from "../../api/baskets";
import { ApiError } from "../../api/client";
import { priceInstrument, useHistories, useInstruments } from "../../market/hooks";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import { GlideRows, InfoTip, SearchField, SegmentMeter } from "../../ui/ds";
import { STOCK_ROW, StockRowBody } from "../invest/Rail";
import { Skeleton } from "../portfolio/ui";
import { AssetIcon } from "./AssetIcon";
import { ASSET_DRAG, Weights } from "./Weights";
import { EMPTY, added, asDraft, distributed, from, problem, remaining } from "./composition";

/** What stops the create button, said on the rule beside it. */
const BLOCKED: Record<DraftProblem, string> = {
  name_required: "Name your basket",
  name_too_long: "That name is too long",
  no_assets: "Add a stock",
  too_many_assets: "A basket holds at most 50 stocks",
  duplicate_asset: "Each stock once only",
  unknown_asset: "One of those cannot be held in a basket",
  weights_must_total_10000: "Weights must add up to 100%",
};

/* Both reads are batched into one call apiece, so the cost of a longer list
   is the rows themselves — and six left most of the shelf empty. */
const MATCHES = 10;

/**
 * The one authoring surface, for a basket being written and one being changed.
 *
 * A second form for editing would be a second copy of the same rules, and the
 * composer and the API have already drifted apart once over exactly that.
 */
export const Compose = ({
  open,
  onClose,
  basket,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent writes a new basket; present changes this one. */
  basket?: Basket | undefined;
}) => {
  const navigate = useNavigate();
  const [composition, setComposition] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [dropping, setDropping] = useState(false);
  const catalogue = useBasketAssets(open);
  const create = useCreateBasket();
  /* Only ever fired with a basket in hand; the slug is a hook's argument, and
     hooks cannot be called one time in three. */
  const update = useUpdateBasket(basket?.slug ?? "");
  const saving = basket ? update : create;

  /* Seeded once per opening. The catalogue refetches on its own, and re-seeding
     on that would throw away whatever had been changed since. State rather than
     a ref because the list has to know it is waiting, not say there is nothing. */
  const [seeded, setSeeded] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSeeded(null);
      return;
    }
    if (basket === undefined || catalogue.data === undefined || seeded === basket.slug) return;
    setComposition(from(basket, catalogue.data));
    setSeeded(basket.slug);
  }, [open, basket, catalogue.data, seeded]);
  const awaitingSeed = basket !== undefined && seeded !== basket.slug;

  const holdable = useMemo(
    () => new Set((catalogue.data ?? []).map((asset) => asset.assetId)),
    [catalogue.data],
  );
  const picked = new Set(composition.picks.map((pick) => pick.assetId));
  /* Each match costs a price and a history read, so wait for the typing to settle. */
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  /*
   * An empty search is the first thing anybody sees, so it offers the stocks
   * curated strategies hold most. Counted from the shelf already in cache
   * rather than a popularity endpoint nobody else would use.
   */
  const shelf = useBaskets();
  const popular = useMemo(() => {
    const seen = new Map<string, number>();
    for (const item of shelfOf(shelf.data ?? []))
      for (const asset of item.allocations) seen.set(asset.ticker, (seen.get(asset.ticker) ?? 0) + 1);
    const byTicker = new Map((catalogue.data ?? []).map((asset) => [asset.ticker, asset]));
    return [...seen.entries()]
      .sort(([aTicker, a], [bTicker, b]) => b - a || aTicker.localeCompare(bTicker))
      .flatMap(([ticker]) => {
        const asset = byTicker.get(ticker);
        return asset ? [asset] : [];
      });
  }, [shelf.data, catalogue.data]);

  const matches =
    term === ""
      ? popular.filter((asset) => !picked.has(asset.assetId)).slice(0, MATCHES)
      : (catalogue.data ?? [])
          .filter(
            (asset) =>
              !picked.has(asset.assetId) &&
              (asset.ticker.toLowerCase().startsWith(term) || asset.name.toLowerCase().includes(term)),
          )
          .slice(0, MATCHES);

  /* The picker shows what Invest shows — name, price, today, a sparkline — so
     the catalogue row is married to the market read for the few on screen. */
  const found = useInstruments(matches.map((asset) => asset.ticker));
  const foundHistory = useHistories(
    matches.map((asset) => asset.ticker),
    "1D",
  );
  const foundByTicker = useMemo(
    () => new Map((found.data ?? []).map((item) => [item.ticker, item])),
    [found.data],
  );
  const rowFor = (ticker: string) => {
    const instrument = foundByTicker.get(ticker);
    if (!instrument) return null;
    const priced = priceInstrument(instrument, undefined);
    const history = foundHistory.data?.get(ticker) ?? null;
    return {
      ...priced,
      change: priced.todayPct ?? 0,
      spark: history === null ? null : history.points.map((point) => point.price),
      owned: false,
      inBasket: false,
      saved: false,
    };
  };

  const instruments = useInstruments(composition.picks.map((pick) => pick.ticker));
  const byTicker = useMemo(
    () => new Map((instruments.data ?? []).map((item) => [item.ticker, item])),
    [instruments.data],
  );

  const slack = remaining(composition);
  const held = composition.picks.filter((pick) => pick.locked).length;
  const free = composition.picks.length - held;
  const blocked = problem(composition, holdable);
  /* Over 100% stays pinned at full: the bar cannot run past its end, so the
     colour is what says so. Both are the meter's own, as borrowing draws it. */
  const over = slack < 0;
  const used = over ? "var(--color-ds-meter-danger)" : "var(--color-ds-meter-used)";
  const room = over ? "var(--color-ds-meter-danger)" : "var(--color-ds-meter-room)";

  const close = () => {
    setComposition(EMPTY);
    setQuery("");
    saving.reset();
    onClose();
  };

  const add = (asset: PickableBasketAsset) => {
    setComposition(added(composition, asset));
    setQuery("");
  };

  const submit = async () => {
    const draft = asDraft(composition);
    if (basket) {
      /* Already on the basket's page: the list invalidation this does covers
         the detail read too, so there is nowhere to send anybody. */
      await update.mutateAsync(draft);
      close();
      return;
    }
    const made = await create.mutateAsync(draft);
    close();
    navigate(`/baskets/${encodeURIComponent(made.slug)}`);
  };

  return (
    <SidePanel open={open} onClose={close} labelledBy="compose-heading" width="max-w-[960px]">
      {/* One heading, not two: the task is the eyebrow over it, and the name —
          the one thing only the author can give — is the title itself. */}
      <PanelHeader
        id="compose-heading"
        title={
          <span className="text-[11px] leading-none tracking-[0.12em] text-ds-muted uppercase">
            {basket ? "Edit basket" : "Build a basket"}
          </span>
        }
        onClose={close}
      />
      {/* One rule under both, which is also the header's own separator — so the
          focus state is that line going brand, rather than a ring or a fill
          arriving around a field the width of the panel. */}
      <div className="mx-6 mt-3 shrink-0 border-b-2 border-ds-divider pb-3 transition-colors focus-within:border-brand">
        <input
          value={composition.name}
          onChange={(event) => setComposition({ ...composition, name: event.target.value })}
          placeholder="Name your basket"
          maxLength={NAME_MAX}
          aria-label="Basket name"
          className="w-full bg-transparent text-[26px] leading-tight font-medium text-ds-ink outline-none placeholder:font-normal placeholder:text-ds-muted/60"
        />
        {/* Optional, and said so: the catalogue shows it under the name, and a
            basket with nothing written there reads fine without it. */}
        <input
          value={composition.description}
          onChange={(event) => setComposition({ ...composition, description: event.target.value })}
          placeholder="What it is for — optional"
          maxLength={DESCRIPTION_MAX}
          aria-label="Basket description"
          className="mt-1.5 w-full bg-transparent text-[14px] leading-tight text-ds-muted outline-none placeholder:text-ds-muted/60"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 px-6 pt-4 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        {/* The basket being written: a white sheet, against the grey shelf it is drawn from. */}
        <section
          onDragOver={(event) => {
            /* A reorder bubbles through here too; leaving its effect alone
               is what lets the row's own drop go ahead. */
            if (!event.dataTransfer.types.includes(ASSET_DRAG)) return;
            event.dataTransfer.dropEffect = "copy";
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropping(false);
            const id = event.dataTransfer.getData(ASSET_DRAG);
            const asset = (catalogue.data ?? []).find((item) => item.assetId === id);
            if (asset) setComposition(added(composition, asset));
          }}
          className={`group/list flex min-h-0 flex-col overflow-hidden rounded-xl transition-shadow ${
            dropping ? "shadow-[0_0_0_2px_var(--color-ds-link)]" : "shadow-[0_0_0_1px_rgb(0_0_0/0.07)]"
          }`}
        >
          <header className="shrink-0 px-4 pt-3.5 pb-2">
            <div className="flex items-center justify-between gap-3 text-[12px] leading-none">
              <span className="text-ds-muted">Target weights</span>
              {composition.picks.length > 1 && (
                <button
                  type="button"
                  onClick={() => setComposition(distributed(composition))}
                  disabled={free === 0}
                  className="font-medium text-ds-link hover:underline disabled:text-ds-muted disabled:no-underline"
                  title={free === 0 ? "Every weight is held" : undefined}
                >
                  Distribute evenly
                </button>
              )}
            </div>
            {/* A cluster rather than a ribbon: across the whole card the meter's
                bars read as a barcode, and the figures drift away from it. */}
            <div className="mt-3 flex items-center gap-3 text-[11px] leading-none text-ds-muted">
              <span className="shrink-0">
                {composition.picks.length} {composition.picks.length === 1 ? "stock" : "stocks"}
                {held > 0 && ` · ${held} held`}
              </span>
              <div className="w-[200px] shrink-0">
                <SegmentMeter
                  label={`Allocated ${weightLabel(TOTAL_BPS - slack)} of 100%`}
                  value={Math.min(1, Math.max(0, (TOTAL_BPS - slack) / TOTAL_BPS))}
                  zones={[{ to: 1, color: room, used }]}
                />
              </div>
              <span className={`shrink-0 ${over ? "font-medium text-ds-down" : ""}`}>
                {slack === 0
                  ? "Fully allocated"
                  : over
                    ? `${weightLabel(-slack)} over`
                    : `${weightLabel(slack)} to allocate`}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            {awaitingSeed ? (
              <div className="flex flex-col gap-1 p-1">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-13 rounded-md" />
                ))}
              </div>
            ) : composition.picks.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1.5 px-8 text-center">
                <p className="text-[14px] leading-none font-medium text-ds-ink">No stocks yet</p>
                <p className="max-w-[260px] text-[13px] leading-relaxed text-ds-muted">
                  Pick one on the right, or drag it across. They share the basket evenly, and every weight
                  here is yours to change.
                </p>
              </div>
            ) : (
              <Weights composition={composition} instruments={byTicker} onChange={setComposition} />
            )}
          </div>
        </section>

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Add a stock by ticker or name"
            label="Search stocks"
            className="h-11 shrink-0 sm:w-full"
          />
          {/* Held at the sheet's full height whatever it holds, so the shelf
              reads as the other half of the pair rather than a stub above it. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl bg-ds-panel p-1">
            {matches.length === 0 ? (
              term !== "" && (
                <p className="px-3 py-4 text-[13px] text-ds-muted">
                  No stock matches “{query.trim()}”. Baskets hold Ondo equities on Solana.
                </p>
              )
            ) : (
              <>
                {term === "" && (
                  <p className="px-3 pt-2 pb-1 text-[12px] text-ds-muted">Most used in strategies</p>
                )}
                <GlideRows as="ul">
                  {matches.map((asset) => {
                    const row = rowFor(asset.ticker);
                    return (
                      <li key={asset.assetId} data-row className="relative">
                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(ASSET_DRAG, asset.assetId);
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => add(asset)}
                          aria-label={`Add ${asset.ticker}`}
                          className={`${STOCK_ROW} w-full cursor-grab text-left active:cursor-grabbing`}
                        >
                          {row ? (
                            <StockRowBody
                              r={row}
                              mark={
                                <AssetIcon
                                  asset={asset}
                                  source={undefined}
                                  className="size-8 shrink-0 rounded-full bg-white object-contain"
                                />
                              }
                            />
                          ) : (
                            <span className="flex min-w-0 items-center gap-3">
                              <AssetIcon
                                asset={asset}
                                source={undefined}
                                className="size-8 shrink-0 rounded-full bg-white object-contain"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                                  {asset.name}
                                </span>
                                <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                                  {asset.ticker}
                                </span>
                              </span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </GlideRows>
              </>
            )}
          </div>
        </div>
      </div>

      {/* What the basket will be, and what to do about it, on one rule. The
          button keeps its name; what is missing is said beside it, because a
          sentence set in a button makes the widest, heaviest thing on the sheet
          the one control nobody can press. */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ds-divider px-6 py-4">
        {saving.isError ? (
          /* The API's own refusal where it has one: it names what it would not
             take, which "try again" never does. */
          <p role="alert" className="text-[13px] text-ds-down">
            {saving.error instanceof ApiError ? saving.error.message : "That could not be saved. Try again."}
          </p>
        ) : blocked ? (
          <p id="compose-blocked" className="text-[13px] text-ds-muted">
            {BLOCKED[blocked]}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] text-ds-muted">
            Rebalanced daily · Private to you
            <InfoTip label="About rebalancing and visibility" align="start">
              Glider buys toward these weights once a day. A basket you write is never shown to anybody else.
            </InfoTip>
          </p>
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button variant="secondary" size="lg" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={saving.isPending}
            disabled={blocked !== null}
            aria-describedby={blocked ? "compose-blocked" : undefined}
            onClick={() => void submit()}
          >
            {basket ? "Save changes" : "Create a basket"}
          </Button>
        </div>
      </footer>
    </SidePanel>
  );
};
