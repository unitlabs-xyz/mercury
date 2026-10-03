/**
 * What both clients compute, computed once.
 *
 * Everything here is a pure function or a renderer-agnostic React hook: no DOM,
 * no React Native, no storage, no fetch. `tsconfig.json` leaves `DOM` out of
 * `lib` so that is enforced by the compiler rather than by anyone remembering —
 * a file that reaches for `document` or `localStorage` stops building here.
 *
 * The reason is the same one that made the server compute one portfolio value
 * for both the chart and the page's headline: two implementations of one
 * question are two answers to it, and the place it shows is a phone and a
 * browser disagreeing about what somebody owns.
 */
export * from "./format.js";
export * from "./activity-data.js";
export * from "./activity-map.js";
export * from "./decision.js";
export * from "./order.js";
export * from "./qr.js";
export * from "./activity-filters.js";
export * from "./refuse-copy.js";
