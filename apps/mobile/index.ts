/*
 * The real entry, so the polyfills run before any route module does.
 *
 * They used to be the first import of `app/_layout.tsx`, which is first only
 * among that file's imports. Expo Router evaluates route modules in its own
 * order — `(tabs)/_layout.tsx` sorts ahead of `_layout.tsx` — so a tab layout
 * that reached Privy through the API client ran before `crypto` existed.
 */
import "./src/polyfills";
import "expo-router/entry";
