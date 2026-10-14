import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { rawTokenAmount, tokenAmount } from "@mercury/view";
import { NATIVE_SOL, useFunderBalance, useFundSwapAction } from "../../api/fund-swap";
import { useFunder } from "../../wallet/useFunder";
import { Button } from "../../ui/Button";
import { Alert, Check } from "../../ui/icons";
import type { FundToken } from "../../api/fund-tokens";

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
  /* Solana only — see the note above. */
  const readable = token.vmType === "svm";
  const balance = useFunderBalance(funder?.address, token.address, readable);
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
   * `undefined` is a balance nobody could read, and it is not zero. Treating
   * the two alike is what showed "Balance: 0" against a wallet holding 5.69.
   */
  const held = readable ? balance.data : undefined;
  const heldText = tokenAmount((held ?? 0n).toString(), decimals);
  const raw = rawTokenAmount(amount, decimals);
  const malformed = amount.length > 0 && raw === null;
  const overdrawn = held !== undefined && raw !== null && raw > held;

  /*
   * Native SOL cannot be sent down to zero: the wallet still has to pay for
   * this transaction, and a Max that spent the lot would produce a signature
   * the network refuses for a fee the user can no longer cover.
   */
  const spendable = held === undefined ? undefined : token.address === NATIVE_SOL ? held - 10_000_000n : held;
  const maxText = tokenAmount(
    (spendable !== undefined && spendable > 0n ? spendable : 0n).toString(),
    decimals,
  );

  const ready = raw !== null && raw > 0n && !overdrawn && action.walletReady;

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
          {readable && (
            <p className="text-[12px] leading-none text-ds-muted">
              {balance.isPending
                ? "Reading your wallet…"
                : held === undefined
                  ? "Balance unavailable"
                  : `Balance: ${heldText}`}
            </p>
          )}
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
      {token.vmType === "evm" && (
        <div className="mt-2">
          {/* Two signatures on most ERC-20 routes: an approval, then the
              deposit. Saying so beforehand stops the second one looking like
              something went wrong. */}
          <Note tone="warn">Your wallet may ask twice — once to approve the token, once to send it.</Note>
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
    </form>
  );
};
