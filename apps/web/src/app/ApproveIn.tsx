import { approveIn, MERCURY_TIP } from "../api/signer-rules";

/**
 * Above an action's button when a linked wallet takes it: "You'll approve
 * this in Phantom." The button under it reads "Continue in Phantom", so
 * nobody is surprised by a pop-up from another app. Nothing for the Mercury
 * wallet, which approves in Mercury itself.
 */
export const ApproveIn = ({ approver }: { approver: string | null }) =>
  approver === null ? null : (
    <p className="mt-4 text-center text-[12px] text-ds-muted" role="note">
      {approveIn(approver)}
    </p>
  );

/**
 * Under the button, one quiet line that the same thing would be one tap from
 * the Mercury wallet: never a pop-up, never in the way of the button. Left off
 * where the action is the move into the Mercury wallet itself.
 */
export const MercuryTip = ({ approver }: { approver: string | null }) =>
  approver === null ? null : (
    <p className="mt-2 text-center text-[12px] text-ds-muted opacity-80" role="note">
      {MERCURY_TIP}
    </p>
  );
