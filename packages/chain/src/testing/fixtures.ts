import jupSearchXStock from "./fixtures/jup-search-xstock.json";
import jupSearchOndo from "./fixtures/jup-search-ondo.json";
import jupSearchImpostors from "./fixtures/jup-search-impostors.json";
import jupPrice from "./fixtures/jup-price.json";
import jupQuote from "./fixtures/jup-quote.json";
import pythSpy from "./fixtures/pyth-spy.json";
import kaminoReserves from "./fixtures/kamino-reserves.json";
import rpcMintNvda from "./fixtures/rpc-mint-nvda.json";
import rpcTokenAccounts from "./fixtures/rpc-token-accounts.json";
import yahooChartNvda from "./fixtures/yahoo-chart-nvda.json";

export {
  jupSearchXStock,
  jupSearchOndo,
  jupSearchImpostors,
  jupPrice,
  jupQuote,
  pythSpy,
  kaminoReserves,
  rpcMintNvda,
  rpcTokenAccounts,
  yahooChartNvda,
};

/** The mints the fixtures are built around, so tests do not paste base58 by hand. */
export const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
export const SPYX_MINT = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const FIXTURE_OWNER = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
