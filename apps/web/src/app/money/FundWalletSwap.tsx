import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { rawTokenAmount, tokenAmount } from "@mercury/view";
import {
  NATIVE_EVM,
  NATIVE_SOL,
  useFunderBalance,
  useFunderGas,
  useFundSwapAction,
} from "../../api/fund-swap";
import { useEstimateFeesPerGas } from "wagmi";
import { useConnectFunder, useFunder } from "../../wallet/useFunder";
import { EVM_NETWORKS } from "../../wallet/chains";
import { Button } from "../../ui/Button";
import { Alert, Check, ChevronDown, Flip } from "../../ui/icons";
import { useFundPrice } from "../../api/fund-price";
import { TokenMark } from "./TokenMark";
import { Skeleton } from "../portfolio/ui";
import { InfoTip } from "../../ui/ds";
import { useDebounced, type FundToken } from "../../api/fund-tokens";
import { cleanAmount } from "./fund-chain";
import { useMoney } from "../../api/hooks";
import { TooSmall, useFundPreview } from "../../api/fund-preview";
import { fundErrorCopy, fundErrorDetail } from "./fund-error";

/**
 * Swapping a token the connected wallet holds into cash in the account.
 *
 * One signature and nothing to copy. An address is a thing somebody pastes
 * into another app after picking a token and a network, and every one of those
 * is a chance to be wrong; a transaction Relay builds has the mint and the
 * recipient in it already, because the server asked for them.
 *
 * The same form for every chain. What differs is only what can be shown: a
 * Solana balance is one account read away, and an EVM one would be a dozen RPC
 * endpoints to keep working for a number the wallet is already displaying. So
 * Max and the too-much warning appear on Solana and the wallet refuses an
 * overdraft everywhere else — the same way the no-SOL case is left to it.
 */

const Note = ({ tone, children }: { tone: "warn" | "down"; children: ReactNode }) => (
  <p
    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-[1.45] ${
      tone === "warn" ? "bg-ds-warn-chip text-ds-chip-warn" : "bg-ds-down-chip text-ds-chip-down"
    }`}
  >
    <Alert className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

/** Native SOL is nine decimals; an SPL or ERC-20 token says so in the Relay listing. */
const decimalsOf = (token: FundToken) => (token.address === NATIVE_SOL ? 9 : token.decimals);

const explorer = (token: FundToken, hash: string) =>
  token.vmType === "svm"
    ? `https://solscan.io/tx/${encodeURIComponent(hash)}`
    : `https://relay.link/transaction/${encodeURIComponent(hash)}`;

/** Dollars as people read them: "$1,240.50", and "<$0.01" rather than "$0.00" for dust. */
const usd = (n: number) =>
  n > 0 && n < 0.01
    ? "<$0.01"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** One line of the deposit summary: what, and how much, or a skeleton while it is quoted. */
const SummaryRow = ({
  label,
  loading,
  children,
}: {
  label: ReactNode;
  loading: boolean;
  children: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-ds-muted">{label}</dt>
    <dd className="text-ds-ink">{loading ? <Skeleton className="h-3 w-16" /> : children}</dd>
  </div>
);

/** A decimal string with its trailing zeros dropped: "0.00500000" is "0.005". */
const trimZeros = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

export const FundWalletSwap = ({ token, onChangeToken }: { token: FundToken; onChangeToken: () => void }) => {
  const funder = useFunder();
  const connect = useConnectFunder();
  const decimals = decimalsOf(token);
  /* Both VMs read now; the hook knows which chain it is on. */
  const balance = useFunderBalance(funder?.address, token.address, token.vmType, token.chainId);
  const gas = useFunderGas(funder?.address, token.vmType, token.chainId);
  const action = useFundSwapAction();
  const resetAction = action.reset;
  const [amount, setAmount] = useState("");
  /*
   * Which side the field is typed in. Tokens by default, because that is what
   * the wallet holds and what it will ask to approve; dollars on request, for
   * somebody who knows they want to add $50 and not how much ETH that is.
   */
  const [unit, setUnit] = useState<"token" | "usd">("token");
  const priced = useFundPrice(token.chainId, token.address);
  const price = priced.data ?? null;

  /* A different token, or a different wallet, is a different balance — so the
     amount typed against the old one is not an amount any more. */
  useEffect(() => {
    setAmount("");
    setUnit("token");
    resetAction();
  }, [token.address, funder?.address, resetAction]);

  /*
   * Read the wallet again once the deposit has gone.
   *
   * The money has left by then and the number beside the field is the number
   * from before it, which reads as the deposit not having happened. The
   * mutation cannot do this itself: it clears its own query keys, and wagmi's
   * reads are keyed by wagmi — so the refetch has to be asked for by whoever
   * holds both, which is here.
   */
  const refetchBalance = balance.refetch;
  const refetchGas = gas.refetch;
  const settled = action.isSuccess;
  useEffect(() => {
    if (!settled) return;
    refetchBalance();
    refetchGas();
  }, [settled, refetchBalance, refetchGas]);

  /*
   * `undefined` is a balance nobody could read, and it is not zero. Treating
   * the two alike is what showed "Balance: 0" against a wallet holding 5.69.
   */
  const held = balance.data;
  const heldText = tokenAmount((held ?? 0n).toString(), decimals);

  /*
   * The amount in tokens, whichever side it was typed on. Dollars become
   * tokens at the shown price, to no more places than the token has or eight,
   * which is past anything a wallet displays. The quote is still Relay's: this
   * only decides how much is offered to it.
   */
  const places = Math.min(decimals, 8);
  const inUsd = unit === "usd" && price !== null;
  /* "12." is "12" halfway to "12.5": read as the number it already is. */
  const entered = amount.endsWith(".") ? amount.slice(0, -1) : amount;
  const typed = Number(entered);
  const tokenText =
    !inUsd || entered.length === 0 || !Number.isFinite(typed)
      ? entered
      : trimZeros((typed / price).toFixed(places));
  const raw = rawTokenAmount(tokenText, decimals);
  /* The other side of the field: dollars under tokens, or tokens under dollars. */
  const tokenValue = Number(tokenText);
  /* Always a figure: $0.00 before anything is typed, so the line is there
     from the start and does not appear under the field mid-keystroke. */
  const counterpart =
    price === null
      ? null
      : inUsd
        ? `${entered.length === 0 ? "0" : tokenText} ${token.symbol}`
        : usd(entered.length === 0 || !Number.isFinite(tokenValue) ? 0 : tokenValue * price);

  const flip = () => {
    if (price === null) return;
    if (inUsd) {
      setAmount(tokenText);
      setUnit("token");
    } else {
      setAmount(entered.length === 0 || !Number.isFinite(typed) ? "" : (typed * price).toFixed(2));
      setUnit("usd");
    }
  };
  /* Said only once typing has paused, so a half-typed amount is never told
     it is wrong while it is still being written. */
  const quiet = useDebounced(amount, 600);
  const malformed = quiet === amount && entered.length > 0 && raw === null;
  const overdrawn = held !== undefined && raw !== null && raw > held;

  /*
   * A chain's own coin cannot be sent down to zero: the wallet still has to
   * pay for this transaction, and a Max that spent the lot would produce a
   * signature the network refuses for a fee the user can no longer cover.
   *
   * The amounts are reserves, not estimates. 0.01 SOL covers a Solana fee many
   * times over. On EVM an approve and a deposit is roughly 300k gas, which is
   * about 0.003 ETH at 10 gwei on mainnet and a small fraction of that on an
   * L2 — so mainnet gets ten times the reserve the rollups do. Erring high
   * costs somebody a few cents of unspent balance; erring low costs them a
   * reverted transaction and the gas it burned.
   */
  const reserve =
    token.address === NATIVE_SOL
      ? 10_000_000n
      : token.address === NATIVE_EVM
        ? token.chainId === 1
          ? 3_000_000_000_000_000n
          : 300_000_000_000_000n
        : 0n;
  const spendable = held === undefined ? undefined : held - reserve;
  const maxText = tokenAmount(
    (spendable !== undefined && spendable > 0n ? spendable : 0n).toString(),
    decimals,
  );

  /*
   * Whether the wallet can pay for the deposit, checked before it is asked.
   *
   * Zero was the old test and it missed the case that actually happens: a
   * wallet holding a few cents of dust. Phantom, given an approve it cannot
   * fund, does not say so — it answers "Unexpected error", which reached the
   * screen as an internal error (measured 14 October: 0.00000058 ETH on Base
   * against ~0.00000096 ETH for approve plus deposit). So the cost is
   * estimated: the gas a deposit takes, with half again for headroom, at the
   * chain's current max fee. An ERC-20 is an approve and a deposit (~160k
   * measured); the chain's own coin is a deposit alone, and its amount comes
   * out of the same balance. `undefined` anywhere is a figure we could not
   * read, and that never blocks anything.
   */
  const fees = useEstimateFeesPerGas({
    chainId: token.chainId,
    query: { enabled: token.vmType === "evm" && funder !== null, staleTime: 15_000 },
  });
  const feePerGas = fees.data?.maxFeePerGas ?? fees.data?.gasPrice;
  const isNative = token.address === NATIVE_EVM;
  const gasNeeded = feePerGas === undefined ? undefined : feePerGas * (isNative ? 150_000n : 240_000n);
  const gasCoin =
    token.vmType === "svm"
      ? "SOL"
      : (EVM_NETWORKS.find((c) => c.id === token.chainId)?.nativeCurrency.symbol ?? "gas");
  const lowGas =
    gas.data !== undefined &&
    (gas.data === 0n ||
      (gasNeeded !== undefined && gas.data < gasNeeded + (isNative && raw !== null ? raw : 0n)));
  /* The wallet is somewhere else. Not a blocker any more — the deposit brings
     it across — but the button should say so before the prompt appears. */
  const wrongChain = funder !== null && funder.chainId !== token.chainId;
  /*
   * What the deposit comes to: the USDC that lands, Relay's fee (out of the
   * amount) and the network fee (paid by the wallet on top). Asked once the
   * amount has stopped changing, so typing "125" is one quote, not three.
   */
  const settledRaw = useDebounced(raw?.toString() ?? null, 400);
  const recipient = useMoney().data?.depositAddress;
  const preview = useFundPreview({
    chainId: token.chainId,
    currency: token.address,
    vmType: token.vmType,
    amountRaw: settledRaw === null ? null : BigInt(settledRaw),
    user: funder?.address,
    recipient,
  });
  const tooSmall = preview.error instanceof TooSmall;
  const showSummary = raw !== null && raw > 0n;
  const quoting =
    showSummary && (settledRaw !== raw.toString() || preview.isFetching) && preview.data === undefined;

  const ready = raw !== null && raw > 0n && !overdrawn && !lowGas && !tooSmall && action.walletReady;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !action.isPending) {
      action.mutate({ chainId: token.chainId, currency: token.address, amountRaw: raw.toString() });
    }
  };

  if (action.isSuccess) {
    const hash = action.data.outTxHash ?? action.data.inTxHash;
    return (
      <div className="flex flex-col items-center pt-6 pb-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <p className="mt-4 text-[20px] font-medium text-ds-ink">Deposit sent</p>
        <p className="mt-3 text-[14px] text-ds-muted">
          About ${action.data.outFormatted} from {tokenText} {token.symbol}. It lands in your balance once the
          swap settles.
        </p>
        {hash !== null && (
          <a
            href={explorer(token, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-[13px] text-ds-link hover:underline"
          >
            View transaction ↗
          </a>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setAmount("");
            resetAction();
          }}
          className="mt-7 w-full"
        >
          Add more
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="rounded-lg bg-ds-panel p-1">
        <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
          <p className="text-[14px] leading-none text-ds-muted">You send</p>
          {/* No wallet yet, no balance to show: a query that never runs reads
              as loading, and a skeleton that never resolves is worse than none. */}
          {funder === null ? null : balance.isPending ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <p className="text-[12px] leading-none text-ds-muted">
              {held === undefined ? "Balance unavailable" : `Balance: ${heldText} ${token.symbol}`}
            </p>
          )}
        </div>
        <div
          className={`rounded-md bg-white outline-1 ${
            overdrawn ? "outline-ds-down" : "outline-transparent focus-within:outline-black/10"
          }`}
        >
          <label className="flex h-15 items-center gap-2 px-4">
            {inUsd && <span className="text-[28px] leading-none font-medium text-ds-ink">$</span>}
            <input
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value, inUsd ? 2 : decimals))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={inUsd ? "Amount in dollars" : `Amount in ${token.symbol}`}
              aria-invalid={overdrawn}
              className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
            />
            {/* Nothing to offer when the balance could not be read, and offering
                zero would be a number we made up. Max is a token amount, so it
                brings the field back to tokens. */}
            {spendable !== undefined && spendable > 0n && (
              <button
                type="button"
                onClick={() => {
                  setUnit("token");
                  setAmount(maxText);
                }}
                className="h-[26px] shrink-0 rounded-full border border-black/10 bg-linear-to-b from-white to-[#eeeeee] px-3 text-[12px] leading-none text-ds-ink"
              >
                Max
              </button>
            )}
            {/* The token being sent, and the way to change it. */}
            <button
              type="button"
              onClick={onChangeToken}
              aria-label={`${token.symbol} on ${token.chainName}. Change token`}
              className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-ds-panel pr-2.5 pl-1 text-[14px] leading-none font-medium text-ds-ink transition-colors hover:bg-black/[0.06]"
            >
              <TokenMark
                symbol={token.symbol}
                logoUrl={token.logoUrl}
                chainName={token.chainName}
                chainIconUrl={token.chainIconUrl}
              />
              {token.symbol}
              <ChevronDown className="size-3.5 text-ds-muted" />
            </button>
          </label>
          {/* The same amount on the other side, and the switch between them.
              Hidden when the token has no price rather than showing a dollar
              figure we cannot back. */}
          <div className="flex h-10 items-center justify-between gap-3 border-t border-ds-divider px-4">
            {priced.isPending ? (
              <Skeleton className="h-3 w-20" />
            ) : (
              <p className="min-w-0 truncate text-[13px] leading-none text-ds-muted">
                {counterpart === null ? "No dollar price for this token" : `≈ ${counterpart}`}
              </p>
            )}
            {price !== null && (
              <button
                type="button"
                onClick={flip}
                className="flex shrink-0 items-center gap-1.5 text-[12px] leading-none text-ds-muted transition-colors hover:text-ds-ink"
              >
                <Flip className="size-3.5" />
                {inUsd ? `Enter in ${token.symbol}` : "Enter in dollars"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* What it comes to, before anything is signed. */}
      {showSummary && !tooSmall && (
        <dl className="mt-5 flex flex-col gap-3.5 px-1 text-[14px] leading-none">
          <SummaryRow label="You receive" loading={quoting}>
            {preview.data === undefined
              ? "—"
              : `${trimZeros(Number(preview.data.outAmount).toFixed(2))} USDC`}
          </SummaryRow>
          <SummaryRow
            label={
              <span className="flex items-center gap-1.5">
                Fee
                {preview.data !== undefined && (
                  <InfoTip label="About the fee" align="start">
                    <span className="flex min-w-48 flex-col gap-2">
                      <span className="flex justify-between gap-6">
                        <span>Relay</span>
                        <span>{usd(preview.data.relayFeeUsd)}</span>
                      </span>
                      <span className="flex justify-between gap-6">
                        <span>Network</span>
                        <span>{usd(preview.data.networkFeeUsd)}</span>
                      </span>
                    </span>
                  </InfoTip>
                )}
              </span>
            }
            loading={quoting}
          >
            {preview.data === undefined ? "—" : usd(preview.data.relayFeeUsd + preview.data.networkFeeUsd)}
          </SummaryRow>
        </dl>
      )}

      {malformed && (
        <div className="mt-2">
          <Note tone="down">Enter an amount.</Note>
        </div>
      )}
      {token.address === NATIVE_SOL && (
        <div className="mt-2">
          <Note tone="warn">Keep a little SOL back — your wallet pays the network fee.</Note>
        </div>
      )}
      {/*
       * The other half of a revert.
       *
       * A wallet holding the token and none of the chain's coin signs a
       * transaction that cannot be mined. Zero rather than a threshold,
       * because what a fee costs varies by chain and by minute, and a guess
       * that read too high would block a deposit that would have worked.
       */}
      {action.isError &&
        (() => {
          /* Never `action.error.message` straight out: viem wraps a wallet
             rejection in an error whose `message` is blank, which rendered an
             alert with nothing in it. */
          const { message, rejected } = fundErrorCopy(action.error);
          return (
            <div className="mt-2" role="alert">
              {/* A cancellation is not a fault. Red for it would tell somebody
                  their own decision went wrong. */}
              <Note tone={rejected ? "warn" : "down"}>
                {message}
                {/* Dev builds only: the wallet's raw words, so a failure can be
                    read off the screen without opening the console. */}
                {import.meta.env.DEV && (
                  <span className="mt-1 block font-mono text-[11px] break-all opacity-70">
                    {fundErrorDetail(action.error)}
                  </span>
                )}
                {/*
                 * The receipt, when the failure had one.
                 *
                 * "Transaction Reverted" is all the SDK throws — it drops the
                 * receipt — and a revert is the one failure whose reason is
                 * written down publicly. Linking it is the difference between
                 * telling somebody their money did not move and showing them
                 * the call that stopped it.
                 */}
                {action.failedTxHash !== null && (
                  <>
                    {" "}
                    <a
                      href={explorer(token, action.failedTxHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      See what happened
                    </a>
                  </>
                )}
              </Note>
            </div>
          );
        })()}

      {/* One button for the whole flow: it connects a wallet until there is
          one, then sends. The form above is the same either way, so connecting
          is a step on the way rather than a screen of its own. */}
      {funder === null ? (
        <Button type="button" variant="primary" size="lg" onClick={connect} className="mt-4 w-full">
          Connect wallet
        </Button>
      ) : (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={action.isPending}
          disabled={!ready}
          className="mt-4 w-full"
        >
          {action.isPending
            ? "Waiting for your wallet…"
            : overdrawn
              ? `Insufficient ${token.symbol} balance`
              : tooSmall
                ? "Amount too small to swap"
                : lowGas
                  ? `Not enough ${gasCoin} for gas`
                  : /* Says the switch is coming rather than springing it. The wallet
                 was always going to ask twice here; the label is what stops the
                 first prompt looking like the wrong one. */
                    wrongChain
                    ? `Switch to ${token.chainName} and send`
                    : "Approve in your wallet"}
        </Button>
      )}
    </form>
  );
};
