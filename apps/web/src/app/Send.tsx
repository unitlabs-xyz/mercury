import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { PRESS } from "../motion/config";
import { Dialog } from "../ui/Dialog";
import { Alert, Close } from "../ui/icons";
import { CASH } from "./data";

const AVAILABLE = 4534.73;

export const Send = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");

  const value = Number(amount.replace(/[^0-9.]/g, ""));
  const overdrawn = value > AVAILABLE;
  const addressLooksWrong = to.length > 0 && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to.trim());
  const ready = value > 0 && !overdrawn && to.trim().length > 0 && !addressLooksWrong;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy="send-heading" className="max-w-[460px]">
      <form onSubmit={submit} className="relative p-7 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-shell hover:text-ink"
        >
          <Close className="size-[18px]" />
        </button>

        <h2 id="send-heading" className="text-[22px] font-semibold tracking-[-0.02em]">
          Send USDC
        </h2>
        <p className="mt-1.5 text-[14px] text-muted">{CASH.available} available. Solana network only.</p>

        <label className="mt-7 block">
          <span className="text-[13px] font-medium text-muted">Amount</span>
          <div
            className={`mt-2 flex items-center gap-2 rounded-xl border bg-shell px-4 py-3 ${
              overdrawn ? "border-down" : "border-cardline focus-within:border-brand"
            }`}
          >
            <span className="text-[18px] font-semibold text-faint">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount in USDC"
              aria-invalid={overdrawn}
              className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-faint"
            />
            <button
              type="button"
              onClick={() => setAmount(String(AVAILABLE))}
              className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[12px] font-semibold text-brand transition-colors hover:bg-brand-tint"
            >
              Max
            </button>
          </div>
          {overdrawn && (
            <span className="mt-2 flex items-center gap-1.5 text-[13px] text-down-deep">
              <Alert className="size-3.5" />
              More than you have. {CASH.available} available.
            </span>
          )}
        </label>

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-muted">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Solana address"
            aria-label="Destination Solana address"
            aria-invalid={addressLooksWrong}
            className={`mt-2 w-full rounded-xl border bg-shell px-4 py-3 font-mono text-[14px] outline-none placeholder:font-sans placeholder:text-faint ${
              addressLooksWrong ? "border-down" : "border-cardline focus-within:border-brand"
            }`}
          />
          {addressLooksWrong && (
            <span className="mt-2 flex items-center gap-1.5 text-[13px] text-down-deep">
              <Alert className="size-3.5" />
              That does not look like a Solana address.
            </span>
          )}
        </label>

        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-warn-tint px-4 py-3 text-[13px] leading-[1.5] text-warn">
          <Alert className="mt-px size-4 shrink-0" />
          Sending is final. Check the address — nobody can reverse it, including us.
        </p>

        <motion.button
          type="submit"
          disabled={!ready}
          whileTap={{ scale: ready ? 0.97 : 1 }}
          transition={PRESS}
          className="mt-6 w-full rounded-[10px] bg-brand py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-cardline disabled:text-faint"
        >
          Review send
        </motion.button>
      </form>
    </Dialog>
  );
};
