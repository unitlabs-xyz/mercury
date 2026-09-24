Recorded by `node packages/chain/src/testing/record.ts` against live mainnet upstreams.

`rpc-token-accounts.json` is the exception: it is written by hand, because no wallet
we control held xStocks when these were recorded. Its shape follows Solana's
`getTokenAccountsByOwner` with `encoding: "jsonParsed"`. It carries a Token-2022
holding, a classic SPL USDC holding and a zero-balance account, which are the three
cases `SolanaRpc.tokenBalances` has to get right. Replace it with a recording the
first time a funded wallet exists.
