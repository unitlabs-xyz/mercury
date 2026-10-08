import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMoney } from "../api/hooks";
import { SendSubmissionUncertain, useSendAction } from "../api/send";
import { D } from "@mercury/core";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { Alert, Check } from "../ui/icons";
import { usd } from "@mercury/view";

/** A soft note under a field: amber for a caution, red for something to fix. */
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

/**
 * Sending USDC, as a side panel set like borrowing: the amount in a white well
 * on the grey panel with Max beside it, the address in a matching well, the
 * one rule that cannot be undone, then the single action.
 */
export const Send = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const money = useMoney();
  const available = Number(money.data?.balanceUsd ?? 0);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const submitting = useRef(false);
  const action = useSendAction();
  const resetAction = action.reset;

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setTo("");
    setReviewing(false);
    resetAction();
  }, [open, resetAction]);

  const validAmount = /^\d+(?:\.\d{1,6})?$/.test(amount);
  const value = validAmount ? Number(amount) : 0;
  const amountLooksWrong = amount.length > 0 && !validAmount;
  const overdrawn = validAmount && D(amount).gt(money.data?.balanceUsd ?? "0");
  const addressLooksWrong = to.length > 0 && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to.trim());
  const ready = validAmount && value > 0 && !overdrawn && to.trim().length > 0 && !addressLooksWrong;

  const close = () => {
    if (!action.isPending) onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setReviewing(true);
  };

  const confirm = () => {
    if (submitting.current) return;
    submitting.current = true;
    void action
      .mutateAsync({ amount, to: to.trim() })
      .catch(() => undefined)
      .finally(() => {
        submitting.current = false;
      });
  };

  return (
    <SidePanel open={open} onClose={close} labelledBy="send-heading">
      <PanelHeader
        id="send-heading"
        title={action.isSuccess ? "USDC sent" : reviewing ? "Review transfer" : "Send USDC"}
        sub={action.isSuccess ? undefined : `${usd(money.data?.balanceUsd)} available. Solana network only.`}
        onClose={close}
      />

      {action.isSuccess ? (
        <div className="flex flex-col items-center px-6 pt-10 pb-6 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
            <Check className="size-5" />
          </span>
          <p className="mt-4 text-[20px] font-medium text-ds-ink">
            {action.data.status === "confirmed" ? "Transfer confirmed" : "Transfer submitted"}
          </p>
          <p className="mt-3 text-[14px] text-ds-muted">
            {usd(value)} USDC to {to.trim()}
          </p>
          {action.data.status === "pending" && (
            <p className="mt-2 text-[13px] text-ds-muted">Confirmation is still pending.</p>
          )}
          <a
            href={`https://solscan.io/tx/${encodeURIComponent(action.data.signature)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-[13px] text-ds-link hover:underline"
          >
            View transaction ↗
          </a>
          <Button variant="primary" size="lg" onClick={close} className="mt-7 w-full">
            Done
          </Button>
        </div>
      ) : reviewing ? (
        <div className="flex flex-col px-6 pt-5 pb-6">
          <div className="rounded-lg bg-ds-panel px-4 py-4 text-[14px]">
            <div className="flex justify-between gap-3">
              <span className="text-ds-muted">You send</span>
              <span className="font-medium text-ds-ink">{usd(value)} USDC</span>
            </div>
            <p className="mt-4 text-ds-muted">To this Solana wallet</p>
            <p className="mt-1 break-all font-mono text-[12px] text-ds-ink">{to.trim()}</p>
          </div>
          <div className="mt-4">
            <Note tone="warn">
              Check the address carefully. Sending is final, and your wallet pays the Solana network fee.
            </Note>
          </div>
          {action.isError && (
            <div className="mt-4" role="alert">
              <Note tone={action.error instanceof SendSubmissionUncertain ? "warn" : "down"}>
                {action.error.message}
              </Note>
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setReviewing(false)}
              disabled={action.isPending}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={action.isPending}
              disabled={!action.walletReady || action.error instanceof SendSubmissionUncertain}
              onClick={confirm}
              className="min-w-0 flex-1"
            >
              {action.walletReady ? "Sign and send" : "Waiting for wallet…"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col px-6 pt-5 pb-6">
          <div className="rounded-lg bg-ds-panel p-1">
            <p className="px-3 pt-2 pb-2.5 text-[14px] leading-none text-ds-muted">Amount</p>
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
              <button
                type="button"
                onClick={() => setAmount(money.data?.balanceUsd ?? "")}
                className="h-[26px] shrink-0 rounded-full border border-black/10 bg-linear-to-b from-white to-[#eeeeee] px-3 text-[12px] leading-none text-ds-ink"
              >
                Max
              </button>
              <span className="shrink-0 text-[12px] text-ds-muted">USDC</span>
            </label>
            <p className="px-3 pt-2.5 pb-2 text-[12px] leading-[1.4] text-ds-muted">
              {usd(available)} available to send
            </p>
          </div>
          {overdrawn && (
            <div className="mt-2">
              <Note tone="down">More than you have. {usd(available)} available.</Note>
            </div>
          )}
          {amountLooksWrong && (
            <div className="mt-2">
              <Note tone="down">Enter a USDC amount with at most six decimal places.</Note>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-ds-panel p-1">
            <p className="px-3 pt-2 pb-2.5 text-[14px] leading-none text-ds-muted">To</p>
            <label
              className={`flex h-12 items-center rounded-md bg-white px-4 outline-1 ${
                addressLooksWrong ? "outline-ds-down" : "outline-transparent focus-within:outline-black/10"
              }`}
            >
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Solana address"
                aria-label="Destination Solana address"
                aria-invalid={addressLooksWrong}
                spellCheck={false}
                autoComplete="off"
                className="w-full min-w-0 bg-transparent font-mono text-[13px] text-ds-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-ds-muted/70"
              />
            </label>
            <p className="px-3 pt-2.5 pb-2 text-[12px] leading-[1.4] text-ds-muted">
              A wallet on Solana that accepts USDC
            </p>
          </div>
          {addressLooksWrong && (
            <div className="mt-2">
              <Note tone="down">That does not look like a Solana address.</Note>
            </div>
          )}

          <div className="mt-4">
            <Note tone="warn">Sending is final. Check the address: nobody can reverse it, including us.</Note>
          </div>

          <Button type="submit" variant="primary" size="lg" disabled={!ready} className="mt-6 w-full">
            {value > 0 && !overdrawn ? `Review send of ${usd(value)}` : "Review send"}
          </Button>
        </form>
      )}
    </SidePanel>
  );
};
