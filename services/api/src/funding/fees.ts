import { SOLANA_CHAIN_ID, SOLANA_USDC } from "./relay.js";

/**
 * Mercury's fee on a deposit, as Relay's `appFees` takes it.
 *
 * Relay takes it out of what is sent, in the origin token, and credits it to an
 * EVM address as a USDC balance we claim later. The deposit itself is charged
 * nothing extra on top: what lands is simply 0.3% less.
 */
export interface DepositFee {
  /** The EVM address Relay credits, and the one that claims. */
  readonly recipient: string;
  readonly bps: number;
}

/**
 * Circle's own USDC on each chain we take deposits from, which is never
 * charged: Relay bridges it for nothing, so a fee there would be a fee for our
 * name on the deposit and not for any work.
 *
 * Checked against developers.circle.com/stablecoins/usdc-contract-addresses
 * on 15 October 2026. BNB Chain is absent on purpose: Circle issues no USDC
 * there, and what is called USDC is Binance's, bridged, which Relay has to
 * swap like anything else.
 */
export const CIRCLE_USDC: Readonly<Record<number, string>> = {
  [SOLANA_CHAIN_ID]: SOLANA_USDC,
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
  43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // Avalanche
  130: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", // Unichain
};

/*
 * EVM addresses compare without case, because checksumming is a display
 * convention and two wallets will disagree about it. A Solana mint is base58,
 * where case is the address, so it compares exactly.
 */
const isCircleUsdc = (chainId: number, address: string): boolean => {
  const usdc = CIRCLE_USDC[chainId];
  if (usdc === undefined) return false;
  return chainId === SOLANA_CHAIN_ID ? address === usdc : address.toLowerCase() === usdc.toLowerCase();
};

/**
 * What a deposit of this token is charged, or null for nothing.
 *
 * Nothing for Circle's USDC, nothing at a rate of zero, and nothing when no
 * recipient is configured — a fee with nobody to pay it would be taken out of
 * the deposit and credited to no one.
 */
export const depositFeeFor = (
  policy: { readonly bps: number; readonly recipient?: string | undefined },
  token: { readonly chainId: number; readonly address: string },
): DepositFee | null =>
  policy.recipient === undefined || policy.bps <= 0 || isCircleUsdc(token.chainId, token.address)
    ? null
    : { recipient: policy.recipient, bps: policy.bps };
