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
