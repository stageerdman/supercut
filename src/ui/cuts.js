// Cuts: the time ranges that go, per part. [{ part: id, s, e }]. Pure, no DOM — tested in test/ui.test.mjs.
// The same list holds the user's own cuts and Magic's; a word is cut when its middle is inside one.

/** Is this word inside one of the cuts? (Pass only the cuts of its part.) */
export function isCut(word, cuts) {
  const mid = (word.s + word.e) / 2;
  return cuts.some((c) => c.s <= mid && mid < c.e);
}

/**
 * Backspace on a selection of words from one part: all already cut → bring them back, else cut them all.
 * @param {Array<{part:number,s:number,e:number}>} cuts
 * @param {number} part
 * @param {Array<{s:number,e:number}>} words  the selected words, in order
 */
export function toggleCut(cuts, part, words) {
  if (!words.length) return cuts;
  const s = words[0].s, e = words[words.length - 1].e;
  const mine = cuts.filter((c) => c.part === part);
  if (!words.every((w) => isCut(w, mine))) return [...cuts, { part, s, e }];
  // Restore: take [s, e) out of every cut of this part, splitting a cut that spans past it.
  return cuts.flatMap((c) => {
    if (c.part !== part || c.e <= s || e <= c.s) return [c];
    return [c.s < s && { part, s: c.s, e: s }, e < c.e && { part, s: e, e: c.e }].filter(Boolean);
  });
}

/** Undo / redo over whole cut lists. */
export function createHistory(initial = []) {
  let past = [], now = initial, future = [];
  return {
    get now() { return now; },
    push(next) { if (next !== now) { past.push(now); now = next; future = []; } return now; },
    undo() { if (past.length) { future.push(now); now = past.pop(); } return now; },
    redo() { if (future.length) { past.push(now); now = future.pop(); } return now; },
    /** Drop one part's cuts everywhere (the part was removed). */
    forget(part) {
      const keep = (l) => l.filter((c) => c.part !== part);
      past = past.map(keep); future = future.map(keep); now = keep(now);
      return now;
    },
  };
}
