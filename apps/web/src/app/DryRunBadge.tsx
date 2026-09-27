import { useSendMode } from "../api/hooks";

/**
 * Floats bottom left, only while the API is in a dry run (SEND_MODE=simulate),
 * so nobody mistakes a simulated action for a real one. Outside the nav, which
 * stays exactly as designed.
 */
export const DryRunBadge = () => {
  const mode = useSendMode();
  if (mode.data !== "simulate") return null;
  return (
    <div
      role="status"
      title="SEND_MODE=simulate: transactions are signed and simulated against mainnet, never sent."
      className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-tint px-3 py-1.5 text-[12px] font-semibold text-warn"
    >
      <span className="size-[7px] rounded-full bg-warn" aria-hidden />
      Dry run
    </div>
  );
};
