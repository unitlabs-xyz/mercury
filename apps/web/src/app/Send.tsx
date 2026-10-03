import { useState, type FormEvent, type ReactNode } from "react";
import { useMoney } from "../api/hooks";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { Alert } from "../ui/icons";
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

  const value = Number(amount.replace(/[^0-9.]/g, ""));
  const overdrawn = value > available;
  const addressLooksWrong = to.length > 0 && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to.trim());
  const ready = value > 0 && !overdrawn && to.trim().length > 0 && !addressLooksWrong;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onClose();
  };

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="send-heading">
      <PanelHeader
        id="send-heading"
        title="Send USDC"
        sub={`${usd(money.data?.balanceUsd)} available. Solana network only.`}
        onClose={onClose}
      />

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
              onClick={() => setAmount(String(available))}
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
    </SidePanel>
  );
};
