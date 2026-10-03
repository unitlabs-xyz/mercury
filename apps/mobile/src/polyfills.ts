/**
 * Loaded before anything else, from the root layout.
 *
 * Hermes has no `crypto.getRandomValues` and no `TextEncoder`, and Privy's key
 * handling reaches for both the moment it initialises. Importing these late —
 * or from a screen rather than the entry — means whichever module ran first
 * already saw them missing.
 */
import "react-native-get-random-values";
import "fast-text-encoding";
import { Buffer } from "buffer";

/*
 * `@solana/web3.js` is written for Node and the browser, and reaches for
 * `Buffer` to serialise a transaction. Hermes has no such global. Assigned
 * rather than imported at each call site because web3.js reads the global from
 * inside its own modules, where our imports cannot reach.
 */
const withBuffer = globalThis as { Buffer?: typeof Buffer };
if (withBuffer.Buffer === undefined) withBuffer.Buffer = Buffer;
