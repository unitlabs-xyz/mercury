import { useEffect, useState, type FormEvent } from "react";
import { rawTokenAmount, tokenAmount } from "@mercury/view";
import { NATIVE_SOL, useFunderBalance, useFundSwapAction } from "../../api/fund-swap";
import { useFundingWallets } from "../../auth/embedded";
import { Button } from "../../ui/Button";
import { Alert, Check } from "../../ui/icons";
import type { FundOption } from "./fund-chain";

/**
 * Swapping a Solana token the connected wallet holds into cash in the account.
 *
 * One signature and nothing to copy, which is why this is offered ahead of a
 * deposit address wherever it can be: an address is a thing somebody pastes
 * into another app after picking a token and a network, and every one of those
 * is a chance to be wrong. A transaction we compose has the mint and the
 * recipient in it already, because the server put them there.
 *
 * Solana only. Relay answers an EVM origin with calldata and Bitcoin with a
 * PSBT, neither of which this app can sign yet — those use the address.
 */

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

/** Native SOL is nine decimals; an SPL token says so in the Relay listing. */
const decimalsOf = (option: FundOption) =>
  option.currency.address === NATIVE_SOL ? 9 : option.currency.decimals;

export const FundWalletSwap = ({
  option,
  onUseAddress,
}: {
  option: FundOption;
  onUseAddress: () => void;
}) => {
  const { wallets } = useFundingWallets();
  const wallet = wallets[0];
  const decimals = decimalsOf(option);
  const balance = useFunderBalance(wallet?.address, option.currency.address);
  const action = useFundSwapAction(wallet);
  const resetAction = action.reset;
  const [amount, setAmount] = useState("");

  /* A different token is a different balance, so the amount typed against the
     old one is not an amount any more. */
  useEffect(() => {
    setAmount("");
    resetAction();
  }, [option.currency.address, wallet?.address, resetAction]);

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
   * Native SOL cannot be sent down to zero: the wallet still has to pay for
   * this transaction, and a Max that spent the lot would produce a signature
   * the network refuses for a fee the user cannot cover.
   */
  const spendable =
    held === undefined ? undefined : option.currency.address === NATIVE_SOL ? held - 10_000_000n : held;
  const maxText = tokenAmount(
    (spendable !== undefined && spendable > 0n ? spendable : 0n).toString(),
    decimals,
  );

  const ready = raw !== null && raw > 0n && !overdrawn && action.walletReady;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !action.isPending) {
      action.mutate({
        chainId: option.chainId,
        currency: option.currency.address,
        amountRaw: raw.toString(),
      });
    }
  };

  if (action.isSuccess) {
    return (
      <div className="flex flex-col items-center pt-6 pb-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <p className="mt-4 text-[20px] font-medium text-ds-ink">Added to your balance</p>
        <p className="mt-3 text-[14px] text-ds-muted">
          About ${action.data.outFormatted}, from {amount} {option.currency.symbol}.
        </p>
        <a
          href={`https://solscan.io/tx/${encodeURIComponent(action.data.signature)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 text-[13px] text-ds-link hover:underline"
        >
          View transaction ↗
        </a>
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

  if (wallet === undefined) {
    /* The caller only renders this with a wallet connected, so this is the
       wallet going away mid-flow rather than a state to design for. */
    return <Note tone="warn">Your wallet disconnected. Reconnect it, or use an address instead.</Note>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="rounded-lg bg-ds-panel p-1">
        <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
          <p className="text-[14px] leading-none text-ds-muted">{option.currency.symbol} to send</p>
          <p className="text-[12px] leading-none text-ds-muted">
            {balance.isPending
              ? "Reading your wallet…"
              : held === undefined
                ? "Balance unavailable"
                : `Balance: ${heldText}`}
          </p>
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
            aria-label={`Amount in ${option.currency.symbol}`}
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
          <span className="shrink-0 text-[12px] text-ds-muted">{option.currency.symbol}</span>
        </label>
      </div>

      {overdrawn && (
        <div className="mt-2">
          <Note tone="down">
            More than this wallet holds. {heldText} {option.currency.symbol} available.
          </Note>
        </div>
      )}
      {malformed && (
        <div className="mt-2">
          <Note tone="down">Enter an amount.</Note>
        </div>
      )}
      {option.currency.address === NATIVE_SOL && (
        <div className="mt-2">
          <Note tone="warn">Keep a little SOL back — your wallet pays the network fee for this swap.</Note>
        </div>
      )}
      {action.isError && (
        <div className="mt-2" role="alert">
          <Note tone="down">{action.error.message}</Note>
        </div>
      )}

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

      <button
        type="button"
        onClick={onUseAddress}
        className="mt-3 self-center text-[12px] text-ds-muted hover:text-ds-ink hover:underline"
      >
        Use a deposit address instead
      </button>
    </form>
  );
};
