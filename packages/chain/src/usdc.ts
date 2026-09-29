/**
 * The dollar, on Solana.
 *
 * These lived inside the Jupiter Ultra adapter, which is where they were first
 * needed. They are not Jupiter's — the wallet-events job, the money routes and
 * the borrow routes all read them — so they outlived the file and now sit on
 * their own.
 */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
