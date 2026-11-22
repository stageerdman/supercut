// The transcript in blocks: a part's words split at long pauses and sentence groups, so you can find your way.
// Pure, no DOM. Spec: design/transcript-panel.md § Blocks. Tested in test/panel.test.mjs.

export const LONG_PAUSE = 1.5; // s: always a new block
export const SENTENCE_WORDS = 30; // a sentence end after this many words → new block
export const LOOSE_WORDS = 80; // after this many, any pause of LOOSE_PAUSE will do
export const LOOSE_PAUSE = 0.4;
export const MAX_WORDS = 120; // no punctuation, no pauses: break anyway

export const endsSentence = (w) => /[.?!…]["'”’)]*$/.test(w);

/**
 * @param {Array<{w:string,s:number,e:number}>} words
 * @returns {Array<{from:number,to:number}>} word index ranges, inclusive, covering every word in order
 */
export function blocksOf(words) {
  const out = [];
  let from = 0;
  for (let k = 1; k < words.length; k++) {
    const n = k - from, gap = words[k].s - words[k - 1].e;
    const breakHere = gap >= LONG_PAUSE
      || (n >= SENTENCE_WORDS && endsSentence(words[k - 1].w))
      || (n >= LOOSE_WORDS && gap >= LOOSE_PAUSE)
      || n >= MAX_WORDS;
    if (breakHere) { out.push({ from, to: k - 1 }); from = k; }
  }
  if (words.length) out.push({ from, to: words.length - 1 });
  return out;
}
