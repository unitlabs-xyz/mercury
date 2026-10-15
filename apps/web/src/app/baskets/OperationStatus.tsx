import type { BasketOperation } from "@mercury/types";
import { StatusChip, type Tone } from "../../ui/ds";

/* The chip carries the state on its own: amber while work runs, green once it lands, red when it stops. */
const TONE: Record<"running" | "completed" | "failed" | "unavailable", Tone> = {
  running: "pending",
  completed: "up",
  failed: "down",
  unavailable: "warn",
};

const capitalized = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

export const OperationStatus = ({
  name,
  state,
  label,
  unavailable = false,
}: {
  /** Omitted where the surrounding row already names the operation. */
  name?: string;
  state: BasketOperation["state"] | undefined;
  label: string;
  unavailable?: boolean;
}) => {
  const key = unavailable
    ? "unavailable"
    : state === "completed"
      ? "completed"
      : state === "failed" || state === "cancelled"
        ? "failed"
        : "running";

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      {name && <span className="text-ds-muted">{name}</span>}
      <StatusChip tone={TONE[key]}>{capitalized(label)}</StatusChip>
    </div>
  );
};
