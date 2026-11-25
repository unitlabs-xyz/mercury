import { Link } from "react-router-dom";
import {
  STAGES,
  STAGE_LABEL,
  alarmFor,
  fallUntil,
  otherAlarmLine,
  otherAlarms,
  usd,
  type Alarm,
  type OtherAlarm,
} from "@mercury/view";
import { useActingWallet } from "../api/acting-wallet";
import { useBorrow, type Health } from "../api/borrow";
import { usePortfolioSummary } from "../api/hooks";
import { walletName } from "../api/wallets";
import { Alert, ChevronRight } from "../ui/icons";

/**
 * The loan's alarm, on every screen while it matters. A margin call should not
 * wait for someone to open the right page; it should be the first thing they
 * see anywhere in the app.
 *
 * The chosen wallet's loan gets the whole of it: where the loan is on the road
 * from healthy to a sale, how far a fall would take it to the next stage, and
 * the repayment that walks it back. A loan in trouble in any other wallet gets
 * a line of its own and a way to go to it, so looking at one wallet, or at all
 * of them, never hides another's margin call.
 */
export const LoanAlert = () => {
  const { acting, choose, linked } = useActingWallet();
  const borrow = useBorrow();
  const summary = usePortfolioSummary(linked.length > 0);

  const owner = acting.kind === "linked" ? walletName(acting.wallet) : null;
  const alarm = borrow.data ? alarmFor(borrow.data, owner) : null;
  const shown =
    acting.kind === "all" ? null : acting.kind === "linked" ? acting.wallet.id : (acting.wallet?.id ?? null);
  const others = summary.data ? otherAlarms(summary.data.wallets, shown, walletName) : [];
  if (alarm === null && others.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {alarm && <ChosenAlarm alarm={alarm} />}
      {others.map((o) => (
        <OtherLine key={o.id} alarm={o} onGo={() => choose(o.isPrimary ? null : o.id)} />
      ))}
    </div>
  );
};

/** Each stage's own colour: the road reads from calm to alarm whatever the loan's state. */
const STAGE_DOT: Record<Health, string> = {
  healthy: "bg-up",
  over_limit: "bg-warn",
  margin_call: "bg-down",
  liquidation: "bg-down-deep",
};

const TONE = {
  down: {
    box: "border-down-line bg-down-tint",
    ink: "text-down-deep",
    button: "bg-down hover:bg-down-deep",
    chip: "bg-white text-down-deep",
  },
  warn: {
    box: "border-warn-line bg-warn-tint",
    ink: "text-warn",
    button: "bg-warn hover:opacity-90",
    chip: "bg-white text-warn",
  },
} as const;

/**
 * The chosen wallet's alarm. Its Repay button repays from that wallet, the
 * Mercury wallet or a linked one, which approves in its own pop-up.
 */
const ChosenAlarm = ({ alarm }: { alarm: Alarm }) => {
  const tone = TONE[alarm.tone];
  /*
   * Three columns: the icon, everything said about the loan, and what to do
   * about it. The road and the note sit in the middle column, so the title,
   * the body, the road and the note all share one left edge and one width.
   */
  return (
    <section
      role={alarm.tone === "down" ? "alert" : "status"}
      aria-label={alarm.title}
      className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-2xl border px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 ${tone.box}`}
    >
      <Alert className={`mt-0.5 size-4 shrink-0 ${tone.ink}`} />
      <div className="min-w-0">
        <p className={`text-[14px] font-semibold ${tone.ink}`}>{alarm.title}</p>
        <p className="mt-1 max-w-[70ch] text-[12px] leading-[1.5] text-ds-ink/80">{alarm.body}</p>
        <Road alarm={alarm} />
      </div>
      <div className="col-start-2 mt-4 flex items-start gap-2 sm:col-start-3 sm:mt-0">
        <Link
          to="/money"
          className="rounded-lg bg-white/70 px-3.5 py-2 text-[12px] font-semibold whitespace-nowrap text-ds-ink transition-colors hover:bg-white"
        >
          View loan
        </Link>
        <Link
          to="?borrow=repay"
          className={`rounded-lg px-3.5 py-2 text-[12px] font-semibold whitespace-nowrap text-white transition-colors ${tone.button}`}
        >
          {alarm.repayUsd === null ? "Repay" : `Repay ${usd(alarm.repayUsd)}`}
        </Link>
      </div>
    </section>
  );
};

/**
 * The road a loan goes down as prices fall: healthy, over the limit, a margin
 * call, then Kamino selling. The loan's stage is marked, the stages behind it
 * are lit in their own colours, and the gap to the next one carries the fall
 * that would close it. Every stage is named, so none of it is colour alone.
 */
const Road = ({ alarm }: { alarm: Alarm }) => {
  const here = STAGES.indexOf(alarm.stage);
  const tone = TONE[alarm.tone];
  return (
    <ol
      className="mt-4 grid grid-cols-4"
      aria-label={`${STAGE_LABEL[alarm.stage]} now${alarm.next ? `; a ${fallUntil(alarm.next)}` : ""}`}
    >
      {STAGES.map((stage, i) => {
        const reached = i <= here;
        const current = i === here;
        return (
          <li key={stage} className="relative min-w-0 pt-7">
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-[31px] right-0 left-3 h-[2px] rounded-full ${
                  i < here ? STAGE_DOT[STAGES[i + 1]!] : "bg-black/10"
                }`}
              />
            )}
            {current && alarm.next && i < STAGES.length - 1 && (
              <span
                className={`absolute top-0 left-3 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone.chip}`}
              >
                {fallUntil(alarm.next)}
              </span>
            )}
            <span aria-hidden className="absolute top-[26px] left-0 grid size-3 place-items-center">
              {current && (
                <span
                  className={`absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping ${STAGE_DOT[stage]}`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full ${current ? "size-3" : "size-2.5"} ${
                  reached ? STAGE_DOT[stage] : "bg-black/15"
                }`}
              />
            </span>
            <p
              className={`mt-3 truncate pr-2 text-[11px] ${
                current ? "font-semibold text-ds-ink" : reached ? "text-ds-ink/70" : "text-ds-muted"
              }`}
            >
              {STAGE_LABEL[stage]}
            </p>
            {current && <p className="text-[10px] text-ds-muted">You're here</p>}
          </li>
        );
      })}
    </ol>
  );
};

/** Another wallet's loan in trouble: whose, how bad, and a way to go to it. */
const OtherLine = ({ alarm, onGo }: { alarm: OtherAlarm; onGo: () => void }) => {
  const tone = TONE[alarm.health === "over_limit" ? "warn" : "down"];
  return (
    <div
      role={alarm.health === "over_limit" ? "status" : "alert"}
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 ${tone.box}`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${STAGE_DOT[alarm.health]}`} />
      <p className={`min-w-0 flex-1 text-[13px] font-medium ${tone.ink}`}>{otherAlarmLine(alarm)}</p>
      <button
        type="button"
        onClick={onGo}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ds-ink transition-colors hover:bg-white"
      >
        Go to {alarm.isPrimary ? "Mercury" : alarm.name}
        <ChevronRight className="size-3" />
      </button>
    </div>
  );
};
