import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon, unichain } from "viem/chains";

/**
 * The chains somebody can connect a wallet on, and therefore the chains we can
 * accept a deposit from.
 *
 * Relay will take a deposit from 61, which is why `/v1/money/fund/sources`
 * reports all of them — the server's job is to say what Relay supports, not to
 * guess what this client can sign. This list is the other half of that answer,
 * and it is deliberately the smaller one: a wallet can only switch to a network
 * the app has declared, so offering a chain that is not here would be offering
 * a row that cannot be taken.
 *
 * Eight EVM chains plus Solana carry nearly all of the value anybody is likely
 * to arrive holding. Adding another is one import and one entry, and the
 * picker picks it up without further change — which is the property worth
 * having, since the alternative is a hardcoded list somewhere that drifts.
 */
export const EVM_NETWORKS = [mainnet, base, arbitrum, optimism, polygon, bsc, avalanche, unichain] as const;

/** Relay's own id for Solana, which is not an EVM chain id and never collides. */
export const SOLANA_CHAIN_ID = 792703809;

/**
 * Which Relay chain ids this client can sign for.
 *
 * It no longer filters the deposit picker — the server decides what we offer,
 * in services/api/src/funding/chains.ts, so that the set can be changed
 * without a frontend release. This is the other half of that: what a
 * *connected wallet* may be on, used to read a funder's chain and to build
 * AppKit's network list.
 *
 * The two must agree, and nothing at runtime makes them: a chain the server
 * offers that is missing here is a row that fails after somebody picks it.
 * `services/api/src/funding/chains.test.ts` reads this file and holds them
 * together.
 */
export const CONNECTABLE_CHAIN_IDS: ReadonlySet<number> = new Set<number>([
  ...EVM_NETWORKS.map((c) => c.id),
  SOLANA_CHAIN_ID,
]);

/*
 * Solana's own network definition is imported where AppKit is configured
 * rather than re-exported here: its inferred type reaches into viem's package
 * path, and a re-export makes that path part of this module's public type —
 * which TypeScript rightly calls not portable.
 */
