import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActingWallet } from "../../api/acting-wallet";
import { ApiError } from "../../api/client";
import { usePortfolio } from "../../api/hooks";
import { useMovableTokens, usePrepareMove, useSignMove, type MoveAsk } from "../../api/move";
import { continueIn } from "../../api/signer-rules";
import { walletName } from "../../api/wallets";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import { Alert, Check } from "../../ui/icons";
import { Skeleton } from "../portfolio/ui";
import { ApproveIn } from "../ApproveIn";
import { costLine, moveCostLine, outcomeLine, pledgedLines, toRaw, type MovableToken } from "./move-lines";

/** A soft note: amber for a caution, red for something that went wrong. */
const Note = ({ tone, children }: { tone: "warn" | "down"; children: ReactNode }) => (
  <p
    role={tone === "down" ? "alert" : undefined}
    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-[1.45] ${
      tone === "warn" ? "bg-ds-warn-chip text-ds-chip-warn" : "bg-ds-down-chip text-ds-chip-down"
    }`}
  >
    <Alert className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

/** Each token's line as the person has it: chosen or not, and the amount typed. */
type Lines = Record<string, { readonly on: boolean; readonly text: string }>;

const linesFor = (tokens: readonly MovableToken[]): Lines =>
  Object.fromEntries(tokens.map((t) => [t.mint, { on: true, text: t.amount }]));

/** What the lines ask to move, or the first line that can't be read. */
const askOf = (
  tokens: readonly MovableToken[],
  lines: Lines,
): { ok: true; ask: MoveAsk } | { ok: false; bad: string | null } => {
  const ask: { mint: string; amountRaw: string }[] = [];
  for (const t of tokens) {
    const line = lines[t.mint];
    if (line === undefined || !line.on) continue;
    const raw = toRaw(line.text, t.decimals);
    if (raw === null || raw <= 0n || raw > BigInt(t.amountRaw)) return { ok: false, bad: t.mint };
    ask.push({ mint: t.mint, amountRaw: raw.toString() });
  }
  return ask.length === 0 ? { ok: false, bad: null } : { ok: true, ask };
};

/**
 * "Move to Mercury wallet": a linked wallet's tokens moved into the person's
 * own Mercury wallet, where everything is one tap and works on the phone too.
 *
 * Everything that can move is chosen, with amounts editable, and each stock
 * says whether its cost goes with it. What is pledged to a loan is listed
 * apart: it stays with the loan. Reviewing builds the move and says what it
 * costs; the linked wallet then approves every step at once.
 */
export const MoveSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { acting } = useActingWallet();
  const linked = acting.kind === "linked" ? acting.wallet : null;
  const tokens = useMovableTokens(open);
  const portfolio = usePortfolio();
  const prepare = usePrepareMove();
  const move = useSignMove();
  const [lines, setLines] = useState<Lines>({});
  const filledFor = useRef<string | null>(null);
  const submitting = useRef(false);

  // Filled once per wallet, when its list arrives: what the person edits is not overwritten by a refresh.
  useEffect(() => {
    if (!tokens.data || linked === null || filledFor.current === linked.id) return;
    filledFor.current = linked.id;
    setLines(linesFor(tokens.data.tokens));
  }, [tokens.data, linked]);

  const close = () => {
    onClose();
    // Ready for next time, once it has slid away.
    setTimeout(() => {
      prepare.reset();
      move.reset();
      filledFor.current = null;
    }, 300);
  };

  const holdings = portfolio.data?.holdings ?? [];
  const pledged = pledgedLines(holdings);
  const list = tokens.data?.tokens ?? [];
  const asked = askOf(list, lines);
  const prepared = prepare.data;
  const name = linked === null ? null : walletName(linked);

  const review = () => {
    if (asked.ok) prepare.mutate(asked.ask);
  };
  const confirm = () => {
    if (prepared === undefined || submitting.current) return;
    submitting.current = true;
    void move
      .mutateAsync(prepared)
      .catch(() => undefined)
      .finally(() => {
        submitting.current = false;
      });
  };

  const title = move.isSuccess ? "Move sent" : prepared ? "Review move" : "Move to Mercury wallet";

  return (
    <SidePanel open={open} onClose={close} labelledBy="move-heading">
      <PanelHeader
        id="move-heading"
        title={title}
        sub={
          linked === null || move.isSuccess
            ? undefined
            : `From ${name} to your Mercury wallet, where you can trade in one tap, here and on your phone.`
        }
        onClose={close}
        {...(prepared && !move.isSuccess && !move.isPending ? { onBack: () => prepare.reset() } : {})}
      />

      {linked === null ? (
        <div className="px-6 pt-5 pb-6">
          <Note tone="warn">Choose a linked wallet to move from. Your Mercury wallet is where moves go.</Note>
        </div>
      ) : move.isSuccess ? (
        <div className="flex flex-col items-center px-6 pt-10 pb-6 text-center">
          {move.data.kind !== "partial" && (
            <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
              <Check className="size-5" />
            </span>
          )}
          <p className="mt-4 text-[15px] text-ds-ink" role="status">
            {outcomeLine(move.data)}
          </p>
          <Button variant="primary" size="lg" onClick={close} className="mt-7 w-full">
            Done
          </Button>
        </div>
      ) : prepared ? (
        <div className="flex flex-col px-6 pt-5 pb-6">
          <ul className="flex flex-col gap-2.5 rounded-lg bg-ds-panel px-4 py-4 text-[14px]">
            {(asked.ok ? asked.ask : []).map((a) => {
              const t = list.find((x) => x.mint === a.mint)!;
              return (
                <li key={a.mint} className="flex justify-between gap-3">
                  <span className="text-ds-muted">{t.symbol}</span>
                  <span className="font-medium text-ds-ink">{lines[a.mint]?.text}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] leading-[1.45] text-ds-muted">{moveCostLine(prepared)}</p>
          {prepared.transactions.length > 1 && (
            <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted">
              {name} shows this as {prepared.transactions.length} small transactions, approved together.
            </p>
          )}
          {move.isError && (
            <div className="mt-4">
              <Note tone="down">{move.error.message}</Note>
            </div>
          )}
          <ApproveIn approver={name} />
          <Button
            variant="primary"
            size="lg"
            loading={move.isPending}
            onClick={confirm}
            className="mt-3 w-full"
          >
            {continueIn(name!)}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col px-6 pt-5 pb-6">
          {tokens.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : tokens.isError ? (
            <Note tone="down">This wallet's tokens couldn't be read. Try again in a moment.</Note>
          ) : tokens.data?.available === false ? (
            <Note tone="warn">Moving isn't available right now.</Note>
          ) : list.length === 0 ? (
            <p className="text-[14px] text-ds-muted">
              {name} holds nothing Mercury lists, so there's nothing to move.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((t) => {
                const line = lines[t.mint] ?? { on: true, text: t.amount };
                const bad = !asked.ok && asked.bad === t.mint;
                const cost = costLine(t, holdings);
                return (
                  <li key={t.mint} className="rounded-lg bg-ds-panel px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={line.on}
                        aria-label={`Move ${t.symbol}`}
                        onChange={(e) =>
                          setLines((l) => ({ ...l, [t.mint]: { ...line, on: e.target.checked } }))
                        }
                        className="size-4 accent-black"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-ds-ink">{t.symbol}</p>
                        <p className="truncate text-[12px] text-ds-muted">
                          {t.name} · {t.amount} held
                        </p>
                      </div>
                      <input
                        inputMode="decimal"
                        value={line.text}
                        disabled={!line.on}
                        aria-label={`${t.symbol} to move`}
                        aria-invalid={bad}
                        onChange={(e) =>
                          setLines((l) => ({ ...l, [t.mint]: { ...line, text: e.target.value } }))
                        }
                        className={`h-9 w-28 rounded-md bg-white px-2.5 text-right text-[14px] text-ds-ink outline-1 disabled:opacity-50 ${
                          bad ? "outline-ds-down" : "outline-transparent focus:outline-black/10"
                        }`}
                      />
                    </div>
                    {cost !== null && <p className="mt-2 pl-7 text-[12px] text-ds-muted">{cost}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          {pledged.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] font-medium text-ds-muted">Pledged to a loan</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ds-ink">
                {pledged.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {!asked.ok && asked.bad !== null && (
            <div className="mt-4">
              <Note tone="down">
                An amount can't be more than this wallet holds, or have more decimals than the token.
              </Note>
            </div>
          )}
          {prepare.isError && (
            <div className="mt-4">
              <Note tone="down">
                {prepare.error instanceof ApiError
                  ? prepare.error.message
                  : "The move couldn't be built. Try again."}
              </Note>
            </div>
          )}

          {list.length > 0 && (
            <Button
              variant="primary"
              size="lg"
              loading={prepare.isPending}
              disabled={!asked.ok}
              onClick={review}
              className="mt-6 w-full"
            >
              Review move
            </Button>
          )}
        </div>
      )}
    </SidePanel>
  );
};
