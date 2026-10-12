import { useConnectWallet } from "@privy-io/react-auth";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { rawTokenAmount, tokenAmount } from "@mercury/view";
import { useMoney } from "../../api/hooks";
import { useFundAction, useFunderUsdc } from "../../api/fund";
import { SOLANA_CONNECT_OPTIONS, useFundingWallet } from "../../auth/embedded";
import { Button } from "../../ui/Button";
import { Alert, Check } from "../../ui/icons";

const USDC_DECIMALS = 6;

/** A soft note under a field: amber for a caution, red for something to fix. Set as `Send`. */
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

/** Enough of an address to recognise, which is all this is for. */
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Adding cash from a wallet somebody already holds.
 *
 * The lower half of Add cash when "From your wallet" is the chosen method, as
 * the address and its code are for "USDC on Solana".
 *
 * It exists because the address is the worse half of the same job. An address
 * is a thing somebody copies, switches app, pastes, and picks a token and a
 * network for — four chances to be wrong, which is why `useUsdcAck` makes them
 * agree to a rule before it will even show them the address. A transaction we
 * build has none of those chances: the mint is USDC and the network is Solana
 * because this wrote them, not because somebody chose correctly. So there is no
 * rule to agree to here, and nothing to warn about.
 */
export const FundFromWallet = () => {
  const money = useMoney();
  const to = money.data?.depositAddress;
  const { wallet, address } = useFundingWallet();
  const { connectWallet } = useConnectWallet();
  const balance = useFunderUsdc(address);
  const [amount, setAmount] = useState("");
  const action = useFundAction(to);
  const resetAction = action.reset;

  /* A different wallet is a different balance, so the amount typed against the
     old one is not an amount any more. */
  useEffect(() => {
    setAmount("");
    resetAction();
  }, [address, resetAction]);

  /*
   * `undefined` is a balance nobody could read, and it is not zero. Treating
   * the two alike is what showed "Balance: 0" against a wallet holding 5.69
   * while the RPC answered 429 to everything.
   */
  const held = balance.data;
  const heldText = tokenAmount((held ?? 0n).toString(), USDC_DECIMALS);
  const raw = rawTokenAmount(amount, USDC_DECIMALS);
  const malformed = amount.length > 0 && raw === null;
  const overdrawn = held !== undefined && raw !== null && raw > held;
  /*
   * An unreadable balance does not block the send. We cannot say the amount is
   * too much, and the wallet checks before it signs anyway — the same reason
   * the no-SOL case is left to it.
   */
  const ready = raw !== null && raw > 0n && !overdrawn && action.walletReady && to !== undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !action.isPending) action.mutate({ amountRaw: raw });
  };

  if (action.isSuccess) {
    return (
      <div className="flex flex-col items-center pt-6 pb-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <p className="mt-4 text-[20px] font-medium text-ds-ink">Sent from your wallet</p>
        <p className="mt-3 text-[14px] text-ds-muted">
          {amount} USDC. It lands in your balance within a few seconds.
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
    return (
      <div className="rounded-lg bg-ds-panel p-4">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Pay from a wallet you hold</p>
        <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
          Phantom, Backpack, Solflare — anything on Solana. You approve one transfer in your own wallet and
          the USDC arrives here. Nothing to copy, and no chance of sending the wrong token.
        </p>
        <Button
          variant="primary"
          onClick={() => connectWallet({ ...SOLANA_CONNECT_OPTIONS })}
          className="mt-4 w-full"
        >
          Connect a wallet
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-ds-panel px-4 py-3">
        <span className="min-w-0">
          <span className="block text-[12px] leading-none text-ds-muted">Paying from</span>
          <span className="mt-1.5 block font-mono text-[13px] leading-none text-ds-ink">
            {short(wallet.address)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void wallet.disconnect()}
          className="shrink-0 text-[12px] leading-none text-ds-muted hover:text-ds-ink hover:underline"
        >
          Disconnect
        </button>
      </div>

      <div className="mt-1 rounded-lg bg-ds-panel p-1">
        {/* The balance sits on the label's own line: it is what the amount is
            measured against, and it was a third line under the field saying so
            after the fact. */}
        <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
          <p className="text-[14px] leading-none text-ds-muted">Amount</p>
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
          <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount in USDC"
            aria-invalid={overdrawn}
            className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
          />
          {/* Nothing to offer when the balance could not be read, and offering
              zero would be a number we made up. */}
          {held !== undefined && (
            <button
              type="button"
              onClick={() => setAmount(heldText)}
              className="h-[26px] shrink-0 rounded-full border border-black/10 bg-linear-to-b from-white to-[#eeeeee] px-3 text-[12px] leading-none text-ds-ink"
            >
              Max
            </button>
          )}
          <span className="shrink-0 text-[12px] text-ds-muted">USDC</span>
        </label>
      </div>

      {overdrawn && (
        <div className="mt-2">
          {/* The same figure Max fills and the balance above shows. Rounded to
              cents it would read as more than the wallet can actually send. */}
          <Note tone="down">More than this wallet holds. {heldText} USDC available.</Note>
        </div>
      )}
      {malformed && (
        <div className="mt-2">
          <Note tone="down">Enter an amount in dollars and cents.</Note>
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
