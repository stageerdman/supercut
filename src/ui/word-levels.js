// Which words the timeline strip can show at this zoom, and where: whole words when zoomed in, the first words of
// each phrase in the middle, no text far out. A label is drawn whole or not at all, never overlaps another label, a
// pause block, a cut or the part's end, and always starts at its first word's time. Pure, no DOM.
// Spec: design/timeline-words-by-zoom.md. Tested in test/word-levels.test.mjs.
import { cutAt, cutsOf } from './cuts.js';
import { endsSentence, LOOSE_PAUSE } from './blocks.js';
import { MIN_W } from './cut-view.js';

export const WORDS_AT = 32; // points per word: every word has room from here
export const WORDS_DOWN = 28; // …and keeps it down to here (hysteresis, so a pinch on the line doesn't flicker)
export const PHRASES_AT = 5;
export const PHRASES_DOWN = 4;
export const GAP = 6; // points between a label and whatever comes next
export const INSET = 1; // a label starts this far right of its word's start
const PAUSE_MIN = 2; // a pause block is drawn at least this wide (strip-view.js)
const ELLIPSIS = '…';

const spans = new WeakMap(); // words → { span, n }

/** Average seconds per word over all parts (each part's first start to last end, summed, ÷ all words); null if none. */
export function secondsPerWord(wordsByPart) {
  let span = 0, n = 0;
  for (const words of wordsByPart) {
    if (!words?.length) continue;
    let hit = spans.get(words);
    if (!hit) spans.set(words, (hit = { span: words.at(-1).e - words[0].s, n: words.length }));
    span += hit.span;
    n += hit.n;
  }
  return n ? span / n : null;
}

/**
 * 'words' | 'phrases' | 'none' for this many points per word. `previous` is the level now shown: crossing back down
 * takes a little more than crossing up (32 up / 28 down, 5 up / 4 down).
 */
export function levelFor(ppw, previous) {
  if (ppw == null || !(ppw > 0)) return 'none';
  if (ppw >= WORDS_AT || (previous === 'words' && ppw >= WORDS_DOWN)) return 'words';
  if (ppw >= PHRASES_AT || ((previous === 'words' || previous === 'phrases') && ppw >= PHRASES_DOWN)) return 'phrases';
  return 'none';
}

/** Is this word kept (not inside one of these cuts, by its middle, and not starting inside one)? */
const kept = (w, mine) => !cutAt(w, mine) && !mine.some((c) => c.s <= w.s && w.s < c.e);

/**
 * Indices of the words a phrase starts at: the part's first kept word, a word after one ending a sentence, after a
 * gap of LOOSE_PAUSE or more, and the first kept word after a cut. Only kept words. (Pass only this part's cuts.)
 */
export function phraseStarts(words = [], cuts = []) {
  const out = [];
  let prevKept = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const isKept = kept(w, cuts);
    if (isKept) {
      const prev = words[i - 1];
      if (!prev || !prevKept || endsSentence(prev.w) || w.s - prev.e >= LOOSE_PAUSE - 1e-9) out.push(i);
    }
    prevKept = isKept;
  }
  return out;
}

// Per words list, recomputed when the cuts change: which words are kept, and each level's candidates (a crossfade
// lays out two levels a frame). For phrases also where each one stops (the next start, or the first cut word).
const memo = new WeakMap(); // words → { cuts, part, keep, words?, phrases?, stops? }
function candidates(words, cuts, part, level) {
  let hit = memo.get(words);
  if (!hit || hit.cuts !== cuts || hit.part !== part) {
    const mine = cutsOf(cuts, part);
    memo.set(words, (hit = { cuts, part, mine, keep: words.map((w) => kept(w, mine)) }));
  }
  if (!hit[level]) {
    if (level === 'words') hit.words = hit.keep.flatMap((k, i) => (k ? [i] : []));
    else {
      hit.phrases = phraseStarts(words, hit.mine);
      hit.stops = hit.phrases.map((i, n) => {
        const stop = hit.phrases[n + 1] ?? words.length;
        let j = i;
        while (j < stop && hit.keep[j]) j++;
        return j;
      });
    }
  }
  return hit;
}

/** Index of the first value in the sorted list with key(v) ≥ x. */
function lowerBound(list, x, key) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (key(list[m]) < x) lo = m + 1; else hi = m;
  }
  return lo;
}

/**
 * The labels of one part in view at this level: [{ key, x, text }], x in view points (the text's left edge).
 * @param {object} o
 * @param {{id:number, x:number, w:number, len:number}} o.box  the part's place on the timeline
 * @param {Array<{w:string,s:number,e:number}>} o.words  its words, in order
 * @param {Array} o.cuts  all cuts (only this part's are used)
 * @param {Array<{s:number,e:number}>} o.pauses  its pause blocks
 * @param {number} o.scroll  view's left edge in content points
 * @param {number} o.width  view width
 * @param {'words'|'phrases'|'none'} o.level
 * @param {(text:string) => number} o.measure  the drawn width of a text
 */
export function layoutLabels({ box, words = [], cuts = [], pauses = [], scroll, width, level, measure }) {
  if (level === 'none' || !words.length || !(box.len > 0)) return [];
  const k = box.w / box.len;
  const X = (t) => box.x + t * k - scroll;
  const end = X(box.len);
  if (end < 0 || box.x - scroll > width) return [];

  const memoed = candidates(words, cuts, box.id, level);
  const list = memoed[level];
  const at = (i) => X(words[i].s) + INSET;
  // One candidate before the view, so a label that starts off screen and reaches into it is still drawn.
  const from = Math.max(0, lowerBound(list, 0, at) - 1);
  if (from >= list.length) return [];

  // Everything a label can't run into, as [x0, x1) in view points, by x0: the pause blocks and cuts from there on.
  const x0 = at(list[from]) - INSET;
  const blocks = [
    ...pauses.map((p) => [X(p.s), X(p.s) + Math.max(PAUSE_MIN, (p.e - p.s) * k)]),
    ...memoed.mine.map((c) => [X(c.s), X(c.s) + Math.max(MIN_W, (c.e - c.s) * k)]),
  ].filter(([, e]) => e > x0).sort((a, b) => a[0] - b[0]);
  // Labels come in x order, so one pointer walks the blocks: those starting at or before x are behind (the furthest
  // one's end says whether x is inside one), the one at the pointer is the next obstacle.
  let b = 0, reach = -Infinity;

  const space = measure(' '), dots = measure(ELLIPSIS);
  const out = [];
  for (let c = from; c < list.length; c++) {
    const i = list[c];
    const x = at(i), t = x - INSET;
    if (x > width) break;
    while (b < blocks.length && blocks[b][0] <= t) reach = Math.max(reach, blocks[b++][1]);
    if (reach > t || t >= end) continue;
    const next = c + 1 < list.length ? at(list[c + 1]) : Infinity;
    const room = Math.min(next, blocks[b]?.[0] ?? end, end) - GAP - x;
    const text = level === 'words'
      ? fitWord(words[i].w, room, measure)
      : fitPhrase(words, i, memoed.stops[c], room, { measure, space, dots });
    if (text) out.push({ key: `${box.id}:${i}`, x, text });
  }
  return out;
}

const fitWord = (w, room, measure) => (measure(w) <= room ? w : '');

/** As many whole words of the phrase [i, j) as fit the room, then "…" if it goes on (the "…" must fit too). */
function fitPhrase(words, i, j, room, { measure, space, dots }) {
  let n = 0, more = false, w = 0;
  for (let m = 1; i + m <= j; m++) {
    w += (m > 1 ? space : 0) + measure(words[i + m - 1].w);
    if (w > room) break;
    if (i + m === j) { n = m; more = false; } else if (w + dots <= room) { n = m; more = true; }
  }
  return n ? words.slice(i, i + n).map((x) => x.w).join(' ') + (more ? ELLIPSIS : '') : '';
}
