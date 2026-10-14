import { useConnectWallet } from "@privy-io/react-auth";
import { useMemo, useState } from "react";
import { useFundAddress, useFundIntents, useFundSources } from "../../api/fund-sources";
import { SOLANA_CONNECT_OPTIONS, useFundingWallets } from "../../auth/embedded";
import { Button } from "../../ui/Button";
import { Alert, Check, Copy } from "../../ui/icons";
import { QrBlock } from "../Receive";
import { FundWalletSwap } from "./FundWalletSwap";
import { leadOptions, matchOptions, optionsOf, statusCopy, timingCopy, type FundOption } from "./fund-chain";

/**
 * Adding cash from any chain Relay supports.
 *
 * Three states in one panel, in this order: pick a chain and token, show the
 * address, show anything already in flight. There is no amount field, and that
 * is the shape of the feature rather than an omission — the amount is chosen
 * in the sender's own wallet or exchange, which is the whole reason a deposit
 * address beats a connected wallet here. It reaches the BTC on an exchange and
 * the USDT in a hardware wallet, neither of which can connect to a web page.
 *
 * Every chain is offered, all sixty-one, so the list is searched rather than
 * read. A short curated list would be us telling somebody we cannot take their
 * money when we can.
 */

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;

const Note = ({ tone, children }: { tone: "warn" | "down"; children: React.ReactNode }) => (
  <p
    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-[1.45] ${
      tone === "warn" ? "bg-ds-warn-chip text-ds-chip-warn" : "bg-ds-down-chip text-ds-chip-down"
    }`}
  >
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

/** The address, which is the only thing on this screen that loses money if it is wrong. */
const Address = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no clipboard permission: nothing to report */
    }
  };
  return (
    <div className="rounded-lg bg-ds-panel p-4">
      <div className="flex items-start gap-4">
        <QrBlock value={value} size={96} />
        {/*
         * In full, never truncated, and selectable. A shortened deposit address
         * is money sent nowhere, and somebody checking what they pasted has to
         * be able to read every character of it.
         */}
        <p className="min-w-0 flex-1 font-mono text-[12px] leading-[1.6] break-all text-ds-ink">{value}</p>
      </div>
      <Button variant="secondary" onClick={copy} className="mt-3 w-full">
        <span className="flex items-center justify-center gap-2">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy address"}
        </span>
      </Button>
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
                {short(intent.depositAddress)}
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
  const action = useFundAddress();
  const { wallets } = useFundingWallets();
  const { connectWallet } = useConnectWallet();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FundOption | null>(null);
  /*
   * "auto" takes the better route where there is one: a connected Solana
   * wallet signs once and copies nothing. "address" is what somebody chooses
   * when they would rather send from an exchange, or when there is no wallet
   * this app can sign with — which is every chain but Solana, for now.
   */
  const [mode, setMode] = useState<"auto" | "address">("auto");
  const hasWallet = wallets.length > 0;

  const requestAddress = (option: FundOption) => {
    setMode("address");
    action.mutate({ chainId: option.chainId, currency: option.currency.address });
  };

  const pick = (option: FundOption) => {
    setPicked(option);
    action.reset();
    /* Solana with a wallet attached needs no address at all. Everything else
       does, so it is asked for on the same click rather than after another. */
    if (option.vmType === "svm" && hasWallet) setMode("auto");
    else requestAddress(option);
  };

  const options = useMemo(() => optionsOf(sources.data?.chains ?? []), [sources.data]);
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
    return (
      <Note tone="down">
        Deposits from other chains are unavailable right now. USDC on Solana still works.
      </Note>
    );
  }

  /* Solana, a wallet attached, and nobody has asked for an address instead. */
  if (picked !== null && mode === "auto" && picked.vmType === "svm" && hasWallet) {
    return (
      <div className="flex flex-col">
        <p className="text-[14px] leading-none font-medium text-ds-ink">
          Swap {picked.currency.symbol} into cash
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted">
          One signature in your wallet. It arrives as USDC in your account.
        </p>
        <div className="mt-3">
          <FundWalletSwap option={picked} onUseAddress={() => requestAddress(picked)} />
        </div>
        <InFlight />
      </div>
    );
  }

  /*
   * Solana, no wallet attached. Offered rather than assumed: connecting is
   * better than copying an address, and somebody who would rather send from an
   * exchange should not have to connect anything to do it.
   */
  if (picked !== null && mode === "auto" && picked.vmType === "svm") {
    return (
      <div className="flex flex-col">
        <div className="rounded-lg bg-ds-panel p-4">
          <p className="text-[14px] leading-none font-medium text-ds-ink">Pay from a wallet you hold</p>
          <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
            Phantom, Backpack or Solflare. You approve one swap and the cash arrives here — nothing to copy,
            and no chance of sending the wrong token.
          </p>
          <Button
            variant="primary"
            onClick={() => connectWallet({ ...SOLANA_CONNECT_OPTIONS })}
            className="mt-4 w-full"
          >
            Connect a wallet
          </Button>
        </div>
        <button
          type="button"
          onClick={() => requestAddress(picked)}
          className="mt-3 self-center text-[12px] text-ds-muted hover:text-ds-ink hover:underline"
        >
          Use a deposit address instead
        </button>
        <InFlight />
      </div>
    );
  }

  if (action.isSuccess && picked !== null) {
    const { depositAddress, autoRefund, minimumUsd } = action.data;
    return (
      <div className="flex flex-col">
        <p className="text-[14px] leading-[1.45] font-medium text-ds-ink">
          Send {picked.currency.symbol} on <span className="capitalize">{picked.chainName}</span> to this
          address
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted">
          It arrives as USDC in your account. {timingCopy(picked.vmType)} Minimum ${minimumUsd}.
        </p>

        <div className="mt-3">
          <Address value={depositAddress} />
        </div>

        <div className="mt-2">
          {/*
           * The one rule that loses money if broken, and it leads rather than
           * sits under the buttons — the same lesson `Receive.tsx` records
           * about its own address, where the rule used to be read after the
           * address had already been copied.
           */}
          <Note tone="warn">
            Only {picked.currency.symbol} on <span className="capitalize">{picked.chainName}</span>. Anything
            else sent here cannot be recovered.
          </Note>
        </div>

        {!autoRefund && (
          <div className="mt-2">
            <Note tone="warn">
              If a deposit on this chain cannot be completed, returning it needs our help rather than
              happening automatically.
            </Note>
          </div>
        )}

        <Button
          variant="secondary"
          onClick={() => {
            setPicked(null);
            setMode("auto");
            action.reset();
          }}
          className="mt-5 w-full"
        >
          Choose something else
        </Button>

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
          placeholder="Search 60+ chains and tokens"
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
              onPick={() => pick(option)}
            />
          ))
        )}
      </div>

      {action.isError && (
        <div className="mt-2" role="alert">
          <Note tone="down">{action.error.message}</Note>
        </div>
      )}
      {action.isPending && (
        <p className="mt-3 text-center text-[13px] text-ds-muted">Setting up your address…</p>
      )}

      <InFlight />
    </div>
  );
};
