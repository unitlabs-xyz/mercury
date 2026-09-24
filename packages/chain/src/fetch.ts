/**
 * The global `fetch`, bound to the global object.
 *
 * Every adapter here keeps its fetch on an instance field so a test can inject
 * one, and calls it as `this.doFetch(...)`. That rebinds the receiver to the
 * adapter — and a browser's `window.fetch` throws
 *
 *   TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
 *
 * when its receiver is not the window. Node's fetch does not care, so an
 * unbound default passes every test and every server boot, and fails only in a
 * browser. These adapters run in both. Hence the bind.
 */
export const defaultFetch = (): typeof fetch => globalThis.fetch.bind(globalThis);
