import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Alert, Check } from "../../ui/icons";

interface Props {
  open: boolean;
  name: string;
  assetCount: number;
  walletReady: boolean;
  busy: boolean;
  completed: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

export const EnrollmentSheet = ({ open, name, assetCount, walletReady, busy, completed, error, onClose, onConfirm }: Props) => (
  <Dialog open={open} onClose={onClose} labelledBy="basket-enrollment-title" className="max-w-[520px]">
    {completed ? (
      <div className="px-6 py-10 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
          <Check className="size-5" />
        </span>
        <h2 id="basket-enrollment-title" className="mt-4 text-[20px] font-medium text-ds-ink">Portfolio ready</h2>
        <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-[1.45] text-ds-muted">
          Your {name} portfolio is enrolled. Funding with USDC is a separate step and is not available yet.
        </p>
        <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">Done</Button>
      </div>
    ) : (
      <>
        <div className="px-6 pt-6 pb-6">
          <h2 id="basket-enrollment-title" className="text-[20px] font-medium text-ds-ink">Enroll in {name}</h2>
          <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
            Review this step before signing with your Solana wallet.
          </p>
          <dl className="mt-6 rounded-lg bg-ds-panel px-4 py-4 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ds-muted">Strategy</dt>
              <dd className="text-right font-medium text-ds-ink">{name}</dd>
            </div>
            <div className="mt-3 flex justify-between gap-4">
              <dt className="text-ds-muted">Composition</dt>
              <dd className="font-medium text-ds-ink">{assetCount} target assets</dd>
            </div>
            <div className="mt-3 flex justify-between gap-4">
              <dt className="text-ds-muted">Ownership</dt>
              <dd className="text-right font-medium text-ds-ink">Your Glider smart account</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
            No USDC is invested now. Enrollment creates your own portfolio; depositing and buying assets come later. Your wallet may ask you to sign, and network fees may apply.
          </p>
          {!walletReady && <p className="mt-3 text-[12px] text-ds-muted">Waiting for your Solana wallet before enrollment can continue.</p>}
          {error && (
            <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
              <Alert className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2.5 border-t border-ds-divider px-6 py-4">
          <Button size="lg" onClick={onClose} disabled={busy} className="flex-1">Cancel</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={!walletReady} onClick={onConfirm} className="flex-[1.6]">Enroll now</Button>
        </div>
      </>
    )}
  </Dialog>
);
