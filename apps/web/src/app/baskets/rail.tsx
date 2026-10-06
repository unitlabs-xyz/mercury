import { ArrowRight } from "../../ui/icons";
import { RailCard, RailHead } from "../../ui/ds";
import { RailList } from "../invest/Rail";

const steps = [
  ["Choose a strategy", "Each template sets target weights for Solana tokenized assets."],
  ["You own the assets", "The holdings live in your own smart account, not in one pooled basket token."],
  ["Glider rebalances daily", "Glider works toward the target weights as market prices move."],
] as const;

/** The Invest rail's card rhythm, with Glider ownership explained accurately. */
export const BasketsRail = ({ onExplore }: { onExplore: () => void }) => (
  <aside aria-label="Baskets information" className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-1">
    <RailList label="Your baskets" meta="On Glider">
      <div className="flex min-h-[182px] flex-col items-center justify-center px-6 py-5 text-center">
        <p className="text-[14px] font-medium text-ds-ink">Portfolio tracking is coming to Mercury.</p>
        <p className="mt-2 max-w-[30ch] text-[12px] leading-relaxed text-ds-muted">
          Your Glider portfolios remain in your own smart account. We cannot show their balances here yet.
        </p>
        <button
          type="button"
          onClick={onExplore}
          className="mt-4 rounded-full border border-ds-divider bg-white px-4 py-2 text-[12px] font-medium text-ds-ink hover:bg-ds-panel"
        >
          Explore strategies
        </button>
      </div>
    </RailList>

    <RailCard label="How baskets work">
      <RailHead title="How baskets work" />
      <ol className="mt-5 space-y-5">
        {steps.map(([title, body], index) => (
          <li key={title} className="grid grid-cols-[30px_minmax(0,1fr)] gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-ds-panel text-[12px] font-medium text-ds-ink">
              {index + 1}
            </span>
            <span className="pt-0.5">
              <span className="block text-[14px] font-medium text-ds-ink">{title}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ds-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <a
        href="https://glider.fi"
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-ds-link hover:opacity-80"
      >
        Learn about Glider <ArrowRight className="size-3.5" />
      </a>
    </RailCard>

    <section
      aria-label="Explore strategies"
      className="min-h-[214px] overflow-hidden rounded-xl border-[3px] border-white bg-[#eaf9f8] bg-cover bg-center px-6 py-7 shadow-sm"
      style={{ backgroundImage: "url('/baskets/themes/7.webp')" }}
    >
      <h2 className="max-w-[230px] text-[20px] leading-tight font-medium text-ds-ink">
        A simpler way to invest
      </h2>
      <p className="mt-2 max-w-[200px] text-[13px] leading-relaxed text-ds-muted">
        Discover curated ideas, powered by Glider on Solana.
      </p>
      <button
        type="button"
        onClick={onExplore}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-ds-ink px-5 py-2 text-[12px] font-medium text-white hover:bg-black"
      >
        Explore strategies <ArrowRight className="size-3.5" />
      </button>
    </section>
  </aside>
);
