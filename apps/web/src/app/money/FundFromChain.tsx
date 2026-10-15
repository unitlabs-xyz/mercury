import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { STEP_SLIDE, STEP_TRANSITION } from "../../motion/step";
import { useFundSources } from "../../api/fund-sources";
import { useDebounced, useFundTokens, usePrefetchFundTokens, type FundToken } from "../../api/fund-tokens";
import { useDisconnectFunder, useFunders } from "../../wallet/useFunder";
import { funderForChain, type Funder } from "../../wallet/funder";
import { Alert, Check, Close } from "../../ui/icons";
import { FundWalletSwap } from "./FundWalletSwap";
import { TokenMark } from "./TokenMark";
import { useHeldTokens, type Held } from "../../api/fund-holdings";
import { FundFromChainSkeleton, TokenRowsSkeleton } from "./FundSkeleton";

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

/**
 * One token on one chain.
 *
 * The chain goes on the right rather than under the symbol, which is where it
 * started and where two attempts put it back. Under the symbol it is a column
 * of the same word repeated — filter to Ethereum and eight rows read
 * "Ethereum", so the one line meant to tell them apart tells you nothing. On
 * the right it is a column you read only when it varies, and the second line
 * is free for the token's own name, which is what differs when the chain does
 * not.
 *
 * `showChain` drops the column entirely once a chip is set, because then it
 * does not vary either and the chip above already says which chain it is. The
 * mark keeps its badge, which costs no width.
 */
const TokenRow = ({
  token,
  showChain,
  current,
  held,
  onPick,
}: {
  token: FundToken;
  showChain: boolean;
  /** The token already chosen, marked so going back to it is one click. */
  current: boolean;
  /** What the connected wallet holds of it, shown in place of the chain. */
  held?: Held | undefined;
  onPick: () => void;
}) => (
  <button
    type="button"
    onClick={onPick}
    aria-current={current || undefined}
    className="group flex items-center gap-3 rounded-md px-3 text-left transition-colors hover:bg-white"
  >
    <TokenMark
      symbol={token.symbol}
      logoUrl={token.logoUrl}
      chainName={token.chainName}
      chainIconUrl={token.chainIconUrl}
    />
    {/*
     * The divider is on the inner span, not the row, so it starts after the
     * mark and stops short of nothing — a line running the full width would
     * cut the artwork off from its own label. `group-hover` hides it under a
     * hovered row so the highlight reads as one block.
     */}
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 border-b border-ds-divider py-3.5 group-last:border-b-0 group-hover:border-transparent">
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-[14px] leading-none text-ds-ink">{token.symbol}</span>
        <span className="truncate text-[12px] leading-none text-ds-muted">{token.name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {held !== undefined ? (
          <span className="flex flex-col items-end gap-1.5">
            <span className="text-[14px] leading-none text-ds-ink">
              {held.usd === null ? `${held.amountText}` : usdText(held.usd)}
            </span>
            <span className="text-[12px] leading-none text-ds-muted">
              {held.usd === null ? token.chainName : `${held.amountText} ${token.symbol}`}
            </span>
          </span>
        ) : (
          showChain && <span className="text-[12px] leading-none text-ds-muted">{token.chainName}</span>
        )}
        {current && <Check className="size-3.5 text-ds-ink" />}
      </span>
    </span>
  </button>
);

/** Dollars for a holding: "$1,240.50", and "<$0.01" for dust. */
const usdText = (n: number) =>
  n > 0 && n < 0.01
    ? "<$0.01"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** The chain filters. Server order, which is editorial rather than alphabetical. */
const ChainFilter = ({
  chains,
  picked,
  onPick,
  onWarm,
}: {
  chains: readonly { chainId: number; name: string; iconUrl: string | null }[];
  picked: number | null;
  onPick: (chainId: number | null) => void;
  /** About to be picked: fetch its list now, so the click lands on an answer. */
  onWarm: (chainId: number) => void;
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
          onPointerEnter={() => onWarm(c.chainId)}
          onFocus={() => onWarm(c.chainId)}
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

/**
 * `0x1234…cdef`, which is as much of an address as anyone reads.
 *
 * Returned whole when it is too short to shorten: the two slices overlap below
 * eleven characters and would print more than they were given.
 */
export const shortAddress = (address: string) =>
  address.length <= 11 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Which wallet is attached, and how to stop it being attached.
 *
 * The connector remembers across reloads, so without this a wallet connected
 * once to make one deposit is still the wallet weeks later, with nothing on
 * screen saying which one it is or offering to change it. Showing the address
 * is half the point: "connected" alone does not tell somebody holding three
 * wallets whether it is the one with the money in it.
 */
const ConnectedWallet = ({ funder }: { funder: Funder }) => {
  const disconnect = useDisconnectFunder();

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-ds-panel px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ds-live" />
        <span className="truncate text-[12px] leading-none text-ds-muted">
          Paying from <span className="text-ds-ink">{shortAddress(funder.address)}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={() => void disconnect()}
        className="shrink-0 text-[12px] leading-none text-ds-muted underline underline-offset-2 hover:text-ds-ink"
      >
        Disconnect
      </button>
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

const sameToken = (a: FundToken | null, b: FundToken) =>
  a !== null && a.chainId === b.chainId && a.address === b.address;

/**
 * Two screens, one at a time: the list of tokens, and the amount to send.
 *
 * The list comes first and takes the whole panel, because until a token is
 * chosen there is nothing else to do. Once one is, the amount screen holds it
 * in a selector inside the field, and the list comes back only when that is
 * pressed — with a close button that returns to the token already chosen, so
 * looking is never the same as changing.
 */
export const FundFromChain = () => {
  const sources = useFundSources();
  /* Both namespaces: which one pays depends on the token chosen below, and
     the held-token list wants everything either of them holds. */
  const funders = useFunders();
  const [query, setQuery] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [picked, setPicked] = useState<FundToken | null>(null);
  const [choosing, setChoosingState] = useState(false);
  /* Opening the list is a step back from the amount; picking from it is a step in. */
  const [dir, setDir] = useState(1);
  const setChoosing = (open: boolean) => {
    setDir(open ? -1 : 1);
    setChoosingState(open);
  };

  const debounced = useDebounced(query.trim());
  const tokens = useFundTokens(debounced, chainId);
  const prefetch = usePrefetchFundTokens();

  /* What is on screen is one answer behind only while a new one is in flight,
     because the query keeps its previous data. `isFetching` is therefore the
     honest signal for the spinner — `isPending` would be false after the first
     search and the field would go quiet for the rest of the session. */
  const searching = tokens.isFetching || debounced !== query.trim();
  const listed = tokens.data?.tokens ?? [];
  /*
   * With a wallet attached, what it holds comes first, most valuable at the
   * top, each showing how much — then everything else, without repeating
   * what was raised. Narrowed by the same search and chain as the list, so a
   * filter never shows a held token from somewhere else.
   */
  /* The wallet the strip should name: the one that would pay for the token
     chosen, or either of them before one has named a chain. */
  const payer = picked === null ? (funders.evm ?? funders.svm) : funderForChain(funders, picked.chainId);
  const held = useHeldTokens(funders, listed, sources.data?.chains ?? []);
  const term = debounced.toLowerCase();
  const heldHere = held.filter(
    (h) =>
      (chainId === null || h.token.chainId === chainId) &&
      (term.length === 0 ||
        h.token.symbol.toLowerCase().includes(term) ||
        h.token.name.toLowerCase().includes(term) ||
        h.token.chainName.toLowerCase().includes(term)),
  );
  const heldBy = new Map(heldHere.map((h) => [`${h.token.chainId}:${h.token.address}`, h]));
  const rows = [
    ...heldHere.map((h) => h.token),
    ...listed.filter((t) => !heldBy.has(`${t.chainId}:${t.address}`)),
  ];
  /* Named rather than carried as an id, so the empty state can say which chain
     it found nothing on. */
  const chainName = sources.data?.chains.find((c) => c.chainId === chainId)?.name ?? null;

  if (sources.isPending) {
    return <FundFromChainSkeleton />;
  }
  if (sources.isError) {
    return <Note>Deposits from other chains are unavailable right now. USDC on Solana still works.</Note>;
  }

  const listing = picked === null || choosing;
  const choose = (token: FundToken) => {
    setPicked(token);
    setChoosing(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-clip">
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        {listing ? (
          <motion.div
            key="list"
            custom={dir}
            variants={STEP_SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_TRANSITION}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center gap-2">
              <label className="flex h-11 min-w-0 flex-1 items-center rounded-lg bg-ds-panel px-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chains and tokens"
                  aria-label="Search chains and tokens"
                  className="w-full min-w-0 bg-transparent text-[14px] text-ds-ink outline-none placeholder:text-ds-muted"
                />
                {searching && <Searching />}
              </label>
              {/* Back to the token already chosen, without changing it. */}
              {picked !== null && (
                <button
                  type="button"
                  onClick={() => setChoosing(false)}
                  aria-label={`Keep ${picked.symbol}`}
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-ds-panel text-ds-muted transition-colors hover:bg-black/[0.06] hover:text-ds-ink"
                >
                  <Close className="size-3.5" />
                </button>
              )}
            </div>

            <div className="mt-2">
              <ChainFilter
                chains={sources.data?.chains ?? []}
                picked={chainId}
                onPick={setChainId}
                onWarm={(id) => prefetch(debounced, id)}
              />
            </div>

            {/*
             * The list runs to the bottom of the panel rather than stopping at
             * a fixed height, and scrolls inside itself with no bar: the fade
             * at its foot, in the list's own grey, is what says there is more.
             */}
            <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-ds-panel">
              <div
                aria-busy={searching}
                /* Dimmed rather than emptied while the next answer lands: the
                   rows under the cursor stay where they are, and the list
                   reads as being refined instead of destroyed and rebuilt. */
                className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-10 transition-opacity [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                  searching && rows.length > 0 ? "opacity-60" : ""
                }`}
              >
                {tokens.isError ? (
                  <p className="px-3 py-6 text-center text-[13px] text-ds-muted">
                    Could not load tokens. Check your connection and try again.
                  </p>
                ) : rows.length === 0 && tokens.isPending ? (
                  /* The first answer, before there is a list to dim. Later
                     searches keep the previous rows instead (see above). */
                  <TokenRowsSkeleton />
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
                         * The way out of a dead end. A chain filter set three
                         * searches ago is invisible by the time it stops
                         * matching, and "nothing matches USDC" is a confusing
                         * thing to read about a token we take on five chains.
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
                      showChain={chainId === null}
                      current={sameToken(picked, token)}
                      held={heldBy.get(`${token.chainId}:${token.address}`)}
                      onPick={() => choose(token)}
                    />
                  ))
                )}
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-ds-panel to-transparent"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="amount"
            custom={dir}
            variants={STEP_SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_TRANSITION}
            className="flex flex-col"
          >
            <FundWalletSwap token={picked} onChangeToken={() => setChoosing(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* On every screen: this is where somebody lands with a wallet still
          attached from last time, and where they would want to change it. */}
      {payer !== null && <ConnectedWallet funder={payer} />}
    </div>
  );
};
