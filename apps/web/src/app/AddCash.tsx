import { useState, type ReactNode } from "react";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { StatusChip } from "../ui/ds";
import { DepositAddress } from "./Receive";

type Method = {
  key: string;
  title: string;
  sub: string;
  /** Right-hand figure: how fast or how much it costs. */
  figure: string;
  note: string;
  icon: ReactNode;
  /** Not live yet: shown so people know it is coming, but cannot be picked. */
  soon?: boolean;
};

/** The method's mark: a 32px circle with a line icon, as the list rows' logos sit. */
const Glyph = ({ children }: { children: ReactNode }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ds-ink outline-1 outline-black/5">
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" aria-hidden>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  </span>
);

const METHODS: readonly Method[] = [
  {
    key: "solana",
    title: "USDC on Solana",
    sub: "From any wallet or exchange",
    figure: "Instant",
    note: "No fee",
    icon: (
      <Glyph>
        <path d="M4.5 4.5h8M3.5 8h8M4.5 11.5h8" />
      </Glyph>
    ),
  },
  {
    key: "bank",
    title: "Bank transfer",
    sub: "ACH or wire from a US bank, through Bridge",
    figure: "1–2 days",
    note: "Coming soon",
    soon: true,
    icon: (
      <Glyph>
        <path d="M2.5 6 8 3l5.5 3M3.5 6.5v5M6.5 6.5v5M9.5 6.5v5M12.5 6.5v5M2.5 13h11" />
      </Glyph>
    ),
  },
  {
    key: "card",
    title: "Debit card",
    sub: "Visa or Mastercard, through Bridge",
    figure: "Instant",
    note: "Coming soon",
    soon: true,
    icon: (
      <Glyph>
        <rect x="2" y="4" width="12" height="8.5" rx="1.5" />
        <path d="M2 7h12M4.5 10h2" />
      </Glyph>
    ),
  },
  {
    key: "networks",
    title: "USDC on another network",
    sub: "Ethereum, Base or Arbitrum, moved to Solana for you",
    figure: "Minutes",
    note: "Coming soon",
    soon: true,
    icon: (
      <Glyph>
        <circle cx="5" cy="8" r="2.5" />
        <circle cx="11" cy="8" r="2.5" />
        <path d="M7.5 8h1" />
      </Glyph>
    ),
  },
];

/**
 * Adding cash, as a side panel: every way in as a row, the one that works
 * today first and chosen, the ones coming through Bridge marked Soon; under
 * them, the details of the chosen way (for Solana, the address and its code).
 */
export const AddCash = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [pick, setPick] = useState("solana");
  return (
    <SidePanel open={open} onClose={onClose} labelledBy="add-cash-heading">
      <PanelHeader
        id="add-cash-heading"
        title="Add cash"
        sub="It starts earning the moment it arrives."
        onClose={onClose}
      />
      <div className="px-6 pt-5 pb-6">
        <div
          role="radiogroup"
          aria-label="How to add cash"
          className="flex flex-col gap-1 rounded-lg bg-ds-panel p-1"
        >
          {METHODS.map((m) => {
            const on = pick === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={m.soon}
                disabled={m.soon}
                onClick={() => setPick(m.key)}
                className={`flex h-15 items-center gap-3 rounded-md px-3 text-left transition-colors disabled:cursor-not-allowed ${
                  on ? "bg-white outline-1 outline-black/10" : m.soon ? "" : "hover:bg-white/60"
                }`}
              >
                <span className={m.soon ? "opacity-60" : undefined}>{m.icon}</span>
                <span className={`min-w-0 flex-1 ${m.soon ? "opacity-60" : ""}`}>
                  <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                    {m.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">{m.sub}</span>
                </span>
                <span className="shrink-0 text-right">
                  {m.soon ? (
                    <StatusChip tone="neutral" size="md">
                      Soon
                    </StatusChip>
                  ) : (
                    <>
                      <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                        {m.figure}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{m.note}</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {pick === "solana" && (
          <div className="mt-6">
            <p className="text-[14px] leading-none font-medium text-ds-ink">Send USDC to this address</p>
            <div className="mt-3">
              <DepositAddress />
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
};
