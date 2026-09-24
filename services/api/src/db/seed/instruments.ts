/**
 * Our editorial layer over what Jupiter knows. Jupiter supplies the name on the
 * token ("NVIDIA xStock"); this supplies the name of the company, the sector and
 * the sentence that says what it does.
 *
 * A ticker missing from here is still listed — the name falls back to the
 * issuer's, minus the wrapper suffix, and the sector to "Other". That is what
 * keeps a newly listed xStock from disappearing until someone writes a line here.
 *
 * `apps/web/src/market/meta.ts` holds the same content for the browser. Once the
 * web app reads `name` and `sector` from GET /v1/instruments, delete that file;
 * until then the two are kept in step by hand.
 */
export interface InstrumentMetaEntry {
  readonly name: string;
  readonly sector: string;
  readonly about: string;
}

export const INSTRUMENT_META: Readonly<Record<string, InstrumentMetaEntry>> = {
  NVDA: {
    name: "Nvidia",
    sector: "Semiconductors",
    about: "Designs the graphics and AI accelerators most large models are trained on.",
  },
  AAPL: {
    name: "Apple",
    sector: "Technology",
    about: "iPhone, Mac and a services business that now earns more than most companies do in total.",
  },
  MSFT: {
    name: "Microsoft",
    sector: "Technology",
    about: "Windows, Office and Azure — the second largest cloud business in the world.",
  },
  GOOGL: {
    name: "Alphabet",
    sector: "Technology",
    about: "Search, YouTube, Android and a cloud business growing into third place.",
  },
  META: {
    name: "Meta",
    sector: "Technology",
    about: "Facebook, Instagram and WhatsApp, funded almost entirely by advertising.",
  },
  AMZN: {
    name: "Amazon",
    sector: "Technology",
    about: "The largest online retailer in the world, and the cloud business that pays for it.",
  },
  INTC: {
    name: "Intel",
    sector: "Semiconductors",
    about: "The company that made the x86 processor, now spending heavily to make chips for others.",
  },
  PLTR: {
    name: "Palantir",
    sector: "Technology",
    about: "Data analysis software, sold mostly to governments and large enterprises.",
  },
  TSLA: {
    name: "Tesla",
    sector: "Consumer",
    about:
      "Electric vehicles, energy storage and an autonomy programme the share price has long been valued on more than the cars.",
  },
  MCD: {
    name: "McDonald's",
    sector: "Consumer",
    about: "The largest restaurant chain in the world, and mostly a property business.",
  },
  GME: {
    name: "GameStop",
    sector: "Consumer",
    about: "A video game retailer, and the stock that made retail coordination a market force.",
  },
  COIN: {
    name: "Coinbase",
    sector: "Financials",
    about: "The largest listed crypto exchange in the United States.",
  },
  HOOD: {
    name: "Robinhood",
    sector: "Financials",
    about: "Commission-free brokerage, and the app that made retail trading mainstream.",
  },
  CRCL: {
    name: "Circle",
    sector: "Financials",
    about: "Issuer of USDC, the stablecoin this account holds your cash in.",
  },
  MSTR: {
    name: "Strategy",
    sector: "Financials",
    about:
      "A software company that holds bitcoin on its balance sheet, and trades more on that holding than on the software.",
  },
  STRC: {
    name: "Strategy Preferred",
    sector: "Financials",
    about: "Strategy's preferred stock, which pays a monthly dividend.",
  },
  "BRK.B": {
    name: "Berkshire Hathaway",
    sector: "Financials",
    about: "Insurance, railroads, energy and a famous equity portfolio.",
  },
  SPY: {
    name: "S&P 500",
    sector: "Index funds",
    about:
      "The five hundred largest listed companies in the United States, weighted by market value. The default answer for someone who does not want to pick.",
  },
  QQQ: {
    name: "Nasdaq 100",
    sector: "Index funds",
    about:
      "The hundred largest non-financial companies on the Nasdaq. Heavier in technology than the S&P 500, and more volatile for it.",
  },
  GLD: { name: "Gold", sector: "Commodities", about: "Physical gold, held in a vault, divided into shares." },
  SPCX: {
    name: "SpaceX",
    sector: "Private markets",
    about: "Pre-IPO exposure to SpaceX, which is not listed on any exchange.",
  },
  VIDA: { name: "Vida", sector: "Healthcare", about: "A healthcare company focused on respiratory imaging." },
};
