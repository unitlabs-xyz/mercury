import { useState } from "react";
import { Bar, Button, Card, Screen, SectionTitle, Sheet, Stat, StatGroup } from "../ui/primitives";
import { CASH_USD, HOLDINGS, INTEREST_YTD, YIELD_APR } from "../mock/data";
import { bareP, usd } from "../lib/format";

const ADDRESS = "7xKXtg2CW3mFQvPCnAyaNiTiqTwj7BpVrBcT4mVYJGqk";

export function Money() {
  const [sheet, setSheet] = useState<null | "receive" | "send">(null);
  const invested = HOLDINGS.reduce((a, h) => a + h.valueUsd, 0);
  const borrowingPower = invested * 0.5;

  return (
    <Screen>
      <Bar title="Money" />

      <section className="px-4 pt-3 enter">
        <p className="micro m-0">Cash available</p>
        <p className="figure m-0 mt-1 text-[44px] leading-none">{usd(CASH_USD)}</p>
        <p className="num m-0 mt-2 text-[15px] text-[var(--color-up)]">
          {bareP(YIELD_APR)} a year <span className="opacity-60">· {usd(INTEREST_YTD)} earned in 2026</span>
        </p>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-2.5 px-4 enter" style={{ animationDelay: "50ms" }}>
        <Button variant="ghost" onClick={() => setSheet("receive")}>Receive</Button>
        <Button variant="ghost" onClick={() => setSheet("send")}>Send</Button>
      </section>

      <section className="mt-6 enter" style={{ animationDelay: "100ms" }}>
        <SectionTitle>Earning while it waits</SectionTitle>
        <div className="px-4">
          <StatGroup>
            <Stat k="Rate" v={`${bareP(YIELD_APR)} a year`} tone="up" />
            <Stat k="Earned this year" v={usd(INTEREST_YTD)} />
            <Stat k="Paid" v="Continuously" />
          </StatGroup>
          <p className="m-0 mt-3 text-[13px] leading-snug text-[var(--color-faint)]">
            Cash you have not invested earns in the background. It stays available, and you can spend or invest it at any
            moment.
          </p>
        </div>
      </section>

      <section className="mt-6 enter" style={{ animationDelay: "150ms" }}>
        <SectionTitle>Coming next</SectionTitle>
        <div className="px-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <p className="m-0 text-[16px] font-semibold">Borrow against your holdings</p>
              <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Soon
              </span>
            </div>
            <p className="m-0 mt-1 text-[14px] leading-snug text-[var(--color-muted)]">
              Draw cash without selling, and keep every share you own.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="h-full w-0 rounded-full bg-[var(--color-up)]" />
            </div>
            <p className="num m-0 mt-2.5 text-[13px] text-[var(--color-faint)]">
              $0 borrowed of {usd(borrowingPower, 0)} available
            </p>
          </Card>
        </div>
      </section>

      <Sheet open={sheet === "receive"} onClose={() => setSheet(null)} title="Receive">
        <div className="px-4 pt-2">
          <p className="m-0 text-[15px] leading-relaxed text-[var(--color-muted)]">
            Send any supported asset from any chain to this address. It arrives as dollars, ready to invest.
          </p>
          <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-4">
            <p className="num m-0 break-all text-[14px] leading-relaxed">{ADDRESS}</p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => setSheet(null)}>Copy address</Button>
            <Button variant="quiet" onClick={() => setSheet(null)}>Buy with a card instead</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === "send"} onClose={() => setSheet(null)} title="Send">
        <div className="px-4 pt-2">
          <p className="m-0 text-[15px] leading-relaxed text-[var(--color-muted)]">
            Move money out whenever you want. No forms, no waiting, no asking us.
          </p>
          <div className="mt-4"><Button variant="ghost" onClick={() => setSheet(null)}>Close</Button></div>
        </div>
      </Sheet>
    </Screen>
  );
}
