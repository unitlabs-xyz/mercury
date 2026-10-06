import { RailCard, RailHead } from "../../ui/ds";
import { Button } from "../../ui/Button";

interface Props {
  name: string;
  assetCount: number;
  portfolio: { portfolioId: string } | null;
  signedIn: boolean;
  busy: boolean;
  checking?: boolean | undefined;
  blocked?: boolean | undefined;
  error?: string | undefined;
  onReview: () => void;
}

/** Same rail dimensions as the Invest ticket; only its state and copy change. */
export const EnrollmentRail = ({ name, assetCount, portfolio, signedIn, busy, checking = false, blocked = false, error, onReview }: Props) => {
  const enrolled = portfolio !== null;
  return (
    <RailCard label="Invest in strategy">
      <RailHead title={`${enrolled ? "Fund" : "Enroll in"} ${name}`} meta={enrolled ? "Enrolled" : "Solana"} />
      <div className="mt-5 min-h-[102px] rounded-lg bg-ds-panel p-4 text-[13px]">
        <p className="font-medium text-ds-ink">
          {enrolled ? "Your Glider portfolio is ready" : signedIn ? "Your own portfolio, not a basket token" : "Sign in to enroll"}
        </p>
        <p className="mt-2 leading-relaxed text-ds-muted">
          {error ?? (enrolled
            ? "Fund it with USDC on Solana. Your assets stay in your own smart account."
            : signedIn
              ? "Sign to create your own Glider smart account. No USDC is invested during enrollment; network fees may apply."
              : "Connect your Solana wallet to create a Glider portfolio for this strategy.")}
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between text-[12px]">
        <span className="text-ds-muted">Target assets</span>
        <span className="font-medium text-ds-ink">{assetCount}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="text-ds-muted">Funding</span>
        <span className="font-medium text-ds-ink">{enrolled ? "USDC on Solana" : "After enrollment"}</span>
      </div>
      <Button
        variant="primary"
        size="lg"
        onClick={onReview}
        disabled={enrolled || !signedIn || busy || checking || blocked}
        className="mt-6 w-full"
      >
        {enrolled ? "Fund with USDC" : checking ? "Checking portfolio…" : blocked ? "Portfolio unavailable" : busy ? "Preparing enrollment…" : !signedIn ? "Sign in to enroll" : "Review enrollment"}
      </Button>
    </RailCard>
  );
};
