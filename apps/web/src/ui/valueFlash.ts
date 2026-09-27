/**
 * The app-wide rule for a value that changes in place: when a figure, chip or
 * label already on screen is re-rendered with a different value (a refetch, a
 * new quote, a range switch), it dips to 40% and comes back to full over
 * 450ms, so the eye catches what moved. A value that comes back the same is
 * left alone, and so is anything appearing for the first time (a page, a row,
 * a skeleton turning into its figure).
 *
 * One observer on the document does this for every screen, rather than each
 * component opting in: React updates an existing text node in place, which is
 * exactly a `characterData` mutation, while new content arrives as new nodes,
 * which this ignores.
 *
 * Opt out with `data-no-flash` on any ancestor: charts (their dots animate on
 * their own) and anything whose text follows the pointer or a clock. Buttons
 * never flash: a label that changes ("Copy" → "Copied") is feedback on a
 * click, not a new value, and animates on its own if it needs to.
 */

const DIM = 0.4;
const MS = 450;

const running = new WeakMap<Element, Animation>();

const optedOut = (el: Element) =>
  el.closest("[data-no-flash], svg, input, textarea, select, button, [contenteditable]") !== null;

const flash = (el: Element) => {
  running.get(el)?.cancel();
  const a = el.animate([{ opacity: DIM }, { opacity: 1 }], {
    duration: MS,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });
  running.set(el, a);
  a.onfinish = () => running.delete(el);
};

export const startValueFlash = () => {
  if (typeof MutationObserver === "undefined" || typeof Element.prototype.animate !== "function") return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const observer = new MutationObserver((records) => {
    if (still.matches) return;
    // One flash per element per batch, however many of its text nodes changed.
    const changed = new Set<Element>();
    for (const r of records) {
      if (r.type !== "characterData" || r.oldValue === r.target.nodeValue) continue;
      const el = r.target.parentElement;
      if (el && el.isConnected && !optedOut(el)) changed.add(el);
    }
    changed.forEach(flash);
  });

  observer.observe(document.body, { subtree: true, characterData: true, characterDataOldValue: true });
  return () => observer.disconnect();
};
