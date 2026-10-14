import { useAppKit } from "@reown/appkit/react";
import { useMemo, useState } from "react";
import { useFundIntents, useFundSources } from "../../api/fund-sources";
import { CONNECTABLE_CHAIN_IDS } from "../../wallet/chains";
import { useConnectFunder, useFunder } from "../../wallet/useFunder";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/icons";
import { FundWalletSwap } from "./FundWalletSwap";
import { leadOptions, matchOptions, optionsOf, statusCopy, timingCopy, type FundOption } from "./fund-chain";

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
 * Every chain Relay accepts, less the ones no wallet here can sign for, so the
 * list is searched rather than read.
 */

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-start gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
    <Alert className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

const OptionRow = ({ option, onPick }: { option: FundOption; onPick: () => void }) => (
  <button
    type="button"
    onClick={onPick}
    className="flex h-12 items-center justify-between gap-3 rounded-md px-3 text-left transition-colors hover:bg-white/60"
  >
    <span className="truncate text-[14px] leading-none text-ds-ink">{option.currency.symbol}</span>
    <span className="shrink-0 text-[12px] leading-none text-ds-muted capitalize">{option.chainName}</span>
  </button>
);

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

export const FundFromChain = () => {
  const sources = useFundSources();
  const funder = useFunder();
  const connect = useConnectFunder();
  const { open } = useAppKit();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FundOption | null>(null);

  /*
   * The server reports every chain Relay accepts; this keeps the ones a wallet
   * here can actually sign for. Two honest halves — a row we cannot sign is a
   * row that fails after the user has chosen it, which is the worst moment.
   */
  const options = useMemo(
    () => optionsOf(sources.data?.chains ?? []).filter((o) => CONNECTABLE_CHAIN_IDS.has(o.chainId)),
    [sources.data],
  );
  const shown = useMemo(
    /* Nothing typed: lead with what somebody is likely to hold rather than with
       whatever Relay happened to list first. Everything stays one search away. */
    () => (query.trim().length === 0 ? leadOptions(options) : matchOptions(options, query)),
    [options, query],
  );

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
              Switch your wallet to <span className="capitalize">{picked.chainName}</span>
            </p>
            <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
              {picked.currency.symbol} lives on <span className="capitalize">{picked.chainName}</span>, and
              your wallet is somewhere else.
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
        <p className="text-[14px] leading-none font-medium text-ds-ink">
          Swap {picked.currency.symbol} into cash
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted">
          It arrives as USDC in your account. {timingCopy(picked.vmType)}
        </p>
        <div className="mt-3">
          <FundWalletSwap option={picked} />
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
      </label>

      <div className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg bg-ds-panel p-1">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ds-muted">Nothing matches “{query.trim()}”.</p>
        ) : (
          shown.map((option) => (
            <OptionRow
              key={`${option.chainId}:${option.currency.address}`}
              option={option}
              onPick={() => setPicked(option)}
            />
          ))
        )}
      </div>

      <InFlight />
    </div>
  );
};
