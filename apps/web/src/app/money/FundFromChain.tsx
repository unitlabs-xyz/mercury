import { useAppKit } from "@reown/appkit/react";
import { useState } from "react";
import { useFundIntents, useFundSources } from "../../api/fund-sources";
import { useDebounced, useFundTokens, type FundToken } from "../../api/fund-tokens";
import { useConnectFunder, useFunder } from "../../wallet/useFunder";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/icons";
import { FundWalletSwap } from "./FundWalletSwap";
import { TokenMark } from "./TokenMark";
import { statusCopy, timingCopy } from "./fund-chain";

/**
 * Adding cash from a wallet somebody already holds, on any chain we can sign on.
 *
 * There is no deposit address here and that is a decision, not an omission. An
 * address reaches money on an exchange, which a connected wallet cannot — but
 * it also costs an app-controlled refund address per chain family, and a
 * refund arriving at one needs a person to return it. Every deposit coming
 * from a connected wallet means `refundTo` is the wallet that just signed:
 * correct by construction, and nobody holds anybody's money by accident. See
 * docs/adr/0014-relay-funding.md.
 *
 * Both lists come from the server — which chains we offer, and which tokens
 * match what somebody typed. The browser holds no opinion about either, so
 * adding a chain is a server deploy.
 */

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-start gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
    <Alert className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

const TokenRow = ({ token, onPick }: { token: FundToken; onPick: () => void }) => (
  <button
    type="button"
    onClick={onPick}
    className="flex h-14 items-center gap-3 rounded-md px-3 text-left transition-colors hover:bg-white/60"
  >
    <TokenMark
      symbol={token.symbol}
      logoUrl={token.logoUrl}
      chainName={token.chainName}
      chainIconUrl={token.chainIconUrl}
    />
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="truncate text-[14px] leading-none text-ds-ink">{token.symbol}</span>
      {/*
       * The chain, not the token's full name.
       *
       * The name is the symbol again in almost every case — USDC is "USD
       * Coin", ETH is "Ether", DEGEN is "Degen" — so a list of it reads as a
       * stutter. The chain is the one fact that distinguishes the three rows
       * all called USDC, which makes it the thing somebody is actually
       * choosing between. The badge on the mark reinforces it rather than
       * carrying it alone, because a 14px mark is recognisable once you know
       * what you are looking for and not before.
       */}
      <span className="truncate text-[12px] leading-none text-ds-muted">{token.chainName}</span>
    </span>
  </button>
);

/** The chain filters. Server order, which is editorial rather than alphabetical. */
const ChainFilter = ({
  chains,
  picked,
  onPick,
}: {
  chains: readonly { chainId: number; name: string; iconUrl: string | null }[];
  picked: number | null;
  onPick: (chainId: number | null) => void;
}) => {
  const chip = (on: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] leading-none whitespace-nowrap transition-colors ${
      on ? "bg-ds-ink text-white" : "bg-ds-panel text-ds-muted hover:text-ds-ink"
    }`;

  return (
    /*
     * Scrolls rather than wraps: nine chains is three ragged lines in a sheet
     * this narrow, and the sheet is narrow at every viewport.
     *
     * Not the `scroll-row` utility, which encodes the same idea but only below
     * 40rem — it keys off the viewport, and this row is inside a fixed-width
     * sheet that does not get wider when the window does. The scrollbar is
     * hidden because a visible one above a list that also scrolls reads as two
     * competing scrollers; `-mx-1 px-1` keeps the first and last chips' focus
     * rings from being clipped by the scroller.
     */
    <div
      role="group"
      aria-label="Filter by chain"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={() => onPick(null)}
        aria-pressed={picked === null}
        className={chip(picked === null)}
      >
        All chains
      </button>
      {chains.map((c) => (
        <button
          key={c.chainId}
          type="button"
          onClick={() => onPick(picked === c.chainId ? null : c.chainId)}
          aria-pressed={picked === c.chainId}
          className={chip(picked === c.chainId)}
        >
          {c.iconUrl !== null && <img src={c.iconUrl} alt="" className="size-4 rounded-full" />}
          {c.name}
        </button>
      ))}
    </div>
  );
};

const InFlight = () => {
  const { data } = useFundIntents();
  const intents = data?.intents ?? [];
  if (intents.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-[12px] leading-none text-ds-muted">Recent deposits</p>
      <div className="mt-2 flex flex-col gap-1">
        {intents.slice(0, 5).map((intent) => {
          const { label, done } = statusCopy(intent.status);
          return (
            <div
              key={intent.id}
              className="flex items-center justify-between gap-3 rounded-md bg-ds-panel px-3 py-2.5"
            >
              <span className="truncate text-[13px] leading-none text-ds-ink">
                {intent.originCurrencySymbol} from{" "}
                <span className="capitalize">{intent.originChainName}</span>
              </span>
              <span
                className={`shrink-0 text-[12px] leading-none ${
                  intent.status === "success" ? "text-ds-up" : done ? "text-ds-chip-down" : "text-ds-muted"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Three dots, for the moment between a keystroke and an answer. */
const Searching = () => (
  <span aria-hidden className="flex shrink-0 items-center gap-0.5 pl-2">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="size-1 animate-pulse rounded-full bg-ds-muted"
        style={{ animationDelay: `${i * 160}ms` }}
      />
    ))}
  </span>
);

export const FundFromChain = () => {
  const sources = useFundSources();
  const funder = useFunder();
  const connect = useConnectFunder();
  const { open } = useAppKit();
  const [query, setQuery] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [picked, setPicked] = useState<FundToken | null>(null);

  const debounced = useDebounced(query.trim());
  const tokens = useFundTokens(debounced, chainId);

  /* What is on screen is one answer behind only while a new one is in flight,
     because the query keeps its previous data. `isFetching` is therefore the
     honest signal for the spinner — `isPending` would be false after the first
     search and the field would go quiet for the rest of the session. */
  const searching = tokens.isFetching || debounced !== query.trim();
  const rows = tokens.data?.tokens ?? [];
  /* Named rather than carried as an id, so the empty state can say which chain
     it found nothing on. */
  const chainName = sources.data?.chains.find((c) => c.chainId === chainId)?.name ?? null;

  if (sources.isPending) {
    return <p className="py-6 text-center text-[13px] text-ds-muted">Loading deposit options…</p>;
  }
  if (sources.isError) {
    return <Note>Deposits from other chains are unavailable right now. USDC on Solana still works.</Note>;
  }

  if (picked !== null) {
    const back = (
      <button
        type="button"
        onClick={() => setPicked(null)}
        className="mt-3 self-center text-[12px] text-ds-muted hover:text-ds-ink hover:underline"
      >
        Choose something else
      </button>
    );

    if (funder === null) {
      return (
        <div className="flex flex-col">
          <div className="rounded-lg bg-ds-panel p-4">
            <p className="text-[14px] leading-none font-medium text-ds-ink">
              Connect the wallet that holds it
            </p>
            <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
              Phantom, MetaMask, Rabby, Backpack — or any wallet on your phone. You approve the swap and the
              cash arrives here.
            </p>
            <Button variant="primary" onClick={connect} className="mt-4 w-full">
              Connect a wallet
            </Button>
          </div>
          {back}
          <InFlight />
        </div>
      );
    }

    /*
     * A wallet can only sign on the chain it is on. Asking it to switch is one
     * tap in AppKit; quoting against the wrong chain would build a transaction
     * that fails for a reason nobody could read.
     */
    if (funder.chainId !== picked.chainId) {
      return (
        <div className="flex flex-col">
          <div className="rounded-lg bg-ds-panel p-4">
            <p className="text-[14px] leading-none font-medium text-ds-ink">
              Switch your wallet to {picked.chainName}
            </p>
            <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
              {picked.symbol} lives on {picked.chainName}, and your wallet is somewhere else.
            </p>
            <Button variant="primary" onClick={() => void open({ view: "Networks" })} className="mt-4 w-full">
              Switch network
            </Button>
          </div>
          {back}
          <InFlight />
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Swap {picked.symbol} into cash</p>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted">
          It arrives as USDC in your account. {timingCopy(picked.vmType)}
        </p>
        <div className="mt-3">
          <FundWalletSwap token={picked} />
        </div>
        {back}
        <InFlight />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <label className="flex h-11 items-center rounded-lg bg-ds-panel px-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chains and tokens"
          aria-label="Search chains and tokens"
          className="w-full min-w-0 bg-transparent text-[14px] text-ds-ink outline-none placeholder:text-ds-muted"
        />
        {searching && <Searching />}
      </label>

      <div className="mt-2">
        <ChainFilter chains={sources.data?.chains ?? []} picked={chainId} onPick={setChainId} />
      </div>

      <div
        aria-busy={searching}
        /* Dimmed rather than emptied while the next answer lands: the rows
           under the cursor stay where they are, and the list reads as being
           refined instead of destroyed and rebuilt. */
        className={`mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg bg-ds-panel p-1 transition-opacity ${
          searching && rows.length > 0 ? "opacity-60" : ""
        }`}
      >
        {tokens.isError ? (
          <p className="px-3 py-6 text-center text-[13px] text-ds-muted">
            Could not load tokens. Check your connection and try again.
          </p>
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-ds-muted">
            {searching ? (
              "Searching…"
            ) : (
              <>
                <p>
                  {debounced.length > 0
                    ? `Nothing matches “${debounced}”${chainName === null ? "" : ` on ${chainName}`}.`
                    : `Nothing to deposit${chainName === null ? "" : ` on ${chainName}`} right now.`}
                </p>
                {/*
                 * The way out of a dead end. A chain filter set three searches
                 * ago is invisible by the time it stops matching, and "nothing
                 * matches USDC" is a confusing thing to read about a token we
                 * take on five chains.
                 */}
                {chainName !== null && (
                  <button
                    type="button"
                    onClick={() => setChainId(null)}
                    className="mt-1 text-ds-ink underline underline-offset-2"
                  >
                    Search every chain
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          rows.map((token) => (
            <TokenRow
              key={`${token.chainId}:${token.address}`}
              token={token}
              onPick={() => setPicked(token)}
            />
          ))
        )}
      </div>

      <InFlight />
    </div>
  );
};
