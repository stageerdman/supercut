// Pauses: the silences between words that are worth cutting, per part, in source time. Pure, no DOM.
// Spec: design/timeline-strip.md. Tested in test/timeline.test.mjs.
// A pause is the gap between two words minus a short breath on each side, so cutting it never butts two words
// together. Before the first word and after the last it runs from / to the part's end (a trim), breath kept by the word.
import { cutsOf } from './cuts.js';

export const BREATH = 0.1; // seconds kept next to each word
export const MIN_PAUSE = 0.2; // shorter blocks aren't shown: that's just speech

const memo = new WeakMap();

/**
 * [{ s, e }] in time order. `length` unknown → no pause after the last word.
 * @param {Array<{s:number,e:number}>} words  one part's words, in order
 */
export function pauses(words = [], length) {
  const hit = memo.get(words);
  if (hit && hit.length === length) return hit.list;
  const list = [];
  const add = (s, e) => e - s >= MIN_PAUSE - 1e-9 && list.push({ s, e });
  if (words.length) {
    add(0, words[0].s - BREATH);
    for (let i = 1; i < words.length; i++) add(words[i - 1].e + BREATH, words[i].s - BREATH);
    if (length) add(words.at(-1).e + BREATH, length);
  }
  memo.set(words, { length, list });
  return list;
}

/**
 * Is all of this pause cut? Then the cut at its middle (for the owner's colour), else undefined. A pause only half
 * inside a word cut is not cut: ⌫ cuts the rest. Touching cuts (yours next to Magic's) count together, as ⌫ does.
 */
export function pauseCut(p, part, cuts) {
  let at = p.s, mid;
  const m = (p.s + p.e) / 2;
  for (const c of cutsOf(cuts, part)) {
    if (c.s <= at + 1e-6 && c.e > at) at = c.e;
    if (c.s <= m && m < c.e) mid = c;
  }
  return at >= p.e - 1e-6 ? mid : undefined;
}
