import { useState } from "react";
import { useActingWallet } from "../../api/acting-wallet";
import { ApiError } from "../../api/client";
import { useSetCost } from "../../api/cost";
import { Button } from "../../ui/Button";

/** Dollars per share as a person types them: digits, and up to twelve places after the point. */
const COST = /^\d{1,9}(\.\d{1,12})?$/;

/**
 * Under a holding whose cost is estimated: where the estimate came from, and
 * "Set cost" to replace it with what the person paid. What they enter always
 * wins over an estimate, and never touches a cost that is exact.
 *
 * For one wallet at a time: under every wallet together it asks for one, as
 * the server does, since a cost for all would not say whose shares it was.
 */
export const SetCost = ({ ticker, line }: { ticker: string; line: string | null }) => {
  const { acting } = useActingWallet();
  const save = useSetCost(ticker);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (line === null) return null;

  const valid = COST.test(text.trim()) && Number(text) > 0;
  const error =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? "That didn't save. Try again."
        : null;

  return (
    <div className="mt-1 flex flex-col gap-3 rounded-lg bg-ds-panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] leading-[1.45] text-ds-muted">
          <span className="font-semibold text-ds-ink">~</span> {line}.
        </p>
        {acting.kind === "all" ? (
          <p className="text-[12px] text-ds-muted">Choose a wallet to set what you paid.</p>
        ) : save.isSuccess ? (
          <p className="text-[12px] font-medium text-ds-ink" role="status">
            Saved. Updating your figures…
          </p>
        ) : (
          !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-ds-ink transition-colors hover:bg-white/70"
            >
              Set cost
            </button>
          )
        )}
      </div>

      {open && acting.kind !== "all" && !save.isSuccess && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(text.trim());
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-ds-muted">
            What you paid per share
            <span className="flex items-center rounded-lg bg-white px-3">
              <span className="text-ds-muted">$</span>
              <input
                inputMode="decimal"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="0.00"
                aria-invalid={text !== "" && !valid}
                className="h-10 w-full min-w-0 bg-transparent px-1.5 text-[14px] text-ds-ink outline-none"
              />
            </span>
          </label>
          <Button type="submit" variant="primary" size="md" disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setOpen(false);
              setText("");
              save.reset();
            }}
          >
            Cancel
          </Button>
          {error !== null && <p className="w-full text-[12px] text-ds-loss">{error}</p>}
        </form>
      )}
    </div>
  );
};
