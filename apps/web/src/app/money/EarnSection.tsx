import { useEarn } from "../../api/earn";
import { Button, ButtonLink } from "../../ui/Button";
import { InfoTip } from "../../ui/ds";
import { interestText, usd } from "@mercury/view";
import { VaultMark, rate } from "../earn/VaultMark";
import { usePanels } from "../Panels";

/**
 * What is in Earn, on the Money page: shown only once something is. One row
 * per vault, laid out like the borrow section's stock rows, with the two
 * verbs that matter. Picking or changing a vault happens on the Earn page.
 */
export const EarnSection = () => {
  const earn = useEarn();
  const panels = usePanels();
  const e = earn.data;
  if (!e || e.holdings.length === 0) return null;
  const idle = Math.floor(e.walletUsd * 100 + 1e-6) / 100;

  return (
    <section aria-label="Earn" className="min-w-0 rounded-xl bg-white p-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 pt-4 pb-[11px] text-[14px] leading-none sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="font-medium text-ds-ink">Earning</h2>
          <InfoTip label="How Earn works" align="start">
            Your USDC is lent out through Kamino vaults and earns interest by the second. The rate moves with
            demand. Withdraw any time. Not a bank account and not insured.
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-1">
          {idle >= 0.1 && (
            <Button variant="primary" onClick={() => panels.earn("add")}>
              Move {usd(idle)} in
            </Button>
          )}
          <Button onClick={() => panels.earn("withdraw")}>Withdraw</Button>
          <ButtonLink to="/earn">Vaults</ButtonLink>
        </div>
      </header>
      <div className="rounded-lg bg-ds-panel p-1">
        {e.holdings.map((h) => (
          <div key={h.address} className="flex h-[60px] items-center gap-3 rounded-md px-3 hover:bg-white/60">
            <VaultMark vault={h} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                {h.name}
              </span>
              <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                {rate(h.apy)} a year now
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                {usd(h.balanceUsd)}
              </span>
              <span
                className={`mt-0.5 block text-[12px] leading-4 ${h.earnedUsd > 0 ? "text-ds-up" : "text-ds-muted"}`}
              >
                {h.earnedUsd > 0 ? `+ ${interestText(h.earnedUsd)} earned` : "Just started"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
