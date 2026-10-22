/**
 * Earn's risks, in the words money going in is accepted under. `version` is
 * the server's `EARN_RISK_VERSION` (services/api/src/earn/risk.ts): change the
 * two together, and everyone is asked again before their next deposit or
 * switch. A draft until counsel has read it.
 */
export const RISKS = {
  version: "2026-10-22",
  points: [
    "Your USDC is lent out through a Kamino vault, run by its curator, not by Mercury.",
    "The rate changes every day, and can fall close to zero.",
    "A withdrawal is paid from cash the vault has not lent out. When it has lent nearly all of it, you may have to wait.",
    "If borrowers fail to repay or a protocol is exploited, you can lose money. Earn is not a bank account and is not insured.",
  ],
  accept: "I understand that money in Earn can be lost, and that it is not a bank account.",
} as const;

/** The risks and the box to tick, wherever money is about to go into a vault. */
export const RiskConsent = ({
  agreed,
  onAgreed,
  className = "",
}: {
  agreed: boolean;
  onAgreed: (agreed: boolean) => void;
  className?: string;
}) => (
  <div className={`rounded-lg bg-ds-panel px-4 py-4 ${className}`}>
    <p className="text-[14px] leading-[18px] font-medium text-ds-ink">Before you move cash in</p>
    <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-[1.45] text-ds-muted">
      {RISKS.points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
    <label className="mt-3.5 flex items-start gap-2.5 text-[12px] leading-[1.45] text-ds-ink">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(ev) => onAgreed(ev.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-black"
      />
      {RISKS.accept}
    </label>
  </div>
);
