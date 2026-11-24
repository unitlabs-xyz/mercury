import { approveIn } from "../api/signer-rules";

/**
 * Above an action's button when a linked wallet takes it: "You'll approve
 * this in Phantom." The button beside it reads "Continue in Phantom", so
 * nobody is surprised by a pop-up from another app. Nothing for the Mercury
 * wallet, which approves in Mercury itself.
 */
export const ApproveIn = ({ approver }: { approver: string | null }) =>
  approver === null ? null : (
    <p className="mt-4 text-center text-[12px] text-ds-muted" role="note">
      {approveIn(approver)}
    </p>
  );
