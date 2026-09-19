import { Anchor, Globe, Wallet } from "../ui/icons";

const NAV = ["How it works", "Baskets", "FAQs"];

export const TopBar = () => (
  <header className="flex items-center justify-between gap-6 border-b border-line bg-bar px-6 py-5 sm:px-8 lg:px-9 lg:py-6">
    <a href="/" className="group flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-[11px] bg-brand text-white transition-transform duration-300 ease-(--ease-out) group-hover:-rotate-6">
        <Anchor className="size-[21px]" />
      </span>
      <span className="text-[21px] font-bold tracking-[-0.02em]">Harbor</span>
    </a>

    <nav className="flex items-center">
      <ul className="hidden items-center lg:flex">
        {NAV.map((item) => (
          <li key={item} className="border-r border-line px-6 leading-none last:border-r-0">
            <a
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-[15px] text-ink-soft transition-colors hover:text-ink"
            >
              {item}
            </a>
          </li>
        ))}
        <li className="border-r border-l border-line px-6 leading-none">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[15px] text-ink-soft transition-colors hover:text-ink"
          >
            EN
            <Globe className="size-[17px]" />
          </button>
        </li>
      </ul>

      <button
        type="button"
        className="ml-2 flex shrink-0 items-center gap-2.5 rounded-[11px] bg-brand px-4 py-2.5 text-[14px] font-semibold whitespace-nowrap text-white transition-colors duration-200 hover:bg-brand-hover sm:px-5 sm:py-3 sm:text-[15px] lg:ml-4"
      >
        Connect wallet
        <Wallet className="size-[18px] opacity-85" />
      </button>
    </nav>
  </header>
);
