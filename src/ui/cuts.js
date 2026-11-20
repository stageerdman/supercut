// Cuts: the time ranges that go, per part. [{ part: id, s, e, reason? }]. Pure, no DOM — tested in test/ui.test.mjs.
// The same list holds the user's own cuts and Magic's (Magic's carry a short `reason`); a word is cut when its middle is inside one.

/** The cut this word is inside, or undefined. (Pass only the cuts of its part.) */
export function cutAt(word, cuts) {
  const mid = (word.s + word.e) / 2;
  return cuts.find((c) => c.s <= mid && mid < c.e);
}

/** Is this word inside one of the cuts? (Pass only the cuts of its part.) */
export const isCut = (word, cuts) => !!cutAt(word, cuts);

/**
 * A Magic run's cuts join yours: your own cuts stay, the last run's are replaced (they carry a `reason`).
 * @param {Array<{part:number,s:number,e:number,reason?:string}>} cuts  the current list
 * @param {Array<{part:number,s:number,e:number,reason:string}>} magic  the new run's cuts
 */
export function withMagic(cuts, magic) {
  return [...cuts.filter((c) => !c.reason), ...magic.map(({ part, s, e, reason }) => ({ part, s, e, reason: reason || 'Magic' }))];
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
    return [c.s < s && { ...c, e: s }, e < c.e && { ...c, s: e }].filter(Boolean); // the pieces keep Magic's reason
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
