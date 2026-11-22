// Writing words: fix, add or remove text. Text changes, cuts never move. Pure, no DOM.
// Rules: design/missed-words.md ("Where words go"). Tested in test/edit.test.mjs and test/write.test.mjs.
import { wordsIn } from './selection.js';

export const MIN_ROOM = 0.1; // seconds: less free time than this is no room to put a word in

const said = (words) => words.map((w) => w.w).join(' ');
const typedWords = (text) => String(text ?? '').split(/\s+/).filter(Boolean);
/** Quotes in labels: the first three words, then "…". */
export const short = (text) => {
  const w = text.split(' ');
  return w.length > 3 ? `${w.slice(0, 3).join(' ')}…` : text;
};

/** The words in `typed`, sharing [s, e] by letter count, each `fixed: true`. */
function spread(typed, s, e) {
  const letters = typed.reduce((n, w) => n + w.length, 0);
  let at = 0;
  return typed.map((w) => {
    const start = s + ((e - s) * at) / letters;
    at += w.length;
    return { w, s: start, e: s + ((e - s) * at) / letters, fixed: true };
  });
}

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
  const typed = typedWords(text);
  if (!typed.length) return words;
  return [...words.slice(0, from), ...spread(typed, words[from].s, words[to].e), ...words.slice(to + 1)];
}

/** [s, e] narrowed to the unheard speech inside it (first start → last end), if there is enough of it. */
function narrow(s, e, unheard) {
  const inside = unheard.map((u) => ({ s: Math.max(s, u.s), e: Math.min(e, u.e) })).filter((u) => u.e - u.s > 1e-9);
  if (!inside.length) return { s, e };
  const n = { s: inside[0].s, e: inside.at(-1).e };
  return n.e - n.s >= MIN_ROOM ? n : { s, e };
}

/**
 * Where typing over `sel` goes, before anything is typed (the panel opens the field there).
 *   { replace: { from, to } }  the highlighted words, or (no room) the words the selection overlaps
 *   { insert: { at, s, e } }   no word highlighted: new words go in before words[at], on [s, e]
 *   null                       nothing to write into (no room, nothing overlapped)
 * @param {{s:number,e:number}} sel  the selection, in the part's time
 * @param {Array<{s:number,e:number}>} [unheard]  the part's unheard speech (unheard.js)
 */
export function writeTarget(words, sel, unheard = []) {
  const hit = wordsIn(sel, words);
  if (hit) return { replace: hit };
  const at = words.findIndex((w) => (w.s + w.e) / 2 > sel.e);
  const next = at < 0 ? words.length : at;
  const prev = words[next - 1], after = words[next];
  const s = Math.max(sel.s, prev?.e ?? -Infinity), e = Math.min(sel.e, after?.s ?? Infinity);
  if (e - s >= MIN_ROOM) return { insert: { at: next, ...narrow(s, e, unheard) } };
  const over = words.flatMap((w, i) => (w.s < sel.e && w.e > sel.s ? [i] : []));
  if (over.length) return { replace: { from: over[0], to: over.at(-1) } };
  return e - s > 1e-9 ? { insert: { at: next, s, e } } : null;
}

/**
 * Type `text` over the selection `sel`: the one write rule (design/missed-words.md, "Where written words go").
 * - Highlighted words are replaced. Typed words that match them at the start and the end keep their times; only the
 *   middle is re-timed: over the changed old words by letter count, or (only additions) into the gap between the
 *   kept words, narrowed to unheard speech. Removed middle words leave their time free.
 * - No word highlighted: the words fill the free time inside the selection (narrowed to unheard speech).
 * Every written word is `fixed: true`. Words outside the replaced ones never change; nothing overlaps.
 * @param {number} [length]  the part's length, the far edge of a gap after its last word
 * @returns {{words: Array, label: string} | null}  null: no change (empty text, same text, nowhere to put it)
 */
export function writeWords(words, sel, text, unheard = [], length) {
  const typed = typedWords(text);
  if (!typed.length) return null;
  const target = writeTarget(words, sel, unheard);
  if (!target) return null;
  if (target.insert) {
    const { at, s, e } = target.insert;
    return { words: [...words.slice(0, at), ...spread(typed, s, e), ...words.slice(at)], label: `Added “${short(typed.join(' '))}”` };
  }
  const { from, to } = target.replace;
  const old = words.slice(from, to + 1);
  let head = 0, tail = 0;
  while (head < old.length && head < typed.length && old[head].w === typed[head]) head++;
  while (tail < old.length - head && tail < typed.length - head && old[old.length - 1 - tail].w === typed[typed.length - 1 - tail]) tail++;
  const oldMid = old.slice(head, old.length - tail), newMid = typed.slice(head, typed.length - tail);
  const a = from + head, b = to - tail; // the changed old words: words[a..b] (empty when a > b)
  if (!oldMid.length && !newMid.length) return null; // same text
  const out = (mid) => [...words.slice(0, a), ...mid, ...words.slice(b + 1)];
  if (!newMid.length) return { words: out([]), label: `Removed text “${short(said(oldMid))}”` };
  if (oldMid.length) return { words: out(spread(newMid, words[a].s, words[b].e)), label: `Fixed “${short(said(old))}”` };
  // Only additions: into the gap between the kept words on each side.
  const s = words[a - 1]?.e ?? 0, e = words[a]?.s ?? length ?? -Infinity;
  if (e - s < MIN_ROOM) return { words: fixWords(words, from, to, typed.join(' ')), label: `Added “${short(newMid.join(' '))}”` };
  const room = narrow(s, e, unheard);
  return { words: out(spread(newMid, room.s, room.e)), label: `Added “${short(newMid.join(' '))}”` };
}

/** Take words[from..to] out of the transcript; the video stays. Their time is free again. */
export function removeText(words, from, to) {
  if (!(0 <= from && from <= to && to < words.length)) {
    throw new RangeError(`removeText: words ${from}..${to} aren't in a part of ${words.length} words`);
  }
  return { words: [...words.slice(0, from), ...words.slice(to + 1)], label: `Removed text “${short(said(words.slice(from, to + 1)))}”` };
}
