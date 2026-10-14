import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { rawTokenAmount, tokenAmount } from "@mercury/view";
import {
  NATIVE_EVM,
  NATIVE_SOL,
  useFunderBalance,
  useFunderGas,
  useFundSwapAction,
} from "../../api/fund-swap";
import { useFunder } from "../../wallet/useFunder";
import { Button } from "../../ui/Button";
import { Alert, Check } from "../../ui/icons";
import type { FundToken } from "../../api/fund-tokens";
import { fundErrorCopy } from "./fund-error";

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

export const FundWalletSwap = ({ token }: { token: FundToken }) => {
  const funder = useFunder();
  const decimals = decimalsOf(token);
  /* Both VMs read now; the hook knows which chain it is on. */
  const balance = useFunderBalance(funder?.address, token.address, token.vmType);
  const gas = useFunderGas(funder?.address, token.vmType);
  const action = useFundSwapAction();
  const resetAction = action.reset;
  const [amount, setAmount] = useState("");

  /* A different token, or a different wallet, is a different balance — so the
     amount typed against the old one is not an amount any more. */
  useEffect(() => {
    setAmount("");
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
  const raw = rawTokenAmount(amount, decimals);
  const malformed = amount.length > 0 && raw === null;
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

  /* Read, and actually zero — `undefined` is a balance nobody could read and
     must not disable anything. */
  const noGas = gas.data === 0n;
  const ready = raw !== null && raw > 0n && !overdrawn && !noGas && action.walletReady;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !action.isPending) {
      action.mutate({ currency: token.address, amountRaw: raw.toString() });
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
          About ${action.data.outFormatted} from {amount} {token.symbol}. It lands in your balance once the
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
          <p className="text-[14px] leading-none text-ds-muted">{token.symbol} to send</p>
          {
            <p className="text-[12px] leading-none text-ds-muted">
              {balance.isPending
                ? "Reading your wallet…"
                : held === undefined
                  ? "Balance unavailable"
                  : `Balance: ${heldText}`}
            </p>
          }
        </div>
        <label
          className={`flex h-15 items-center gap-2 rounded-md bg-white px-4 outline-1 ${
            overdrawn ? "outline-ds-down" : "outline-transparent focus-within:outline-black/10"
          }`}
        >
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Amount in ${token.symbol}`}
            aria-invalid={overdrawn}
            className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
          />
          {/* Nothing to offer when the balance could not be read, and offering
              zero would be a number we made up. */}
          {spendable !== undefined && spendable > 0n && (
            <button
              type="button"
              onClick={() => setAmount(maxText)}
              className="h-[26px] shrink-0 rounded-full border border-black/10 bg-linear-to-b from-white to-[#eeeeee] px-3 text-[12px] leading-none text-ds-ink"
            >
              Max
            </button>
          )}
          <span className="shrink-0 text-[12px] text-ds-muted">{token.symbol}</span>
        </label>
      </div>

      {overdrawn && (
        <div className="mt-2">
          <Note tone="down">
            More than this wallet holds. {heldText} {token.symbol} available.
          </Note>
        </div>
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
      {noGas && (
        <div className="mt-2">
          <Note tone="warn">
            This wallet has no {token.chainName} gas coin, so it cannot pay the network fee. Send a little to
            it first.
          </Note>
        </div>
      )}
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={action.isPending}
        disabled={!ready}
        className="mt-4 w-full"
      >
        {action.isPending ? "Waiting for your wallet…" : "Approve in your wallet"}
      </Button>
    </form>
  );
};
