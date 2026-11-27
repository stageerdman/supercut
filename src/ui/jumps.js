// Jumps: where playing leaves the kept time and where it lands (over a cut, or from a part's end into the next part).
// Pure: parts, cuts and the part lengths come in. Tested in test/jumps.test.mjs.
import { skipTarget, firstKept } from './playback.js';
import { cutsOf } from './cuts.js';

const EPS = 1e-6;

/**
 * The timeline as the player walks it. `lenOf(i)`: part i's length (the loaded file's when known).
 * Every cut is jumped over, the one playing starts in too.
 */
export function createJumps({ parts, cuts, lenOf }) {

  /** The first kept moment after part `i`: { i, t }, or null when the rest is all cut. */
  function nextKept(i) {
    for (let k = i + 1; k < parts.length; k++) {
      const at = firstKept(cuts, parts[k].id, parts[k].duration || Infinity);
      if (at != null) return { i: k, t: at };
    }
    return null;
  }

  /** Where playing lands from `from` in part `i`, over the cut there and any touching it: { i, t }, or null (stop). */
  function landing(i, from) {
    const id = parts[i].id, len = lenOf(i);
    let to = from, r = skipTarget(id, to, cuts, len);
    for (let n = 0; r?.t != null && n < 1000; n++) { to = r.t; r = skipTarget(id, to, cuts, len); }
    return r?.end || to >= len - EPS ? nextKept(i) : { i, t: to };
  }

  /** The next jump after `t` in part `i`: { at, dest }: it leaves at `at` (a cut's start or the part's end) for
   * `dest`, null when playing stops there. */
  function next(i, t) {
    const len = lenOf(i);
    const cut = cutsOf(cuts, parts[i].id).find((c) => c.s > t + EPS);
    const at = Math.min(cut?.s ?? Infinity, len);
    return { at, dest: at >= len - EPS && !cut ? nextKept(i) : landing(i, at) };
  }

  return { nextKept, landing, next };
}
