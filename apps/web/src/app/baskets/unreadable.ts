/**
 * One way of saying that something could not be read.
 *
 * The basket page had fifteen, in six grammatical shapes: "This basket is
 * unavailable right now", "Account balances are unavailable", "Refresh failed ·
 * showing last balances", "Partial read; value may be incomplete",
 * "Rebalance schedule is unavailable until portfolio status is known". Nine
 * independent panels, each with its own wording, and nothing stops several
 * rendering at once — so a flaky connection turned the page into a wall of
 * apologies in six voices, two of which explained our loading order to
 * somebody who can do nothing with it.
 *
 * The page already had the right two *shapes*: a block with a Retry where
 * there is nothing to show, and a one-line strip where there is something but
 * it is behind. What it did not have was one vocabulary. These three take the
 * noun and supply the sentence, which is the part that should never vary.
 */

/**
 * Nothing to show: the read failed and there is no earlier answer to fall
 * back on.
 *
 * "We could not" rather than "is unavailable", because the passive hides who
 * failed. It was us, and the Retry beside this sentence is the reader's move.
 */
export const unread = (what: string): string => `We could not read ${what}.`;

/**
 * There is something to show, but it is not current.
 *
 * No full stop and no capital noun: this renders inside a one-line strip with
 * a Retry link at the other end, not as a sentence in a block.
 */
export const stale = (what: string): string => `Could not refresh ${what} · showing the last reading`;

/**
 * Some of it arrived.
 *
 * The distinction is worth keeping: the figure on screen is real, it is just
 * lower than the truth. Saying only "could not be read" would have somebody
 * mistrust a number that is accurate as far as it goes.
 */
export const partial = (what: string): string => `We could not read some ${what}, so this may be low.`;
