import { useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import type { ManagedBasketOperation, ManagedBasketPortfolioSnapshot } from "@mercury/types";
import {
  BASKET_RANGES,
  USDC_ASSET_ID,
  allocationRows,
  basketStatusLabel,
  byWeight,
  countdownText,
  displayBasketName,
  fundingDestination,
  modeledRange,
  modeledRanges,
  operationActive,
  rebalanceOutcome,
  returnLabel,
  usd,
  weightLabel,
  type BasketRange,
} from "@mercury/view";
import { useSignedIn } from "../../src/api";
import {
  useBasketActivity,
  useBasketEnrollment,
  useBasketInsights,
  useBasketOperation,
  useBasketPortfolio,
  useBasketTemplate,
  useTrackedOperation,
} from "../../src/baskets/api";
import { AssetStack, Fact, useHoldingInstruments } from "../../src/baskets/ui";
import {
  Button,
  Chip,
  DotChart,
  Icon,
  IconButton,
  MoveChip,
  PressableScale,
  Skeleton,
  StatusChip,
  StockLogo,
  Text,
  useBottomGap,
} from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

const TILE_TONES = ["#E9F2ED", "#E9EDF5", "#F4EEE7", "#EEEAF4", "#E7F1F1", "#F3F1E9", "#EFEFEC"];

const balance = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—";
};

/* Glider's state in words, naming the one failure that may not be one. */
const stateLabel = (state: ManagedBasketOperation["state"] | undefined, error: string | null = null) =>
  state ? rebalanceOutcome(state, error).label : "Checking…";

/**
 * One Glider strategy, as the web's page: what it is and how it has modeled,
 * then — once you are in — your own smart account, its schedule and its
 * history; then what it holds. Every write opens the system sheet (see
 * `app/basket-sheet.tsx`) so the amount, the destination and the signature are
 * reviewed in one place.
 */
export default function Basket() {
  const { slug: raw } = useLocalSearchParams<{ slug: string }>();
  const slug = raw ?? "";
  const router = useRouter();
  const bottom = useBottomGap();
  const qc = useQueryClient();
  const signedIn = useSignedIn();
  const [range, setRange] = useState<BasketRange>("1Y");
  const [allAssets, setAllAssets] = useState(false);
  const [risksOpen, setRisksOpen] = useState(false);

  const result = useBasketTemplate(slug);
  const insights = useBasketInsights(slug);
  const enrollment = useBasketEnrollment(slug);
  const enrolled = signedIn && Boolean(enrollment.data);
  const portfolio = useBasketPortfolio(slug, enrolled);
  const activity = useBasketActivity(slug, enrolled);
  const template = result.data;
  const instruments = useHoldingInstruments(template === undefined ? [] : [template], 100);

  const account = enrolled ? (portfolio.data ?? null) : null;
  const tracked = useTrackedOperation(account?.portfolioId);
  const operation = useBasketOperation(slug, tracked?.operationId ?? null);
  const opState = operation.data?.state;
  const busy = tracked !== undefined && operationActive(opState);

  /* A settled operation moved money: read the account again, and the cash it may have returned. */
  useEffect(() => {
    if (opState !== "completed") return;
    for (const key of [
      "basket-portfolio",
      "basket-portfolios",
      "basket-activity",
      "portfolio",
      "money",
      "activity",
    ])
      void qc.invalidateQueries({ queryKey: ["api", key] });
  }, [opState, qc]);

  const sheet = (kind: "enroll" | "fund" | "rebalance" | "exit") =>
    router.push({ pathname: "/basket-sheet", params: { slug, kind } });

  if (template === undefined) {
    return (
      <Shell onBack={() => router.back()} title="">
        {result.isPending ? (
          <View style={[s.card, s.gap]}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="90%" height={14} />
            <Skeleton width="100%" height={180} />
          </View>
        ) : (
          <View style={[s.card, s.blank]}>
            <RNText style={s.blankTitle}>This strategy is unavailable right now</RNText>
            <Button size="md" variant="secondary" label="Try again" onPress={() => void result.refetch()} />
          </View>
        )}
      </Shell>
    );
  }

  const name = displayBasketName(template.name);
  /* Only the ranges this strategy has history for; a pick it lacks falls back to its longest. */
  const ranges = modeledRanges(template.performance, BASKET_RANGES);
  const shown = ranges.includes(range) ? range : (ranges.at(-1) ?? range);
  const { series, change } = modeledRange(template.performance, shown);
  const allocations = byWeight(template.allocations);
  const year = template.performance?.windows.find((w) => w.window === "12m");
  const usdc = account?.assets
    .filter((a) => a.assetId === USDC_ASSET_ID)
    .reduce((sum, a) => sum + Number(a.balance), 0);
  const held = [...(account?.assets ?? [])]
    .filter((a) => Number(a.balance) > 0)
    .sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd));
  const checking = signedIn && enrollment.isPending;
  const address = enrollment.data ? fundingDestination(enrollment.data)?.split(":").at(-1) : undefined;

  return (
    <Shell onBack={() => router.back()} title={name} bottom={bottom}>
      {/* ── What it is, and how it has modeled ──────────────────────────── */}
      <View style={s.card}>
        <View style={s.pad}>
          <View style={s.titleRow}>
            <View style={s.fill}>
              <Text variant="title" style={s.title}>
                {name}
              </Text>
              <View style={s.chips}>
                <StatusChip tone={template.status === "enabled" ? "up" : "neutral"}>
                  {basketStatusLabel(template.status)}
                </StatusChip>
                <RNText style={s.meta}>Glider strategy · Solana</RNText>
              </View>
            </View>
          </View>
          <AssetStack template={template} instruments={instruments} limit={6} size={36} />
          <RNText style={s.body}>{template.description}</RNText>

          <View style={s.returnRow}>
            <View>
              <RNText style={s.meta}>
                Modeled {shown === "All" ? "return since start" : `${shown} return`}
              </RNText>
              <RNText
                style={[
                  s.bigReturn,
                  change !== null && { color: Number(change) < 0 ? color.fall : color.up },
                ]}
              >
                {change === null ? "Unavailable" : returnLabel(change)}
              </RNText>
            </View>
            {year !== undefined && shown !== "1Y" && (
              <RNText style={s.meta}>1Y {returnLabel(year.percentChange)}</RNText>
            )}
          </View>
          <View style={s.chips}>
            {ranges.map((key) => (
              <Chip key={key} label={key} selected={shown === key} onPress={() => setRange(key)} />
            ))}
          </View>
          {series.length > 1 ? (
            <DotChart values={series.map((p) => p.value)} height={180} format={returnLabel} />
          ) : (
            <View style={s.chartEmpty}>
              <RNText style={s.meta}>Modeled history is unavailable for this range.</RNText>
            </View>
          )}
        </View>
        <View style={s.disclaim}>
          <RNText style={s.small}>
            Glider model
            {template.performance
              ? ` · as of ${new Date(template.performance.asOf).toLocaleDateString("en-US", { dateStyle: "medium" })}`
              : ""}
            . Target-allocation history, not a live return. Past modeled performance does not predict future
            results.
          </RNText>
        </View>
      </View>

      {/* ── The way in, or your position ───────────────────────────────── */}
      {!enrolled ? (
        <View style={s.card}>
          <View style={s.pad}>
            <View style={s.cardHead}>
              <RNText style={s.cardTitle}>Invest in {name}</RNText>
              <RNText style={s.meta}>{checking ? "Checking" : "Solana"}</RNText>
            </View>
            <View style={s.panel}>
              {checking ? (
                <View style={s.gap}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="90%" height={12} />
                </View>
              ) : (
                <>
                  <RNText style={s.panelTitle}>
                    {signedIn ? "Your own portfolio, not a basket token" : "Sign in to enroll"}
                  </RNText>
                  <RNText style={s.small}>
                    {enrollment.isError
                      ? "We couldn't check whether you're enrolled. Your holdings haven't been checked yet."
                      : "Enrolling creates your own Glider smart account. No USDC is invested yet; you fund it as a separate step."}
                  </RNText>
                </>
              )}
            </View>
            <Fact k="Target assets" v={String(allocations.length)} />
            <Fact k="Funding" v="USDC on Solana, after enrolling" />
            <Button
              label={
                enrollment.isError
                  ? "Retry portfolio check"
                  : template.status === "disabled"
                    ? "Not open for enrollment"
                    : "Review enrollment"
              }
              disabled={!signedIn || checking || (template.status === "disabled" && !enrollment.isError)}
              onPress={() => (enrollment.isError ? void enrollment.refetch() : sheet("enroll"))}
            />
          </View>
        </View>
      ) : (
        <Position
          account={account}
          loading={portfolio.isPending}
          failed={portfolio.isError}
          onRetry={() => void portfolio.refetch()}
          usdc={usdc}
          held={held}
          template={template}
          instruments={instruments}
          allAssets={allAssets}
          toggleAll={() => setAllAssets((v) => !v)}
          address={address}
          exitState={tracked?.kind === "exit" ? opState : undefined}
          exitMode={tracked?.kind === "exit" ? tracked.mode : undefined}
          exitError={tracked?.kind === "exit" ? (operation.data?.error ?? null) : null}
          busy={busy}
          onFund={() => sheet("fund")}
          onExit={() => sheet("exit")}
        />
      )}

      {/* ── Rebalancing ────────────────────────────────────────────────── */}
      {enrolled && (
        <View style={s.card}>
          <View style={s.pad}>
            <View style={s.cardHead}>
              <RNText style={s.cardTitle}>Rebalancing</RNText>
              <RNText style={s.meta}>
                {account?.schedule?.status === "paused"
                  ? "Paused"
                  : (account?.schedule?.frequency ?? "Daily")}
              </RNText>
            </View>
            <View style={s.panel}>
              {account === null ? (
                <RNText style={s.small}>
                  {portfolio.isPending
                    ? "Reading the schedule…"
                    : "Schedule unavailable while balances can't be read."}
                </RNText>
              ) : (
                <Countdown schedule={account.schedule} />
              )}
              {tracked?.kind === "rebalance" && (
                <View style={s.opLine}>
                  <RNText style={s.small}>Manual rebalance</RNText>
                  <RNText style={s.opState}>{stateLabel(opState, operation.data?.error ?? null)}</RNText>
                </View>
              )}
              {tracked?.kind === "rebalance" && opState !== undefined && operation.data?.error && (
                <RNText style={[s.small, { color: color.chipWarn }]}>
                  {rebalanceOutcome(opState, operation.data.error).detail}
                </RNText>
              )}
            </View>
            <Button
              variant="secondary"
              label={busy && tracked?.kind === "rebalance" ? "Rebalance in progress" : "Rebalance now"}
              disabled={account === null || template.status === "disabled" || busy}
              onPress={() => sheet("rebalance")}
            />
          </View>
        </View>
      )}

      {/* ── What it holds ──────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.pad}>
          <View style={s.cardHead}>
            <View style={s.fill}>
              <RNText style={s.cardTitle}>Strategy composition</RNText>
              <RNText style={s.small}>Target weights; holdings can drift between rebalances.</RNText>
            </View>
            <RNText style={s.meta}>{allocations.length} assets</RNText>
          </View>
        </View>
        <View style={s.list}>
          {allocations.map((a) => {
            const i = instruments.get(a.ticker);
            return (
              <View key={a.assetId} style={s.asset}>
                <StockLogo ticker={a.ticker} size={34} uri={i?.logoUrl ?? undefined} />
                <View style={s.fill}>
                  <RNText style={s.name} numberOfLines={1}>
                    {i?.name ?? a.ticker}
                  </RNText>
                  <RNText style={s.small}>
                    {a.ticker}
                    {i ? ` · ${usd(i.pricePerShare)}` : ""}
                  </RNText>
                </View>
                <View style={s.end}>
                  <RNText style={s.name}>{weightLabel(a.weightBps)}</RNText>
                  {i && <MoveChip value={Number(i.changePct24h)} soft />}
                </View>
              </View>
            );
          })}
        </View>
        <RNText style={[s.small, s.pad]}>
          Prices and daily moves describe the underlying companies, not the Solana tokens the strategy holds.
        </RNText>
      </View>

      {/* ── Where it invests ───────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.pad}>
          <RNText style={s.cardTitle}>Where it invests</RNText>
          {insights.isPending ? (
            <View style={s.chips}>
              <Skeleton width={110} height={28} />
              <Skeleton width={90} height={28} />
            </View>
          ) : insights.data?.allocation?.sectors.length ? (
            <View style={s.chips}>
              {insights.data.allocation.sectors.map((sector) => (
                <View key={sector.label} style={s.sector}>
                  <RNText style={s.small}>
                    {sector.label}{" "}
                    <RNText style={s.sectorWeight}>{Number(sector.weightPercent).toFixed(1)}%</RNText>
                  </RNText>
                </View>
              ))}
            </View>
          ) : (
            <RNText style={s.small}>Provider classification is unavailable.</RNText>
          )}
          <Mosaic allocations={allocations} />
          <View style={s.facts}>
            <Fact k="Diversified exposure" v={`${allocations.length} assets`} />
            <Fact k="Rebalancing" v="Daily" />
            <Fact k="Custody" v="Your smart account" />
            <Fact
              k="Integrator swap fee"
              v={
                insights.data?.integratorSwapFeeBps == null
                  ? "Not available"
                  : `${(insights.data.integratorSwapFeeBps / 100).toFixed(2)}%`
              }
            />
          </View>
        </View>
      </View>

      {/* ── Its history ────────────────────────────────────────────────── */}
      {enrolled && (
        <View style={s.card}>
          <View style={s.pad}>
            <RNText style={s.cardTitle}>Recent activity</RNText>
            {activity.isPending ? (
              <Skeleton width="100%" height={44} />
            ) : (activity.data ?? []).length === 0 ? (
              <RNText style={s.small}>
                {activity.isError
                  ? "Recent activity is unavailable."
                  : "Enrollment, funding, rebalances and withdrawals appear here."}
              </RNText>
            ) : (
              (activity.data ?? []).slice(0, 6).map((a) => (
                <PressableScale
                  key={a.id}
                  style={s.event}
                  activeScale={1}
                  disabled={a.txSignature === null}
                  onPress={() =>
                    a.txSignature !== null && void Linking.openURL(`https://solscan.io/tx/${a.txSignature}`)
                  }
                >
                  <View style={s.fill}>
                    <RNText style={s.name} numberOfLines={1}>
                      {a.title}
                    </RNText>
                    <RNText style={s.small} numberOfLines={1}>
                      {a.subtitle}
                    </RNText>
                  </View>
                  <View style={s.end}>
                    {a.amountUsd !== null && <RNText style={s.name}>{usd(a.amountUsd)}</RNText>}
                    <RNText style={s.small}>
                      {new Date(a.occurredAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                    </RNText>
                  </View>
                </PressableScale>
              ))
            )}
          </View>
        </View>
      )}

      {/* ── The small print ────────────────────────────────────────────── */}
      <PressableScale style={[s.card, s.pad]} activeScale={1} onPress={() => setRisksOpen((v) => !v)}>
        <View style={s.cardHead}>
          <RNText style={s.cardTitle}>Risks and disclosures</RNText>
          <Icon name={risksOpen ? "chevronDown" : "chevronRight"} size={14} color={color.muted} />
        </View>
        {risksOpen && (
          <RNText style={s.body}>
            These are tokenized assets held in a Glider smart account you own, not shares in a pooled basket
            token. Prices, liquidity, swap costs and execution can differ from the modeled strategy. Funding
            with USDC does not buy the target assets straight away; USDC can sit uninvested until a rebalance
            runs.
          </RNText>
        )}
      </PressableScale>
    </Shell>
  );
}

const Shell = ({
  onBack,
  title,
  bottom = 0,
  children,
}: {
  onBack: () => void;
  title: string;
  bottom?: number;
  children: React.ReactNode;
}) => (
  <View style={s.root}>
    <SafeAreaView edges={["top"]} style={s.fill}>
      <View style={s.nav}>
        <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={onBack} />
        <RNText style={s.navTitle} numberOfLines={1}>
          {title}
        </RNText>
      </View>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottom + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  </View>
);

/** Your smart account: what it is worth, what is in it, and the way out. */
const Position = ({
  account,
  loading,
  failed,
  onRetry,
  usdc,
  held,
  template,
  instruments,
  allAssets,
  toggleAll,
  address,
  exitState,
  exitMode,
  exitError,
  busy,
  onFund,
  onExit,
}: {
  account: ManagedBasketPortfolioSnapshot | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  usdc: number | undefined;
  held: ManagedBasketPortfolioSnapshot["assets"];
  template: NonNullable<ReturnType<typeof useBasketTemplate>["data"]>;
  instruments: ReturnType<typeof useHoldingInstruments>;
  allAssets: boolean;
  toggleAll: () => void;
  address: string | undefined;
  exitState: ManagedBasketOperation["state"] | undefined;
  exitMode: string | undefined;
  exitError: string | null;
  busy: boolean;
  onFund: () => void;
  onExit: () => void;
}) => (
  <View style={s.card}>
    <View style={s.pad}>
      <View style={s.cardHead}>
        <RNText style={s.cardTitle}>Your position</RNText>
        {address !== undefined && (
          <PressableScale
            activeScale={0.97}
            onPress={() => void Linking.openURL(`https://solscan.io/account/${address}`)}
          >
            <RNText style={s.mono}>
              {address.slice(0, 4)}…{address.slice(-4)} ↗
            </RNText>
          </PressableScale>
        )}
      </View>
      {account === null ? (
        loading ? (
          <View style={s.gap}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="55%" height={28} />
          </View>
        ) : (
          <View style={s.panel}>
            <RNText style={s.small}>Smart-account balances are unavailable.</RNText>
            {failed && <Button size="md" variant="secondary" label="Try again" onPress={onRetry} />}
          </View>
        )
      ) : (
        <>
          <View>
            <RNText style={s.meta}>Smart-account value</RNText>
            <RNText style={s.bigValue}>{usd(account.totalValueUsd)}</RNText>
          </View>
          <View style={s.panel}>
            <Fact k="Available USDC" v={usdc === undefined || !Number.isFinite(usdc) ? "—" : usd(usdc)} />
            <Fact k="Other assets" v={String(held.filter((a) => a.assetId !== USDC_ASSET_ID).length)} />
            {account.inTransitUsd !== "0" && <Fact k="In transit" v={usd(account.inTransitUsd)} />}
            {exitState !== undefined && (
              <Fact
                k={exitMode === "in_kind" ? "In-kind withdrawal" : "Exit to USDC"}
                v={stateLabel(exitState)}
              />
            )}
            {exitError !== null && <RNText style={[s.small, { color: color.chipWarn }]}>{exitError}</RNText>}
            {account.warnings.length > 0 && (
              <RNText style={s.small}>Partial read; the value may be incomplete.</RNText>
            )}
          </View>

          {held.length > 0 && (
            <View style={s.held}>
              {(allAssets ? held : held.slice(0, 5)).map((a) => {
                const allocation = template.allocations.find((x) => x.assetId === a.assetId);
                const i = allocation ? instruments.get(allocation.ticker) : undefined;
                return (
                  <View key={`${a.smartAccountId}:${a.assetId}`} style={s.asset}>
                    <StockLogo
                      ticker={allocation?.ticker ?? a.symbol}
                      size={30}
                      uri={
                        a.assetId === USDC_ASSET_ID
                          ? "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
                          : (i?.logoUrl ?? undefined)
                      }
                    />
                    <View style={s.fill}>
                      <RNText style={s.name} numberOfLines={1}>
                        {i?.name ?? a.symbol}
                      </RNText>
                      <RNText style={s.small}>
                        {balance(a.balance)} {a.symbol}
                      </RNText>
                    </View>
                    <RNText style={s.name}>{usd(a.valueUsd)}</RNText>
                  </View>
                );
              })}
              {held.length > 5 && (
                <PressableScale activeScale={0.97} onPress={toggleAll}>
                  <RNText style={s.link}>
                    {allAssets ? "Show fewer" : `Show all ${held.length} assets`}
                  </RNText>
                </PressableScale>
              )}
            </View>
          )}
        </>
      )}

      <View style={s.actions}>
        {held.length > 0 && (
          <View style={s.fill}>
            <Button
              variant="secondary"
              label="Withdraw"
              disabled={account === null || busy}
              onPress={onExit}
            />
          </View>
        )}
        <View style={s.fill}>
          <Button label="Add USDC" onPress={onFund} />
        </View>
      </View>
    </View>
  </View>
);

/** The time to the next scheduled rebalance, ticking, and how far through the cycle it is. */
const Countdown = ({ schedule }: { schedule: ManagedBasketPortfolioSnapshot["schedule"] }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  const due = schedule?.nextDueAt ? Date.parse(schedule.nextDueAt) : NaN;
  const remaining = Number.isFinite(due) ? Math.max(0, due - now) : null;
  const paused = schedule?.status === "paused";
  const interval = schedule?.intervalMs ?? null;
  const progress =
    !paused && remaining !== null && interval && interval > 0
      ? Math.max(0, Math.min(1, 1 - remaining / interval))
      : 0;
  const seconds = remaining !== null && remaining > 0 && !paused ? Math.ceil(remaining / 1_000) % 60 : null;
  return (
    <View style={s.gap}>
      <RNText style={s.small}>Time to next run</RNText>
      <View style={s.countRow}>
        <RNText style={s.bigValue}>{countdownText(remaining, paused)}</RNText>
        {seconds !== null && <RNText style={s.seconds}>{String(seconds).padStart(2, "0")}s</RNText>}
      </View>
      <View style={s.track}>
        <View style={[s.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      <Fact
        k="Next scheduled"
        v={
          paused
            ? "Paused"
            : Number.isFinite(due)
              ? new Date(due).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
              : "Not scheduled"
        }
      />
      <Fact
        k="Last completed"
        v={
          schedule?.lastRebalanceAt
            ? new Date(schedule.lastRebalanceAt).toLocaleDateString("en-US", { dateStyle: "medium" })
            : "—"
        }
      />
    </View>
  );
};

/** Target weights as tiles sized by weight: the web's allocation mosaic. */
const Mosaic = ({
  allocations,
}: {
  allocations: ReturnType<
    typeof byWeight<{ ticker: string; weightBps: number; assetId: string; mint: string }>
  >;
}) => {
  const rows = useMemo(() => allocationRows(allocations), [allocations]);
  return (
    <View style={s.mosaic}>
      {rows.map((row, r) => (
        <View key={r} style={[s.mosaicRow, { flexGrow: row.reduce((sum, t) => sum + t.weightBps, 0) }]}>
          {row.map((tile, k) => (
            <View
              key={tile.ticker}
              style={[
                s.tile,
                { flexGrow: tile.weightBps, backgroundColor: TILE_TONES[(r * 2 + k) % TILE_TONES.length] },
              ]}
            >
              <RNText style={s.tileTicker} numberOfLines={1}>
                {tile.ticker}
              </RNText>
              <RNText style={s.tileWeight} numberOfLines={1}>
                {weightLabel(tile.weightBps)}
                {tile.kind === "other" ? ` · ${tile.assets.length}` : ""}
              </RNText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  navTitle: { flex: 1, fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  scroll: { gap: space.md, paddingTop: space.xs },

  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  pad: { padding: space.lg - 4, gap: space.md },
  gap: { gap: space.sm },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  cardTitle: { fontFamily: font.medium, fontSize: 15.5, letterSpacing: -0.31, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.sm },
  panelTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  title: { fontSize: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  meta: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  body: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: color.muted },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  name: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  link: { fontFamily: font.medium, fontSize: 13, color: color.link },
  mono: { fontFamily: font.regular, fontSize: 12, color: color.link },

  returnRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: space.sm,
  },
  bigReturn: { marginTop: 4, fontFamily: font.medium, fontSize: 30, letterSpacing: -0.9, color: color.ink },
  chartEmpty: {
    height: 180,
    borderRadius: radius.md,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  disclaim: { backgroundColor: color.tile, paddingHorizontal: space.lg - 4, paddingVertical: space.md },

  bigValue: { marginTop: 4, fontFamily: font.medium, fontSize: 26, letterSpacing: -0.7, color: color.ink },
  held: { gap: 2 },
  actions: { flexDirection: "row", gap: space.sm },
  opLine: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.sm },
  opState: { fontFamily: font.medium, fontSize: 12.5, color: color.ink, textTransform: "capitalize" },

  countRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  seconds: { fontFamily: font.regular, fontSize: 14, color: color.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 4, backgroundColor: "#D1E7DB" },

  list: {
    marginHorizontal: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.tile,
    padding: space.xs,
  },
  asset: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: 9,
  },
  end: { alignItems: "flex-end", gap: 3 },

  sector: { borderRadius: radius.sm, backgroundColor: color.tile, paddingHorizontal: 10, paddingVertical: 6 },
  sectorWeight: { fontFamily: font.medium, color: color.ink },
  mosaic: { height: 220, gap: 6, marginTop: space.xs },
  mosaicRow: { flexDirection: "row", gap: 6, flexBasis: 0 },
  tile: { flexBasis: 0, minWidth: 0, borderRadius: radius.md, padding: 8, justifyContent: "flex-end" },
  tileTicker: { fontFamily: font.medium, fontSize: 12, color: color.ink },
  tileWeight: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  facts: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.divider },

  event: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 6 },

  blank: { alignItems: "center", gap: space.md, padding: space.lg },
  blankTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "center" },
});
