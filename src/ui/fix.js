// Fixing and adding words. Text changes, timing doesn't: the new words share the old span, so cuts never move.
// Pure, no DOM. Rules: design/edit-model.md. Tested in test/edit.test.mjs.

/**
 * Replace words[from..to] (inclusive) with the words in `text`. Their times split the old span
 * [words[from].s, words[to].e] by letter count; each gets `fixed: true`. Empty text → no change.
 * @param {Array<{w:string,s:number,e:number,fixed?:boolean}>} words  one part's words
 * @returns the new array (or `words` itself when nothing changed)
 */
export function fixWords(words, from, to, text) {
  if (!(0 <= from && from <= to && to < words.length)) {
    throw new RangeError(`fixWords: words ${from}..${to} aren't in a part of ${words.length} words`);
  }
  const typed = text.split(/\s+/).filter(Boolean);
  if (!typed.length) return words;
  const s = words[from].s, span = words[to].e - s;
  const letters = typed.reduce((n, w) => n + w.length, 0);
  let at = 0;
  const fixed = typed.map((w) => {
    const start = s + (span * at) / letters;
    at += w.length;
    return { w, s: start, e: s + (span * at) / letters, fixed: true };
  });
  return [...words.slice(0, from), ...fixed, ...words.slice(to + 1)];
}
