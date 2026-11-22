// The transcript follows the playhead: the lit word stays in view, about a third from the top. Scrolling the panel
// yourself pauses that for 4 s. Pure, no DOM. Spec: design/transcript-editing.md. Tested in test/transcript.test.mjs.

export const PAUSE_MS = 4000;

/** @param {() => number} now  ms clock (Date.now in the app, a fake in tests) */
export function createFollow(now = Date.now) {
  let last = -Infinity;
  return {
    /** The user scrolled (wheel, scrollbar, keys) or worked in the panel. */
    scrolled() { last = now(); },
    /** May the panel scroll to the lit word now? */
    get on() { return now() - last >= PAUSE_MS; },
  };
}

/**
 * Where to scroll so a word at `top` (px from the content top, `h` tall) is comfortably in view, or null if it is.
 * Comfortable: between 10 % and 80 % of the box. Out of it → put the word a third from the top.
 */
export function followTarget(top, h, scrollTop, boxH) {
  const y = top - scrollTop;
  if (y >= 0.1 * boxH && y + h <= 0.8 * boxH) return null;
  return Math.max(0, Math.round(top - boxH / 3));
}
