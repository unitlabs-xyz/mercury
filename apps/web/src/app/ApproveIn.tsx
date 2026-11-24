import { approveIn, MERCURY_TIP } from "../api/signer-rules";

/**
 * Above an action's button when a linked wallet takes it: "You'll approve
 * this in Phantom." The button beside it reads "Continue in Phantom", so
 * nobody is surprised by a pop-up from another app. Nothing for the Mercury
 * wallet, which approves in Mercury itself.
 *
 * Under it, one quiet line that the same thing would be one tap from the
 * Mercury wallet: never a pop-up, never in the way of the button. Left off
 * where the action is the move into the Mercury wallet itself.
 */
export const ApproveIn = ({ approver, tip = true }: { approver: string | null; tip?: boolean }) =>
  approver === null ? null : (
    <div className="mt-4 flex flex-col gap-1 text-center text-[12px]" role="note">
      <p className="text-ds-muted">{approveIn(approver)}</p>
      {tip && <p className="text-ds-muted opacity-80">{MERCURY_TIP}</p>}
    </div>
  );
