// Search the transcript: every match of a word or phrase, ignoring case and punctuation. Pure, no DOM.
// Spec: design/transcript-panel.md § Search. Tested in test/panel.test.mjs.

/** "Gonna," → "gonna"; "don't" → "dont". Letters and digits only, lower case. */
export const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, '');

/**
 * Every match, in reading order.
 * @param {Array<{id:number, words:Array<{w:string,s:number}>}>} parts
 * @param {string} query
 * @returns {Array<{id:number, from:number, to:number, s:number}>} word ranges (inclusive) and the first word's time
 */
export function findMatches(parts, query) {
  const q = norm(query).trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const out = [];
  for (const { id, words } of parts) {
    // One string per part, words joined by a space, with where each word starts.
    const starts = [];
    let text = '';
    for (const w of words) {
      starts.push(text.length);
      const n = norm(w.w).replace(/\s+/g, '');
      if (n) text += n + ' '; // a bare "—" takes no room, so "a — b" still matches "a b"
    }
    const wordAt = (c) => { // the word holding character c (binary search)
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; starts[m] <= c ? (lo = m) : (hi = m - 1); }
      return lo;
    };
    for (let c = text.indexOf(q); c >= 0; c = text.indexOf(q, c + 1)) {
      const from = wordAt(c), to = wordAt(c + q.length - 1);
      if (out.at(-1)?.id === id && out.at(-1).from === from) continue; // "aa" in "aaa": one match per word
      out.push({ id, from, to, s: words[from].s });
    }
  }
  return out;
}

/** The match to start on: the first at or after the playhead (part index order given by `order`), else the first. */
export function firstFrom(matches, order, at) {
  const k = matches.findIndex((m) => {
    const i = order.indexOf(m.id);
    return i > at.i || (i === at.i && m.s >= at.t - 0.05);
  });
  return matches.length ? Math.max(0, k) : -1;
}

/** Step `d` (±1) through `n` matches, wrapping. */
export const stepMatch = (k, d, n) => (n ? (((k + d) % n) + n) % n : -1);

/** "2/5", or "0/0" with none. */
export const countText = (k, n) => (n ? `${k + 1}/${n}` : '0/0');
