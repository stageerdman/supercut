// Cuts: the time ranges that go, per part, in source time. [{ part: id, s, e, by: 'you' | 'magic', reason? }].
// Pure, no DOM. Rules: design/edit-model.md. Tested in test/edit.test.mjs.
// Every function returns a normalized list: per part sorted, never overlapping, no gap or cut under a frame.
// `lengths` is { [partId]: seconds } where known; cuts are clamped to it.
import { FRAME } from './bit.js';

const EPS = 1e-9; // float slack, so a cut of exactly one frame counts as one

/** The cut this word is inside (by its middle), or undefined. (Pass only the cuts of its part.) */
export function cutAt(word, cuts) {
  const mid = (word.s + word.e) / 2;
  return cuts.find((c) => c.s <= mid && mid < c.e);
}

/** Is this word inside one of the cuts? (Pass only the cuts of its part.) */
export const isCut = (word, cuts) => !!cutAt(word, cuts);

export const cutsOf = (cuts, part) => cuts.filter((c) => c.part === part);

const make = (part, s, e, by, reason) => (reason ? { part, s, e, by, reason } : { part, s, e, by });
const long = (c) => c.e - c.s >= FRAME - EPS;
const clamp = (c, len = Infinity) => ({ ...c, by: c.by ?? 'you', s: Math.max(0, c.s), e: Math.min(len, c.e) });
/** Two cuts become one: yours if either was (you touched it); a reason survives. */
const merge = (a, b) =>
  make(a.part, a.s, Math.max(a.e, b.e), a.by === 'you' || b.by === 'you' ? 'you' : 'magic', a.reason ?? b.reason);

/**
 * Sort, clamp, drop slivers, merge overlaps and gaps under a frame. Cuts of different owners that only touch
 * stay two cuts (so Magic's next run can still replace its own), with any sliver gap closed.
 */
export function normalize(cuts, lengths = {}) {
  const sorted = cuts.map((c) => clamp(c, lengths[c.part])).filter(long).sort((a, b) => a.part - b.part || a.s - b.s);
  const out = [];
  for (const c of sorted) {
    const last = out.at(-1);
    if (!last || last.part !== c.part || c.s - last.e >= FRAME - EPS) out.push(c);
    else if (c.s < last.e - EPS || last.by === c.by) out[out.length - 1] = merge(last, c);
    else out.push({ ...c, s: last.e });
  }
  return out.filter(long);
}

/** Take [s, e) out of every cut of that part, splitting a cut that spans past it. The pieces keep owner and reason. */
function subtract(cuts, { part, s, e }) {
  return cuts.flatMap((c) => {
    if (c.part !== part || c.e <= s || e <= c.s) return [c];
    return [c.s < s && { ...c, e: s }, e < c.e && { ...c, s: e }].filter(Boolean);
  });
}

export const cutRange = (cuts, { part, s, e }, lengths) => normalize([...cuts, make(part, s, e, 'you')], lengths);
export const restoreRange = (cuts, range, lengths) => normalize(subtract(cuts, range), lengths);

/**
 * The time range words stand for: from the middle of the pause before the first to the middle of the pause after
 * the last. A part's first word reaches back to 0, its last on to the part's end (a trim). Cutting and restoring
 * both use it, so ⌫ twice gets back exactly what was there.
 * @param {Array<{s:number,e:number}>} picked  consecutive words of one part, in order
 * @param {Array<{s:number,e:number}>} words  all of that part's words
 * @param {number} [length]  the part's length; unknown → the last word's end
 */
export function wordRange(picked, words, length) {
  const i = words.findIndex((w) => w.s === picked[0]?.s);
  const j = words.findIndex((w) => w.s === picked.at(-1)?.s);
  if (i < 0 || j < i) throw new RangeError(`wordRange: the picked words (${picked.length}) aren't in this part's words`);
  const s = i === 0 ? 0 : (words[i - 1].e + words[i].s) / 2;
  const e = j === words.length - 1 ? (length ?? words[j].e) : (words[j].e + words[j + 1].s) / 2;
  return { s, e };
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const seconds = ({ s, e }) => `${(e - s).toFixed(1)} s`;

/**
 * ⌫ on words of one part: all already cut → restore their range, else cut it.
 * @returns {{cuts: Array, label: string}}  label for the history: "Cut 3 words" / "Restored 3 words"
 */
export function toggleWords(cuts, part, picked, words, lengths = {}) {
  if (!picked.length) return { cuts, label: '' };
  const range = { part, ...wordRange(picked, words, lengths[part]) };
  const what = plural(picked.length, 'word');
  return picked.every((w) => isCut(w, cutsOf(cuts, part)))
    ? { cuts: restoreRange(cuts, range, lengths), label: `Restored ${what}` }
    : { cuts: cutRange(cuts, range, lengths), label: `Cut ${what}` };
}

/** Is all of [s, e) of that part already cut? (cuts normalized) */
const covered = (cuts, { part, s, e }) => {
  let at = s;
  for (const c of cutsOf(cuts, part)) if (c.s <= at + EPS && c.e > at) at = c.e;
  return at >= e - EPS;
};

/** ⌫ on a time range from the timeline: all already cut → restore it, else cut it. */
export function toggleRange(cuts, range, lengths = {}) {
  return covered(cuts, range)
    ? { cuts: restoreRange(cuts, range, lengths), label: `Restored ${seconds(range)}` }
    : { cuts: cutRange(cuts, range, lengths), label: `Cut ${seconds(range)}` };
}

/**
 * Drag one edge of a cut to time t. Under a frame it's gone; into a neighbour they merge; a Magic cut becomes yours.
 * Call it on the drag-start list each move, so nothing accumulates.
 * @param {object} cut  the cut itself (found by identity in `cuts`)
 * @param {'s'|'e'} side
 */
export function moveEdge(cuts, cut, side, t, lengths = {}) {
  if (!cuts.includes(cut)) throw new RangeError('moveEdge: that cut is not in this list');
  const moved = { ...cut, [side]: t, by: 'you' };
  return normalize(cuts.map((c) => (c === cut ? moved : c)), lengths);
}

/**
 * A Magic run: the last run's cuts go, yours stay (incl. Magic cuts you changed), the new ones come in
 * minus any time you've cut already.
 * @param {Array<{part:number,s:number,e:number,reason?:string}>} magic  the run's cuts (auto_cut's result)
 */
export function withMagic(cuts, magic, lengths = {}) {
  const yours = cuts.filter((c) => c.by !== 'magic');
  const fresh = magic.map(({ part, s, e, reason }) => make(part, s, e, 'magic', reason || 'Magic Cut'));
  return normalize([...yours, ...yours.reduce(subtract, fresh)], lengths);
}
